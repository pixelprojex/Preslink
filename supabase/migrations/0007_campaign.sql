-- PresLink Arcade: one campaign instead of weekly rounds. Three boards (Students, Teachers and
-- Everyone = all players) run for the whole campaign and prizes are given at the end. New players
-- start on Everyone and join Students or Teachers only by giving a school email (format check
-- only, nothing is sent). Two spot prizes: best single light and most plays. The committee sets
-- an end date and five prize texts.
--
-- The first statement adds a value to an enum. Postgres only lets the new value be used once that
-- statement is committed, so it must run ON ITS OWN, outside the transaction that applies the rest
-- of this file: run the line below first, by itself, then run everything after it.
alter type public.player_role add value if not exists 'everyone';

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
alter table public.players add column if not exists school_email text;
alter table public.players alter column role set default 'everyone';
create index if not exists plays_score_idx on public.plays (score desc, finished_at)
  where score is not null and not voided;

insert into public.settings (key, value) values
  ('ends_on', ''),
  ('prize_students', ''),
  ('prize_teachers', ''),
  ('prize_everyone', ''),
  ('prize_best_light', ''),
  ('prize_most_plays', '')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- The best single light of one play: the highest of its three round scores, recomputed from the
-- taps. A play from the old one-light game (no taps) counts its play score.
create or replace function public.play_best_light(p_taps jsonb, p_rounds jsonb, p_speed_ms integer, p_score integer)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_taps is null or jsonb_typeof(p_taps) <> 'array'
      or p_rounds is null or jsonb_typeof(p_rounds) <> 'array' then p_score
    else (select max(public.round_score((p_taps->>i)::integer,
                                        (p_rounds->i->>'phase')::double precision,
                                        (p_rounds->i->>'target')::double precision,
                                        p_speed_ms))
            from generate_series(0, least(jsonb_array_length(p_taps), jsonb_array_length(p_rounds)) - 1) as i)
  end;
$$;

-- The ranked board behind leaderboard() and the rank fields: every player who is not banned and
-- has a scored play, no row limit. p_role null or 'everyone' = all players; p_week null = the
-- whole campaign.
create or replace function public.campaign_board(p_role text default null, p_week date default null)
returns table (rank integer, player_id uuid, score integer, achieved_at timestamptz, plays bigint, best_light integer)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  with scored as (
    select pl.player_id, pl.score, pl.finished_at,
           public.play_best_light(pl.taps, pl.rounds, pl.speed_ms, pl.score) as light
      from public.plays pl
      join public.players p on p.id = pl.player_id
     where pl.score is not null and not pl.voided and not p.banned
       and (p_week is null or pl.week_start = p_week)
       and (p_role is null or p_role = 'everyone' or p.role::text = p_role)
  ),
  agg as (
    select s.player_id, count(*) as plays, max(s.light) as best_light
      from scored s
     group by s.player_id
  ),
  best as (
    select distinct on (s.player_id) s.player_id, s.score, s.finished_at
      from scored s
     order by s.player_id, s.score desc, s.finished_at asc
  )
  select (row_number() over (order by b.score desc, b.finished_at asc))::integer as rank,
         b.player_id, b.score, b.finished_at as achieved_at, a.plays, a.best_light
    from best b
    join agg a on a.player_id = b.player_id
   order by b.score desc, b.finished_at asc;
$$;

-- ---------------------------------------------------------------------------
-- Players: default board Everyone; Students/Teachers need a school email
-- ---------------------------------------------------------------------------
create or replace function public.me_player(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row   public.players;
  v_best  integer;
  v_light integer;
  v_open  public.plays;
begin
  update public.players set last_seen_at = now() where id = p_id returning * into v_row;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  select max(score), max(public.play_best_light(taps, rounds, speed_ms, score)) into v_best, v_light
    from public.plays
   where player_id = p_id and score is not null and not voided;
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
    'school_email', v_row.school_email,
    'claim_code', v_row.claim_code,
    'credits', v_row.credits,
    'banned', v_row.banned,
    'best', v_best,
    'best_light', v_light,
    'best_this_week', v_best,
    'open_play', case when v_open.id is null then null else jsonb_build_object(
        'play_id', v_open.id, 'speed_ms', v_open.speed_ms, 'rounds', v_open.rounds) end
  );
end;
$$;

