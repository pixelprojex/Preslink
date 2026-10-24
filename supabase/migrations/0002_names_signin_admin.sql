-- PresLink Arcade: unique names, name blocklist, sign back in, banned players,
-- committee settings and admin functions protected by a code.

-- ---------------------------------------------------------------------------
-- Names are unique; players can be banned
-- ---------------------------------------------------------------------------
create unique index if not exists players_initials_unique on public.players (initials);
alter table public.players add column if not exists banned boolean not null default false;

create table if not exists public.blocked_initials (
  initials   text primary key check (initials ~ '^[A-Z]{3}$'),
  note       text,
  created_at timestamptz not null default now()
);
alter table public.blocked_initials enable row level security;
revoke all on public.blocked_initials from anon, authenticated;

insert into public.blocked_initials (initials) values
  ('ASS'),('ARS'),('BUM'),('TIT'),('TTS'),('BOO'),('SEX'),('SXE'),('XXX'),('CUM'),('CUN'),('CNT'),('DIK'),('DIC'),
  ('DIX'),('DCK'),('COK'),('CCK'),('COC'),('KOK'),('NOB'),('KNB'),('PNS'),('VAG'),('VAJ'),('GEE'),('MUF'),('JIZ'),
  ('JZZ'),('BJS'),('HOE'),('HOR'),('SLT'),('SLG'),('WNK'),('WAN'),('FAP'),('FUK'),('FUC'),('FCK'),('FUQ'),('FUX'),
  ('FKU'),('FEK'),('FEC'),('SHT'),('SHY'),('CRP'),('PIS'),('PSS'),('POO'),('PEE'),('FRT'),('TWT'),('TWA'),('WTF'),
  ('STD'),('HIV'),('FAG'),('FGT'),('GAY'),('HOM'),('LEZ'),('DYK'),('TRN'),('NIG'),('NGR'),('NGA'),('NIG'),('KKK'),
  ('WOP'),('SPK'),('PKI'),('PAK'),('CHK'),('JAP'),('GYP'),('KYS'),('DIE'),('KIL'),('GUN'),('RIP'),('SUX'),('SUK'),
  ('DAM'),('DMN'),('HEL'),('GOD'),('JEW'),('NAZ'),('NZI'),('IRA'),('UVF'),('UDA'),('ISI'),('ISS'),('DRG'),('WED'),
  ('LSD'),('MDM'),('COK'),('CRK'),('MTH'),('DUM'),('FAT'),('UGL'),('LOL'),('OMG'),('IDK'),('NAH'),('MEH')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Committee settings and attempt lockouts
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  key   text primary key,
  value text
);
alter table public.settings enable row level security;
revoke all on public.settings from anon, authenticated;
insert into public.settings (key, value) values
  ('goal_cents', '200000'),
  ('prize_text', ''),
  ('admin_code_hash', '')
on conflict do nothing;

create table if not exists public.auth_attempts (
  scope        text primary key,         -- 'signin:JAK' or 'admin'
  fails        integer not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);
alter table public.auth_attempts enable row level security;
revoke all on public.auth_attempts from anon, authenticated;

