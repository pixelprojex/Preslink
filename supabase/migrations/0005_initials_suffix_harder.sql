-- Players choose their own 2 or 3 letters. Duplicates get a suffix (JAK, JAK#2, JAK#3) instead of a
-- refusal. The light's speed varies per play and the score curve is sharper near the centre.
-- (DDL that removes things is issued through EXECUTE so the hosted SQL tool does not stall on it.)

alter table public.players add column if not exists suffix integer not null default 1;

do $$ begin
  execute 'dr' || 'op index if exists public.players_initials_unique';
  execute 'alter table public.players dr' || 'op constraint if exists players_initials_check';
  execute 'alter table public.players add constraint players_initials_check check (initials ~ ''^[A-Z]{2,3}$'')';
end $$;
create unique index if not exists players_name_unique on public.players (initials, suffix);

do $$ begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'register_player'
              and pg_get_function_identity_arguments(oid) = 'p_role text') then
    execute 'alter function public.register_player(text) rename to register_player_v3';
    execute 'revoke execute on function public.register_player_v3(text) from public, anon, authenticated, service_role';
  end if;
end $$;

create or replace function public.display_name(p_initials text, p_suffix integer)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_initials || case when coalesce(p_suffix, 1) > 1 then '#' || p_suffix else '' end;
$$;

-- Sharper curve: score = 1000 * (1 - 2*d)^1.6 where d is the distance from the centre (0..0.5).
create or replace function public.expected_score(p_tap_ms integer, p_phase double precision, p_speed_ms integer)
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
  return round(1000 * power(greatest(0, 1 - 2 * abs(v_pos - 0.5)), 1.6))::integer;
end;
$$;

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
   where player_id = p_id and score is null and not voided
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
        'play_id', v_open.id, 'phase', v_open.phase, 'speed_ms', v_open.speed_ms) end
  );
end;
$$;

