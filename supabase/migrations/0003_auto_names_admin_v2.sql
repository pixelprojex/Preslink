-- PresLink Arcade: no sign-up. A player is created with a random three-letter name on the
-- first tap; the name and role can be changed later. Richer committee overview.

-- A random name that is neither blocked nor taken.
create or replace function public.random_initials()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v text;
  i integer := 0;
begin
  loop
    i := i + 1;
    v := chr(65 + floor(random() * 26)::int) || chr(65 + floor(random() * 26)::int) || chr(65 + floor(random() * 26)::int);
    exit when not exists (select 1 from public.blocked_initials b where b.initials = v)
          and not exists (select 1 from public.players p where p.initials = v);
    if i > 200 then
      raise exception 'NO_NAMES_LEFT';
    end if;
  end loop;
  return v;
end;
$$;

drop function if exists public.register_player(text, text);

create or replace function public.register_player(p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.players;
  i integer := 0;
begin
  if p_role not in ('student', 'teacher') then
    raise exception 'BAD_ROLE';
  end if;
  loop
    i := i + 1;
    begin
      insert into public.players (initials, role, claim_code)
      values (public.random_initials(), p_role::public.player_role, lpad(floor(random() * 10000)::int::text, 4, '0'))
      returning * into v_row;
      exit;
    exception when unique_violation then
      if i > 20 then raise exception 'NO_NAMES_LEFT'; end if;
    end;
  end loop;
  return public.me_player(v_row.id);
end;
$$;

-- Change your letters and/or your board. Returned errors keep the call cheap for the browser.
create or replace function public.update_player(p_id uuid, p_initials text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_initials text := upper(trim(coalesce(p_initials, '')));
begin
  if not exists (select 1 from public.players where id = p_id) then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  if p_initials is not null then
    if v_initials !~ '^[A-Z]{3}$' then
      raise exception 'BAD_INITIALS';
    end if;
    if exists (select 1 from public.blocked_initials b where b.initials = v_initials) then
      raise exception 'BLOCKED_INITIALS';
    end if;
    begin
      update public.players set initials = v_initials where id = p_id;
    exception when unique_violation then
      raise exception 'TAKEN';
    end;
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

-- ---------------------------------------------------------------------------
-- Committee: richer overview (any week), player lookup, name reset
-- ---------------------------------------------------------------------------
drop function if exists public.admin_overview(text);

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
           p.role::text as role, p.id as player_id, p.initials, p.claim_code, p.banned, b.play_id, b.score, b.finished_at, b.plays
      from best b join public.players p on p.id = b.player_id
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.role, r.rank), '[]'::jsonb) into v_board
    from ranked r where r.rank <= 50;

  with scored as (
    select pl.week_start, p.role::text as role, p.initials, p.claim_code, pl.score, pl.finished_at
      from public.plays pl join public.players p on p.id = pl.player_id
     where pl.score is not null and not pl.voided and not p.banned and pl.week_start < public.dublin_week_start(now())
  ),
  w as (
    select distinct on (s.week_start, s.role) s.week_start, s.role, s.initials, s.claim_code, s.score
      from scored s order by s.week_start desc, s.role, s.score desc, s.finished_at asc
  )
  select coalesce(jsonb_agg(to_jsonb(w) order by w.week_start desc, w.role), '[]'::jsonb) into v_winners from w;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_payments from (
    select pm.created_at, p.initials, p.role::text as role, pm.bundle, pm.credits, pm.amount_cents, pm.email, pm.source, pm.stripe_session_id
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
    'banned', (select coalesce(jsonb_agg(jsonb_build_object('player_id', id, 'initials', initials, 'claim_code', claim_code)), '[]'::jsonb)
                 from public.players where banned)
  );
end;
$$;

create or replace function public.admin_player(p_code text, p_initials text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_err text := public.admin_verify(p_code);
  v_row public.players;
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  select * into v_row from public.players where initials = upper(trim(coalesce(p_initials, '')));
  if not found then return jsonb_build_object('error', 'PLAYER_NOT_FOUND'); end if;
  return jsonb_build_object(
    'player', jsonb_build_object('id', v_row.id, 'initials', v_row.initials, 'role', v_row.role, 'claim_code', v_row.claim_code,
                                 'credits', v_row.credits, 'banned', v_row.banned, 'created_at', v_row.created_at, 'last_seen_at', v_row.last_seen_at),
    'plays', (select coalesce(jsonb_agg(jsonb_build_object('play_id', id, 'started_at', started_at, 'finished_at', finished_at, 'score', score,
                                                           'week_start', week_start, 'voided', voided, 'void_reason', void_reason) order by started_at desc), '[]'::jsonb)
                from public.plays where player_id = v_row.id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('created_at', created_at, 'bundle', bundle, 'credits', credits, 'amount_cents', amount_cents,
                                                              'email', email, 'stripe_session_id', stripe_session_id) order by created_at desc), '[]'::jsonb)
                   from public.payments where player_id = v_row.id)
  );
end;
$$;

-- Give a player a fresh random name (for a name that slipped past the blocklist).
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
  update public.players set initials = v_new where id = p_player_id;
  if not found then return jsonb_build_object('error', 'PLAYER_NOT_FOUND'); end if;
  return jsonb_build_object('ok', true, 'initials', v_new);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.random_initials() from public, anon, authenticated;
revoke execute on function public.register_player(text) from public, anon, authenticated;
revoke execute on function public.update_player(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.admin_overview(text, date) from public, anon, authenticated;
revoke execute on function public.admin_player(text, text) from public, anon, authenticated;
revoke execute on function public.admin_reset_name(text, uuid) from public, anon, authenticated;

grant execute on function public.register_player(text) to service_role;
grant execute on function public.update_player(uuid, text, text) to service_role;
grant execute on function public.admin_overview(text, date) to service_role;
grant execute on function public.admin_player(text, text) to service_role;
grant execute on function public.admin_reset_name(text, uuid) to service_role;