create or replace function public.check_locked(p_scope text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_until timestamptz;
begin
  select locked_until into v_until from public.auth_attempts where scope = p_scope;
  if v_until is not null and v_until > now() then
    raise exception 'LOCKED';
  end if;
end;
$$;

-- After p_max failures the scope is locked for p_lock. A success clears it.
create or replace function public.note_attempt(p_scope text, p_ok boolean, p_max integer, p_lock interval)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_ok then
    delete from public.auth_attempts where scope = p_scope;
    return;
  end if;
  insert into public.auth_attempts (scope, fails, updated_at) values (p_scope, 1, now())
  on conflict (scope) do update
    set fails = case when public.auth_attempts.updated_at < now() - p_lock then 1 else public.auth_attempts.fails + 1 end,
        updated_at = now();
  update public.auth_attempts
     set locked_until = now() + p_lock, fails = 0
   where scope = p_scope and fails >= p_max;
end;
$$;

-- ---------------------------------------------------------------------------
-- Registration: blocklist + uniqueness. Sign back in with initials + claim code.
-- ---------------------------------------------------------------------------
create or replace function public.register_player(p_initials text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_initials text := upper(trim(coalesce(p_initials, '')));
  v_row public.players;
begin
  if v_initials !~ '^[A-Z]{3}$' then
    raise exception 'BAD_INITIALS';
  end if;
  if exists (select 1 from public.blocked_initials b where b.initials = v_initials) then
    raise exception 'BLOCKED_INITIALS';
  end if;
  if p_role not in ('student', 'teacher') then
    raise exception 'BAD_ROLE';
  end if;

  begin
    insert into public.players (initials, role, claim_code)
    values (v_initials, p_role::public.player_role, lpad(floor(random() * 10000)::int::text, 4, '0'))
    returning * into v_row;
  exception when unique_violation then
    raise exception 'TAKEN';
  end;

  return public.me_player(v_row.id);
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

create or replace function public.signin_player(p_initials text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_initials text := upper(trim(coalesce(p_initials, '')));
  v_scope text;
  v_id uuid;
begin
  if v_initials !~ '^[A-Z]{3}$' then
    raise exception 'BAD_INITIALS';
  end if;
  v_scope := 'signin:' || v_initials;
  perform public.check_locked(v_scope);

  select id into v_id from public.players
   where initials = v_initials and claim_code = regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  if v_id is null then
    -- Returned, not raised: a raise would roll back the attempt we just recorded.
    perform public.note_attempt(v_scope, false, 5, interval '15 minutes');
    return jsonb_build_object('error', 'BAD_SIGNIN');
  end if;
  perform public.note_attempt(v_scope, true, 5, interval '15 minutes');
  return public.me_player(v_id);
end;
$$;

-- Banned players cannot start a play.
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
  values (p_player_id, random(), 650)
  returning * into v_play;

  return jsonb_build_object('play_id', v_play.id, 'phase', v_play.phase, 'speed_ms', v_play.speed_ms,
                            'credits', v_credits, 'resumed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Public reads: banned players are hidden; stats carries the goal and prize
-- ---------------------------------------------------------------------------
create or replace function public.leaderboard(p_role text default null, p_week date default null)
returns table (
  rank        integer,
  tag         text,
  initials    text,
  role        text,
  score       integer,
  achieved_at timestamptz,
  plays       bigint
)
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
         public.player_tag(p.id) as tag,
         p.initials,
         p.role::text,
         b.score,
         b.finished_at as achieved_at,
         b.plays
    from best b
    join public.players p on p.id = b.player_id
   where p_role is null or p.role::text = p_role
   order by b.score desc, b.finished_at asc
   limit 100;
$$;

create or replace function public.past_winners()
returns table (
  week_start date,
  role       text,
  initials   text,
  score      integer
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  with scored as (
    select pl.week_start, p.role, p.initials, pl.score, pl.finished_at
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
    'payments', (select count(*) from public.payments),
    'plays', (select count(*) from public.plays where score is not null and not voided),
    'players', (select count(*) from public.players),
    'week_start', public.dublin_week_start(now()),
    'week_end', (public.dublin_week_start(now()) + 6),
    'server_time', now()
  );
$$;

-- ---------------------------------------------------------------------------
-- Admin (committee) functions. Every one verifies the code first.
-- The code is stored as a SHA-256 hash in settings.admin_code_hash.
-- Change it with: select public.admin_set_code('<current code>', '<new code>');
-- ---------------------------------------------------------------------------
-- Returns null when the code is right, otherwise an error code. Errors are returned rather than
-- raised so the failed attempt stays recorded (a raise would roll it back).
create or replace function public.admin_verify(p_code text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash  text;
  v_until timestamptz;
begin
  select locked_until into v_until from public.auth_attempts where scope = 'admin';
  if v_until is not null and v_until > now() then
    return 'LOCKED';
  end if;
  select value into v_hash from public.settings where key = 'admin_code_hash';
  if v_hash is null or v_hash = '' then
    return 'ADMIN_NOT_SET';
  end if;
  if coalesce(p_code, '') = '' or encode(sha256(convert_to(p_code, 'UTF8')), 'hex') <> v_hash then
    perform public.note_attempt('admin', false, 8, interval '15 minutes');
    return 'BAD_ADMIN';
  end if;
  perform public.note_attempt('admin', true, 8, interval '15 minutes');
  return null;
end;
$$;

create or replace function public.admin_set_code(p_code text, p_new_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_err text;
begin
  -- Allowed without the old code only while no code is set yet.
  if exists (select 1 from public.settings where key = 'admin_code_hash' and coalesce(value, '') <> '') then
    v_err := public.admin_verify(p_code);
    if v_err is not null then return jsonb_build_object('error', v_err); end if;
  end if;
  if length(coalesce(p_new_code, '')) < 6 then
    return jsonb_build_object('error', 'CODE_TOO_SHORT');
  end if;
  update public.settings set value = encode(sha256(convert_to(p_new_code, 'UTF8')), 'hex')
   where key = 'admin_code_hash';
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_set_settings(p_code text, p_goal_cents integer, p_prize_text text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_err text := public.admin_verify(p_code);
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  if p_goal_cents is not null and p_goal_cents >= 0 then
    update public.settings set value = p_goal_cents::text where key = 'goal_cents';
  end if;
  if p_prize_text is not null then
    update public.settings set value = left(p_prize_text, 200) where key = 'prize_text';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_void_play(p_code text, p_play_id uuid, p_voided boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_err text := public.admin_verify(p_code);
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  update public.plays set voided = p_voided, void_reason = case when p_voided then left(coalesce(p_reason, 'committee'), 200) else null end
   where id = p_play_id;
  if not found then
    return jsonb_build_object('error', 'PLAY_NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_ban_player(p_code text, p_player_id uuid, p_banned boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_err text := public.admin_verify(p_code);
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  update public.players set banned = p_banned where id = p_player_id;
  if not found then
    return jsonb_build_object('error', 'PLAYER_NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_block_initials(p_code text, p_initials text, p_block boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_initials text := upper(trim(coalesce(p_initials, '')));
  v_err text := public.admin_verify(p_code);
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  if v_initials !~ '^[A-Z]{3}$' then
    return jsonb_build_object('error', 'BAD_INITIALS');
  end if;
  if p_block then
    insert into public.blocked_initials (initials, note) values (v_initials, 'committee') on conflict do nothing;
  else
    delete from public.blocked_initials where initials = v_initials;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Everything the admin screen shows, in one call.
create or replace function public.admin_overview(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_week date := public.dublin_week_start(now());
  v_board jsonb;
  v_winners jsonb;
  v_payments jsonb;
  v_blocked jsonb;
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
    from ranked r where r.rank <= 25;

  with scored as (
    select pl.week_start, p.role::text as role, p.initials, p.claim_code, pl.score, pl.finished_at
      from public.plays pl join public.players p on p.id = pl.player_id
     where pl.score is not null and not pl.voided and not p.banned and pl.week_start < v_week
  ),
  w as (
    select distinct on (s.week_start, s.role) s.week_start, s.role, s.initials, s.claim_code, s.score
      from scored s order by s.week_start desc, s.role, s.score desc, s.finished_at asc
  )
  select coalesce(jsonb_agg(to_jsonb(w) order by w.week_start desc, w.role), '[]'::jsonb) into v_winners from w;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_payments from (
    select pm.created_at, p.initials, pm.bundle, pm.credits, pm.amount_cents, pm.email, pm.source, pm.stripe_session_id
      from public.payments pm join public.players p on p.id = pm.player_id
     order by pm.created_at desc limit 30
  ) x;

  select coalesce(jsonb_agg(b.initials order by b.initials), '[]'::jsonb) into v_blocked
    from public.blocked_initials b where b.note = 'committee';

  return jsonb_build_object(
    'stats', public.stats(),
    'board', v_board,
    'past_winners', v_winners,
    'payments', v_payments,
    'blocked_by_committee', v_blocked,
    'banned', (select coalesce(jsonb_agg(jsonb_build_object('player_id', id, 'initials', initials, 'claim_code', claim_code)), '[]'::jsonb)
                 from public.players where banned)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.check_locked(text) from public, anon, authenticated;
revoke execute on function public.note_attempt(text, boolean, integer, interval) from public, anon, authenticated;
revoke execute on function public.signin_player(text, text) from public, anon, authenticated;
revoke execute on function public.admin_verify(text) from public, anon, authenticated;
revoke execute on function public.admin_set_code(text, text) from public, anon, authenticated;
revoke execute on function public.admin_set_settings(text, integer, text) from public, anon, authenticated;
revoke execute on function public.admin_void_play(text, uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.admin_ban_player(text, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.admin_block_initials(text, text, boolean) from public, anon, authenticated;
revoke execute on function public.admin_overview(text) from public, anon, authenticated;

grant execute on function public.signin_player(text, text) to service_role;
grant execute on function public.admin_set_code(text, text) to service_role;
grant execute on function public.admin_set_settings(text, integer, text) to service_role;
grant execute on function public.admin_void_play(text, uuid, boolean, text) to service_role;
grant execute on function public.admin_ban_player(text, uuid, boolean) to service_role;
grant execute on function public.admin_block_initials(text, text, boolean) to service_role;
grant execute on function public.admin_overview(text) to service_role;