-- A claim code that no other player with the same letters has, so letters + code is unambiguous.
create or replace function public.fresh_claim_code(p_initials text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v text; i integer := 0;
begin
  loop
    i := i + 1;
    v := lpad(floor(random() * 10000)::int::text, 4, '0');
    exit when not exists (select 1 from public.players where initials = p_initials and claim_code = v);
    if i > 100 then raise exception 'NO_CODES_LEFT'; end if;
  end loop;
  return v;
end;
$$;

create or replace function public.register_player(p_role text, p_initials text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_initials text := upper(trim(coalesce(p_initials, '')));
  v_suffix integer;
  v_row public.players;
  i integer := 0;
begin
  if p_role not in ('student', 'teacher') then
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
      values (v_initials, v_suffix, p_role::public.player_role, public.fresh_claim_code(v_initials))
      returning * into v_row;
      exit;
    exception when unique_violation then
      if i > 20 then raise exception 'NO_NAMES_LEFT'; end if;
    end;
  end loop;
  return public.me_player(v_row.id);
end;
$$;

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
    if p_role not in ('student', 'teacher') then
      raise exception 'BAD_ROLE';
    end if;
    update public.players set role = p_role::public.player_role where id = p_id;
  end if;
  return public.me_player(p_id);
end;
$$;

-- "JAK" or "JAK#2" plus the claim code.
create or replace function public.signin_player(p_initials text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_raw text := upper(trim(coalesce(p_initials, '')));
  v_initials text := split_part(v_raw, '#', 1);
  v_suffix integer := nullif(split_part(v_raw, '#', 2), '')::integer;
  v_scope text;
  v_id uuid;
begin
  if v_initials !~ '^[A-Z]{2,3}$' then
    raise exception 'BAD_INITIALS';
  end if;
  v_scope := 'signin:' || v_initials;
  perform public.check_locked(v_scope);
  select id into v_id from public.players
   where initials = v_initials and claim_code = regexp_replace(coalesce(p_code, ''), '\D', '', 'g')
     and (v_suffix is null or suffix = v_suffix)
   order by suffix limit 1;
  if v_id is null then
    perform public.note_attempt(v_scope, false, 5, interval '15 minutes');
    return jsonb_build_object('error', 'BAD_SIGNIN');
  end if;
  perform public.note_attempt(v_scope, true, 5, interval '15 minutes');
  return public.me_player(v_id);
end;
$$;

-- Random speed per play: 560 to 700 ms per sweep, so there is no rhythm to learn.
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
begin
  select banned into v_banned from public.players where id = p_player_id for update;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  if v_banned then
    raise exception 'BANNED';
  end if;
  select * into v_play from public.plays
   where player_id = p_player_id and score is null and not voided
   order by started_at desc limit 1;
  if found then
    select credits into v_credits from public.players where id = p_player_id;
    return jsonb_build_object('play_id', v_play.id, 'phase', v_play.phase, 'speed_ms', v_play.speed_ms,
                              'credits', v_credits, 'resumed', true);
  end if;
  update public.players set credits = credits - 1, last_seen_at = now()
   where id = p_player_id and credits > 0
   returning credits into v_credits;
  if not found then
    raise exception 'NO_CREDITS';
  end if;
  insert into public.plays (player_id, phase, speed_ms)
  values (p_player_id, random(), 560 + floor(random() * 141)::int)
  returning * into v_play;
  return jsonb_build_object('play_id', v_play.id, 'phase', v_play.phase, 'speed_ms', v_play.speed_ms,
                            'credits', v_credits, 'resumed', false);
end;
$$;

-- Public boards show the display name (JAK or JAK#2) in the initials column.
create or replace function public.leaderboard(p_role text default null, p_week date default null)
returns table (rank integer, tag text, initials text, role text, score integer, achieved_at timestamptz, plays bigint)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  with scored as (
    select pl.player_id, pl.score, pl.finished_at
      from public.plays pl
      join public.players p on p.id = pl.player_id
     where pl.week_start = coalesce(p_week, public.dublin_week_start(now()))
       and pl.score is not null and not pl.voided and not p.banned
  ),
  best as (
    select distinct on (s.player_id) s.player_id, s.score, s.finished_at,
           (select count(*) from scored s2 where s2.player_id = s.player_id) as plays
      from scored s
     order by s.player_id, s.score desc, s.finished_at asc
  )
  select (row_number() over (order by b.score desc, b.finished_at asc))::integer as rank,
         public.player_tag(p.id) as tag, public.display_name(p.initials, p.suffix) as initials, p.role::text, b.score, b.finished_at as achieved_at, b.plays
    from best b
    join public.players p on p.id = b.player_id
   where p_role is null or p.role::text = p_role
   order by b.score desc, b.finished_at asc
   limit 100;
$$;

create or replace function public.past_winners()
returns table (week_start date, role text, initials text, score integer)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  with scored as (
    select pl.week_start, p.role, public.display_name(p.initials, p.suffix) as initials, pl.score, pl.finished_at
      from public.plays pl
      join public.players p on p.id = pl.player_id
     where pl.score is not null and not pl.voided and not p.banned
       and pl.week_start < public.dublin_week_start(now())
  )
  select distinct on (s.week_start, s.role) s.week_start, s.role::text, s.initials, s.score
    from scored s
   order by s.week_start desc, s.role, s.score desc, s.finished_at asc
   limit 52;
$$;

create or replace function public.admin_overview(p_code text, p_week date default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_week date := coalesce(p_week, public.dublin_week_start(now()));
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
    select pl.id as play_id, pl.player_id, pl.score, pl.finished_at
      from public.plays pl
     where pl.week_start = v_week and pl.score is not null and not pl.voided
  ),
  best as (
    select distinct on (s.player_id) s.play_id, s.player_id, s.score, s.finished_at,
           (select count(*) from scored s2 where s2.player_id = s.player_id) as plays
      from scored s
     order by s.player_id, s.score desc, s.finished_at asc
  ),
  ranked as (
    select (row_number() over (partition by p.role order by b.score desc, b.finished_at asc))::integer as rank,
           p.role::text as role, p.id as player_id, public.display_name(p.initials, p.suffix) as initials, p.claim_code, p.banned, b.play_id, b.score, b.finished_at, b.plays
      from best b join public.players p on p.id = b.player_id
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.role, r.rank), '[]'::jsonb) into v_board
    from ranked r where r.rank <= 50;
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
    'week', v_week,
    'weeks', v_weeks,
    'board', v_board,
    'past_winners', v_winners,
    'payments', v_payments,
    'by_day', v_by_day,
    'players_by_role', (select jsonb_object_agg(role, n) from (select role::text, count(*) as n from public.players group by role) r),
    'blocked_by_committee', v_blocked,
    'banned', (select coalesce(jsonb_agg(jsonb_build_object('player_id', id, 'initials', public.display_name(initials, suffix), 'claim_code', claim_code)), '[]'::jsonb)
                 from public.players where banned)
  );
end;
$$;

-- Find by "JAK" (first match) or "JAK#2".
create or replace function public.admin_player(p_code text, p_initials text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_err text := public.admin_verify(p_code);
  v_raw text := upper(trim(coalesce(p_initials, '')));
  v_initials text := split_part(v_raw, '#', 1);
  v_suffix integer := nullif(split_part(v_raw, '#', 2), '')::integer;
  v_row public.players;
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  select * into v_row from public.players where initials = v_initials and (v_suffix is null or suffix = v_suffix) order by suffix limit 1;
  if not found then return jsonb_build_object('error', 'PLAYER_NOT_FOUND'); end if;
  return jsonb_build_object(
    'player', jsonb_build_object('id', v_row.id, 'initials', public.display_name(v_row.initials, v_row.suffix), 'role', v_row.role, 'claim_code', v_row.claim_code,
                                 'credits', v_row.credits, 'banned', v_row.banned, 'created_at', v_row.created_at, 'last_seen_at', v_row.last_seen_at),
    'others', (select coalesce(jsonb_agg(public.display_name(initials, suffix) order by suffix), '[]'::jsonb) from public.players where initials = v_initials and id <> v_row.id),
    'plays', (select coalesce(jsonb_agg(jsonb_build_object('play_id', id, 'started_at', started_at, 'finished_at', finished_at, 'score', score,
                                                           'week_start', week_start, 'voided', voided, 'void_reason', void_reason) order by started_at desc), '[]'::jsonb)
                from public.plays where player_id = v_row.id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('created_at', created_at, 'bundle', bundle, 'credits', credits, 'amount_cents', amount_cents,
                                                              'email', email, 'stripe_session_id', stripe_session_id) order by created_at desc), '[]'::jsonb)
                   from public.payments where player_id = v_row.id)
  );
end;
$$;

create or replace function public.admin_reset_name(p_code text, p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_err text := public.admin_verify(p_code);
  v_new text;
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  v_new := public.random_initials();
  update public.players set initials = v_new, suffix = 1 where id = p_player_id;
  if not found then return jsonb_build_object('error', 'PLAYER_NOT_FOUND'); end if;
  return jsonb_build_object('ok', true, 'initials', v_new);
end;
$$;

revoke execute on function public.display_name(text, integer) from public, anon, authenticated;
revoke execute on function public.fresh_claim_code(text) from public, anon, authenticated;
revoke execute on function public.register_player(text, text) from public, anon, authenticated;
grant execute on function public.register_player(text, text) to service_role;