create or replace function public.register_player(p_role text default 'everyone', p_initials text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := coalesce(p_role, 'everyone');
  v_initials text := upper(trim(coalesce(p_initials, '')));
  v_suffix integer;
  v_row public.players;
  i integer := 0;
begin
  if v_role not in ('student', 'teacher', 'everyone') then
    raise exception 'BAD_ROLE';
  end if;
  if v_initials = '' then
    v_initials := public.random_initials();
  else
    if v_initials !~ '^[A-Z]{2,3}$' then raise exception 'BAD_INITIALS'; end if;
    if exists (select 1 from public.blocked_initials b where b.initials = v_initials) then
      raise exception 'BLOCKED_INITIALS';
    end if;
  end if;
  loop
    i := i + 1;
    select coalesce(max(suffix), 0) + 1 into v_suffix from public.players where initials = v_initials;
    begin
      insert into public.players (initials, suffix, role, claim_code)
      values (v_initials, v_suffix, v_role::public.player_role, public.fresh_claim_code(v_initials))
      returning * into v_row;
      exit;
    exception when unique_violation then
      if i > 20 then raise exception 'NO_NAMES_LEFT'; end if;
    end;
  end loop;
  return public.me_player(v_row.id);
end;
$$;

-- Join the Students or Teachers board with a school email. Format check only: students end with
-- @pbccork.ie, teachers with @pbc-cork.ie. Nothing is sent to the address.
create or replace function public.set_school(p_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_role  public.player_role;
begin
  if not exists (select 1 from public.players where id = p_id) then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  if v_email ~ '^[a-z0-9._%+''-]+@pbccork\.ie$' then
    v_role := 'student';
  elsif v_email ~ '^[a-z0-9._%+''-]+@pbc-cork\.ie$' then
    v_role := 'teacher';
  else
    raise exception 'BAD_SCHOOL_EMAIL';
  end if;
  update public.players set role = v_role, school_email = v_email, last_seen_at = now() where id = p_id;
  return public.me_player(p_id);
end;
$$;

-- Change your letters and/or your board. 'everyone' is always allowed (and forgets the school
-- email); 'student' / 'teacher' only when a school email with the matching domain is on file.
create or replace function public.update_player(p_id uuid, p_initials text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_initials text := upper(trim(coalesce(p_initials, '')));
  v_suffix integer;
  v_cur public.players;
  i integer := 0;
begin
  select * into v_cur from public.players where id = p_id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  if p_initials is not null and v_initials <> v_cur.initials then
    if v_initials !~ '^[A-Z]{2,3}$' then raise exception 'BAD_INITIALS'; end if;
    if exists (select 1 from public.blocked_initials b where b.initials = v_initials) then
      raise exception 'BLOCKED_INITIALS';
    end if;
    loop
      i := i + 1;
      select coalesce(max(suffix), 0) + 1 into v_suffix from public.players where initials = v_initials;
      begin
        update public.players set initials = v_initials, suffix = v_suffix,
               claim_code = case when exists (select 1 from public.players x where x.initials = v_initials and x.claim_code = v_cur.claim_code and x.id <> p_id)
                                 then public.fresh_claim_code(v_initials) else claim_code end
         where id = p_id;
        exit;
      exception when unique_violation then
        if i > 20 then raise exception 'NO_NAMES_LEFT'; end if;
      end;
    end loop;
  end if;
  if p_role is not null then
    if p_role = 'everyone' then
      update public.players set role = 'everyone', school_email = null where id = p_id;
    elsif p_role = 'student' then
      if v_cur.school_email is null or v_cur.school_email !~ '@pbccork\.ie$' then
        raise exception 'NEEDS_SCHOOL_EMAIL';
      end if;
      update public.players set role = 'student' where id = p_id;
    elsif p_role = 'teacher' then
      if v_cur.school_email is null or v_cur.school_email !~ '@pbc-cork\.ie$' then
        raise exception 'NEEDS_SCHOOL_EMAIL';
      end if;
      update public.players set role = 'teacher' where id = p_id;
    else
      raise exception 'BAD_ROLE';
    end if;
  end if;
  return public.me_player(p_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Scoring: ranks and bests are now campaign-wide
-- ---------------------------------------------------------------------------
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
  v_rank_all   integer;
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
   where player_id = p_player_id and score is not null and not voided;
  select b.rank into v_rank from public.campaign_board(v_role::text) b where b.player_id = p_player_id;
  select b.rank into v_rank_all from public.campaign_board('everyone') b where b.player_id = p_player_id;

  return jsonb_build_object(
    'score', v_expected,
    'rounds', to_jsonb(v_scores),
    'best', v_best,
    'best_this_week', v_best,
    'best_light', greatest(v_scores[1], v_scores[2], v_scores[3]),
    'rank', v_rank,
    'rank_all', v_rank_all,
    'credits', v_credits,
    'week_start', v_week
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Public reads
-- ---------------------------------------------------------------------------
-- The board gains a best_light column, so the old function is renamed out of the way (a return
-- type cannot be changed in place) and a new one created.
do $$ begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'leaderboard'
              and pg_get_function_identity_arguments(oid) = 'p_role text, p_week date'
              and pg_get_function_result(oid) not like '%best_light%') then
    execute 'alter function public.leaderboard(text, date) rename to leaderboard_v2';
    execute 'revoke execute on function public.leaderboard_v2(text, date) from public, anon, authenticated, service_role';
  end if;
end $$;

-- p_role null or 'everyone' = all players; p_week null = the whole campaign.
create or replace function public.leaderboard(p_role text default null, p_week date default null)
returns table (rank integer, tag text, initials text, role text, score integer, achieved_at timestamptz, plays bigint, best_light integer)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select b.rank, public.player_tag(p.id) as tag, public.display_name(p.initials, p.suffix) as initials, p.role::text,
         b.score, b.achieved_at, b.plays, b.best_light
    from public.campaign_board(p_role, p_week) b
    join public.players p on p.id = b.player_id
   order by b.rank
   limit 100;
$$;

-- Spot prizes across the whole campaign. best_light: the highest single round score (tie: the
-- earlier play). most_plays: the player with the most scored plays (tie: the earlier first play).
create or replace function public.spot_prizes()
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  with scored as (
    select pl.player_id, pl.started_at, pl.finished_at,
           public.play_best_light(pl.taps, pl.rounds, pl.speed_ms, pl.score) as light
      from public.plays pl
      join public.players p on p.id = pl.player_id
     where pl.score is not null and not pl.voided and not p.banned
  ),
  bl as (
    select s.player_id, s.light, s.finished_at
      from scored s
     order by s.light desc, s.finished_at asc
     limit 1
  ),
  mp as (
    select s.player_id, count(*) as plays, min(s.started_at) as since
      from scored s
     group by s.player_id
     order by count(*) desc, min(s.started_at) asc
     limit 1
  )
  select jsonb_build_object(
    'best_light', (select jsonb_build_object('tag', public.player_tag(p.id), 'initials', public.display_name(p.initials, p.suffix),
                                             'role', p.role::text, 'score', b.light, 'achieved_at', b.finished_at)
                     from bl b join public.players p on p.id = b.player_id),
    'most_plays', (select jsonb_build_object('tag', public.player_tag(p.id), 'initials', public.display_name(p.initials, p.suffix),
                                             'role', p.role::text, 'plays', m.plays, 'since', m.since)
                     from mp m join public.players p on p.id = m.player_id)
  );
$$;

create or replace function public.stats()
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'total_raised_cents', coalesce((select sum(amount_cents) from public.payments), 0),
    'goal_cents', coalesce((select value::integer from public.settings where key = 'goal_cents'), 0),
    'prize_text', coalesce((select value from public.settings where key = 'prize_text'), ''),
    'ends_on', coalesce((select value from public.settings where key = 'ends_on'), ''),
    'prizes', jsonb_build_object(
      'students',   coalesce((select value from public.settings where key = 'prize_students'), ''),
      'teachers',   coalesce((select value from public.settings where key = 'prize_teachers'), ''),
      'everyone',   coalesce((select value from public.settings where key = 'prize_everyone'), ''),
      'best_light', coalesce((select value from public.settings where key = 'prize_best_light'), ''),
      'most_plays', coalesce((select value from public.settings where key = 'prize_most_plays'), '')
    ),
    'payments', (select count(*) from public.payments),
    'plays', (select count(*) from public.plays where score is not null and not voided),
    'players', (select count(*) from public.players),
    'week_start', public.dublin_week_start(now()),
    'week_end', (public.dublin_week_start(now()) + 6),
    'server_time', now()
  );
$$;

-- ---------------------------------------------------------------------------
-- Committee
-- ---------------------------------------------------------------------------
-- admin_set_settings gains two optional arguments. The old three-argument function is renamed out
-- of the way so a three-argument call is not ambiguous between the two.
do $$ begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'admin_set_settings'
              and pg_get_function_identity_arguments(oid) = 'p_code text, p_goal_cents integer, p_prize_text text') then
    execute 'alter function public.admin_set_settings(text, integer, text) rename to admin_set_settings_v1';
    execute 'revoke execute on function public.admin_set_settings_v1(text, integer, text) from public, anon, authenticated, service_role';
  end if;
end $$;

-- p_ends_on: '' clears the end date, otherwise YYYY-MM-DD (else {error: 'BAD_DATE'}, nothing saved).
-- p_prizes: an object with any of students, teachers, everyone, best_light, most_plays.
create or replace function public.admin_set_settings(p_code text, p_goal_cents integer, p_prize_text text,
                                                     p_ends_on text default null, p_prizes jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_err  text := public.admin_verify(p_code);
  v_ends text := trim(coalesce(p_ends_on, ''));
  v_date date;
  v_key  text;
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  if v_ends <> '' then
    if v_ends !~ '^\d{4}-\d{2}-\d{2}$' then return jsonb_build_object('error', 'BAD_DATE'); end if;
    begin
      v_date := v_ends::date;
    exception when others then
      return jsonb_build_object('error', 'BAD_DATE');
    end;
  end if;
  if p_goal_cents is not null and p_goal_cents >= 0 then
    update public.settings set value = p_goal_cents::text where key = 'goal_cents';
  end if;
  if p_prize_text is not null then
    update public.settings set value = left(p_prize_text, 200) where key = 'prize_text';
  end if;
  if p_ends_on is not null then
    insert into public.settings (key, value)
    values ('ends_on', case when v_ends = '' then '' else to_char(v_date, 'YYYY-MM-DD') end)
    on conflict (key) do update set value = excluded.value;
  end if;
  if p_prizes is not null and jsonb_typeof(p_prizes) = 'object' then
    for v_key in select k from jsonb_object_keys(p_prizes) as k
                  where k in ('students', 'teachers', 'everyone', 'best_light', 'most_plays') loop
      insert into public.settings (key, value) values ('prize_' || v_key, left(coalesce(p_prizes->>v_key, ''), 200))
      on conflict (key) do update set value = excluded.value;
    end loop;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- p_week null = the whole campaign. The board lists every player with a score, with rank (on the
-- player's own board), rank_all (on the Everyone board) and best_light. Ranks are counted among
-- players who are not banned, so they agree with the public boards; a banned player's ranks are null.
create or replace function public.admin_overview(p_code text, p_week date default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_board jsonb;
  v_winners jsonb;
  v_payments jsonb;
  v_blocked jsonb;
  v_weeks jsonb;
  v_by_day jsonb;
  v_err text := public.admin_verify(p_code);
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  with scored as (
    select pl.id as play_id, pl.player_id, pl.score, pl.finished_at,
           public.play_best_light(pl.taps, pl.rounds, pl.speed_ms, pl.score) as light
      from public.plays pl
     where pl.score is not null and not pl.voided and (p_week is null or pl.week_start = p_week)
  ),
  agg as (
    select s.player_id, count(*) as plays, max(s.light) as best_light
      from scored s
     group by s.player_id
  ),
  best as (
    select distinct on (s.player_id) s.play_id, s.player_id, s.score, s.finished_at
      from scored s
     order by s.player_id, s.score desc, s.finished_at asc
  ),
  ranked as (
    select p.role::text as role, p.id as player_id, public.display_name(p.initials, p.suffix) as initials, p.claim_code, p.banned,
           b.play_id, b.score, b.finished_at, a.plays, a.best_light,
           (row_number() over (partition by p.banned, p.role order by b.score desc, b.finished_at asc))::integer as rank_role,
           (row_number() over (partition by p.banned order by b.score desc, b.finished_at asc))::integer as rank_all
      from best b
      join agg a on a.player_id = b.player_id
      join public.players p on p.id = b.player_id
  ),
  board_rows as (
    select r.role, r.player_id, r.initials, r.claim_code, r.banned, r.play_id, r.score, r.finished_at, r.plays, r.best_light,
           case when r.banned then null when r.role = 'everyone' then r.rank_all else r.rank_role end as rank,
           case when r.banned then null else r.rank_all end as rank_all
      from ranked r
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.role, x.rank nulls last, x.score desc), '[]'::jsonb) into v_board
    from board_rows x;
  with scored as (
    select pl.week_start, p.role::text as role, public.display_name(p.initials, p.suffix) as initials, p.claim_code, pl.score, pl.finished_at
      from public.plays pl join public.players p on p.id = pl.player_id
     where pl.score is not null and not pl.voided and not p.banned and pl.week_start < public.dublin_week_start(now())
  ),
  w as (
    select distinct on (s.week_start, s.role) s.week_start, s.role, s.initials, s.claim_code, s.score
      from scored s order by s.week_start desc, s.role, s.score desc, s.finished_at asc
  )
  select coalesce(jsonb_agg(to_jsonb(w) order by w.week_start desc, w.role), '[]'::jsonb) into v_winners from w;
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_payments from (
    select pm.created_at, public.display_name(p.initials, p.suffix) as initials, p.role::text as role, pm.bundle, pm.credits, pm.amount_cents, pm.email, pm.source, pm.stripe_session_id
      from public.payments pm join public.players p on p.id = pm.player_id
     order by pm.created_at desc limit 50
  ) x;
  select coalesce(jsonb_agg(d order by d->>'day' desc), '[]'::jsonb) into v_by_day from (
    select jsonb_build_object('day', (created_at at time zone 'Europe/Dublin')::date, 'payments', count(*), 'amount_cents', sum(amount_cents)) as d
      from public.payments
     where created_at > now() - interval '21 days'
     group by (created_at at time zone 'Europe/Dublin')::date
  ) t;
  select coalesce(jsonb_agg(wk order by wk desc), '[]'::jsonb) into v_weeks from (
    select distinct week_start as wk from public.plays where week_start is not null
    union select public.dublin_week_start(now())
  ) t;
  select coalesce(jsonb_agg(b.initials order by b.initials), '[]'::jsonb) into v_blocked
    from public.blocked_initials b where b.note = 'committee';
  return jsonb_build_object(
    'stats', public.stats(),
    'spot', public.spot_prizes(),
    'week', p_week,
    'weeks', v_weeks,
    'board', v_board,
    'past_winners', v_winners,
    'payments', v_payments,
    'by_day', v_by_day,
    'players_by_role', (select jsonb_build_object(
                          'student',  count(*) filter (where role = 'student'),
                          'teacher',  count(*) filter (where role = 'teacher'),
                          'everyone', count(*) filter (where role = 'everyone'))
                          from public.players),
    'blocked_by_committee', v_blocked,
    'banned', (select coalesce(jsonb_agg(jsonb_build_object('player_id', id, 'initials', public.display_name(initials, suffix), 'claim_code', claim_code)), '[]'::jsonb)
                 from public.players where banned)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.play_best_light(jsonb, jsonb, integer, integer) from public, anon, authenticated;
revoke execute on function public.campaign_board(text, date) from public, anon, authenticated;
revoke execute on function public.me_player(uuid) from public, anon, authenticated;
revoke execute on function public.register_player(text, text) from public, anon, authenticated;
revoke execute on function public.set_school(uuid, text) from public, anon, authenticated;
revoke execute on function public.update_player(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.submit_play(uuid, uuid, integer, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_set_settings(text, integer, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_overview(text, date) from public, anon, authenticated;

grant execute on function public.me_player(uuid) to service_role;
grant execute on function public.register_player(text, text) to service_role;
grant execute on function public.set_school(uuid, text) to service_role;
grant execute on function public.update_player(uuid, text, text) to service_role;
grant execute on function public.submit_play(uuid, uuid, integer, jsonb, jsonb) to service_role;
grant execute on function public.admin_set_settings(text, integer, text, text, jsonb) to service_role;
grant execute on function public.admin_overview(text, date) to service_role;

grant execute on function public.leaderboard(text, date) to anon, authenticated, service_role;
grant execute on function public.spot_prizes() to anon, authenticated, service_role;
grant execute on function public.stats() to anon, authenticated, service_role;
