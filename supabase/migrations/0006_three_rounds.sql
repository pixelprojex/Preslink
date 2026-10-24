-- One play is now three lights. Each round has its own random target on the bar and start
-- phase; the sweep is slower (850-1050 ms). The play score is the average of the three rounds,
-- which keeps 900+ rare without punishing one unlucky tap.

alter table public.plays add column if not exists rounds jsonb;
alter table public.plays add column if not exists taps jsonb;

create or replace function public.round_score(p_tap_ms integer, p_phase double precision, p_target double precision, p_speed_ms integer)
returns integer
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_x   double precision;
  v_pos double precision;
begin
  v_x := p_tap_ms::double precision / p_speed_ms::double precision + p_phase;
  v_x := v_x - 2 * floor(v_x / 2);
  v_pos := case when v_x < 1 then v_x else 2 - v_x end;
  return round(1000 * power(greatest(0, 1 - abs(v_pos - p_target) / 0.5), 1.6))::integer;
end;
$$;

create or replace function public.start_play(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_play    public.plays;
  v_credits integer;
  v_banned  boolean;
  v_rounds  jsonb;
  v_speed   integer;
begin
  select banned into v_banned from public.players where id = p_player_id for update;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  if v_banned then
    raise exception 'BANNED';
  end if;
  select * into v_play from public.plays
   where player_id = p_player_id and score is null and not voided and rounds is not null
   order by started_at desc limit 1;
  if found then
    select credits into v_credits from public.players where id = p_player_id;
    return jsonb_build_object('play_id', v_play.id, 'speed_ms', v_play.speed_ms, 'rounds', v_play.rounds,
                              'credits', v_credits, 'resumed', true);
  end if;
  -- An unfinished play from the old one-light game is closed off, not resumed.
  update public.plays set voided = true, void_reason = 'superseded'
   where player_id = p_player_id and score is null and not voided and rounds is null;

  update public.players set credits = credits - 1, last_seen_at = now()
   where id = p_player_id and credits > 0
   returning credits into v_credits;
  if not found then
    raise exception 'NO_CREDITS';
  end if;

  v_speed := 850 + floor(random() * 201)::int;
  v_rounds := jsonb_build_array(
    jsonb_build_object('phase', random(), 'target', 0.15 + random() * 0.7),
    jsonb_build_object('phase', random(), 'target', 0.15 + random() * 0.7),
    jsonb_build_object('phase', random(), 'target', 0.15 + random() * 0.7));

  insert into public.plays (player_id, phase, speed_ms, rounds)
  values (p_player_id, (v_rounds->0->>'phase')::double precision, v_speed, v_rounds)
  returning * into v_play;
  return jsonb_build_object('play_id', v_play.id, 'speed_ms', v_play.speed_ms, 'rounds', v_play.rounds,
                            'credits', v_credits, 'resumed', false);
end;
$$;

do $$ begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'submit_score') then
    execute 'alter function public.submit_score(uuid, uuid, integer, integer, jsonb) rename to submit_score_v1';
    execute 'revoke execute on function public.submit_score_v1(uuid, uuid, integer, integer, jsonb) from public, anon, authenticated, service_role';
  end if;
end $$;

create or replace function public.submit_play(
  p_player_id uuid,
  p_play_id uuid,
  p_score integer,
  p_taps jsonb,
  p_client jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_play       public.plays;
  v_elapsed_ms double precision;
  v_tap        integer;
  v_sum        integer := 0;
  v_scores     integer[] := '{}';
  v_expected   integer;
  v_week       date;
  v_best       integer;
  v_rank       integer;
  v_credits    integer;
  v_role       public.player_role;
  i            integer;
begin
  select * into v_play from public.plays where id = p_play_id and player_id = p_player_id for update;
  if not found then raise exception 'PLAY_NOT_FOUND'; end if;
  if v_play.voided then raise exception 'PLAY_VOID'; end if;
  if v_play.score is not null then raise exception 'ALREADY_SCORED'; end if;
  if v_play.rounds is null then raise exception 'PLAY_VOID'; end if;
  if p_score is null or p_score < 0 or p_score > 1000 then raise exception 'BAD_SCORE'; end if;
  if p_taps is null or jsonb_typeof(p_taps) <> 'array' or jsonb_array_length(p_taps) <> 3 then raise exception 'BAD_TAP'; end if;

  for i in 0..2 loop
    if jsonb_typeof(p_taps->i) <> 'number' then raise exception 'BAD_TAP'; end if;
    v_tap := (p_taps->>i)::integer;
    if v_tap < 150 or v_tap > 120000 then raise exception 'BAD_TAP'; end if;
    v_sum := v_sum + v_tap;
    v_scores := v_scores || public.round_score(v_tap, (v_play.rounds->i->>'phase')::double precision,
                                               (v_play.rounds->i->>'target')::double precision, v_play.speed_ms);
  end loop;

  -- The three sweeps ran one after another: they cannot add up to more time than has really passed.
  v_elapsed_ms := extract(epoch from (now() - v_play.started_at)) * 1000;
  if v_sum > v_elapsed_ms + 3000 then raise exception 'BAD_TAP'; end if;

  v_expected := round((v_scores[1] + v_scores[2] + v_scores[3])::numeric / 3)::integer;
  if abs(v_expected - p_score) > 5 then raise exception 'SCORE_MISMATCH'; end if;

  v_week := public.dublin_week_start(now());
  update public.plays
     set score = v_expected, taps = p_taps, tap_ms = (p_taps->>0)::integer, finished_at = now(), week_start = v_week, client = p_client
   where id = p_play_id;

  select credits, role into v_credits, v_role from public.players where id = p_player_id;
  select max(score) into v_best from public.plays
   where player_id = p_player_id and week_start = v_week and score is not null and not voided;
  select rank into v_rank from public.leaderboard(v_role::text, v_week) where tag = public.player_tag(p_player_id);

  return jsonb_build_object('score', v_expected, 'rounds', to_jsonb(v_scores), 'best_this_week', v_best, 'rank', v_rank,
                            'credits', v_credits, 'week_start', v_week);
end;
$$;

-- me_player: the open play now carries its rounds
create or replace function public.me_player(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row  public.players;
  v_best integer;
  v_open public.plays;
begin
  update public.players set last_seen_at = now() where id = p_id returning * into v_row;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  select max(score) into v_best from public.plays
   where player_id = p_id and score is not null and not voided
     and week_start = public.dublin_week_start(now());
  select * into v_open from public.plays
   where player_id = p_id and score is null and not voided and rounds is not null
   order by started_at desc limit 1;
  return jsonb_build_object(
    'id', v_row.id,
    'tag', public.player_tag(v_row.id),
    'initials', v_row.initials,
    'suffix', v_row.suffix,
    'display', public.display_name(v_row.initials, v_row.suffix),
    'role', v_row.role,
    'claim_code', v_row.claim_code,
    'credits', v_row.credits,
    'banned', v_row.banned,
    'best_this_week', v_best,
    'open_play', case when v_open.id is null then null else jsonb_build_object(
        'play_id', v_open.id, 'speed_ms', v_open.speed_ms, 'rounds', v_open.rounds) end
  );
end;
$$;

revoke execute on function public.round_score(integer, double precision, double precision, integer) from public, anon, authenticated;
revoke execute on function public.submit_play(uuid, uuid, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.submit_play(uuid, uuid, integer, jsonb, jsonb) to service_role;
