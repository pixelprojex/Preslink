-- PresLink Arcade: initial schema
-- Tables are private (RLS on, no policies). The browser only ever calls the
-- read-only RPCs at the bottom (leaderboard, past_winners, stats). Everything
-- that changes data goes through the Edge Functions with the service role.


do $$ begin
  create type public.player_role as enum ('student', 'teacher');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.players (
  id            uuid primary key default gen_random_uuid(),
  initials      text not null check (initials ~ '^[A-Z]{3}$'),
  role          public.player_role not null,
  claim_code    text not null check (claim_code ~ '^[0-9]{4}$'),
  credits       integer not null default 0 check (credits >= 0),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create index if not exists players_initials_idx on public.players (initials);

create table if not exists public.payments (
  id                    uuid primary key default gen_random_uuid(),
  stripe_session_id     text not null unique,
  stripe_payment_intent text,
  player_id             uuid not null references public.players (id),
  bundle                text not null,
  credits               integer not null check (credits > 0),
  amount_cents          integer not null check (amount_cents > 0),
  currency              text not null default 'eur',
  email                 text,
  source                text not null check (source in ('webhook', 'confirm', 'manual')),
  created_at            timestamptz not null default now()
);
create index if not exists payments_player_idx on public.payments (player_id);
create index if not exists payments_created_idx on public.payments (created_at);

create table if not exists public.plays (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.players (id),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  score        integer check (score between 0 and 1000),
  tap_ms       integer,
  phase        double precision not null,   -- where the light starts (0..1 of a full there-and-back cycle)
  speed_ms     integer not null,            -- ms for the light to cross the bar once
  week_start   date,                        -- Monday (Europe/Dublin) of the week the score counts for
  voided       boolean not null default false,
  void_reason  text,
  client       jsonb
);
create index if not exists plays_player_idx on public.plays (player_id);
create index if not exists plays_week_score_idx on public.plays (week_start, score desc)
  where score is not null and not voided;

alter table public.players  enable row level security;
alter table public.payments enable row level security;
alter table public.plays    enable row level security;
revoke all on public.players, public.payments, public.plays from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.dublin_week_start(ts timestamptz)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (date_trunc('week', ts at time zone 'Europe/Dublin'))::date;
$$;

create or replace function public.player_tag(p_id uuid)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select left(md5(p_id::text), 8);
$$;

-- Score the game exactly the way the browser does, from the tap time.
-- x = tap_ms / speed_ms + phase, folded into a there-and-back sweep.
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
  return round(1000 * (1 - 2 * abs(v_pos - 0.5)))::integer;
end;
$$;

-- ---------------------------------------------------------------------------
-- Write RPCs (service role only, called from Edge Functions)
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
  if v_initials in ('ASS','FUK','FUC','FCK','FUQ','SEX','KKK','NIG','NGR','CUM','DIK','DIC','DIX',
                    'COK','CCK','TIT','FAG','FGT','CNT','WTF','STD','PIS','VAG','PNS','HOE','SLT','KYS') then
    raise exception 'BAD_INITIALS';
  end if;
  if p_role not in ('student', 'teacher') then
    raise exception 'BAD_ROLE';
  end if;

  insert into public.players (initials, role, claim_code)
  values (v_initials, p_role::public.player_role, lpad(floor(random() * 10000)::int::text, 4, '0'))
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'tag', public.player_tag(v_row.id),
    'initials', v_row.initials,
    'role', v_row.role,
    'claim_code', v_row.claim_code,
    'credits', v_row.credits
  );
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
    'best_this_week', v_best,
    'open_play', case when v_open.id is null then null else jsonb_build_object(
        'play_id', v_open.id, 'phase', v_open.phase, 'speed_ms', v_open.speed_ms) end
  );
end;
$$;

-- Idempotent: the same Stripe session can be reported by the webhook and by the
-- browser's confirm call; credits are only added the first time.
create or replace function public.grant_credits(
  p_session_id text,
  p_payment_intent text,
  p_player_id uuid,
  p_bundle text,
  p_credits integer,
  p_amount_cents integer,
  p_currency text,
  p_email text,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment_id uuid;
  v_credits    integer;
begin
  insert into public.payments (stripe_session_id, stripe_payment_intent, player_id, bundle, credits,
                               amount_cents, currency, email, source)
  values (p_session_id, p_payment_intent, p_player_id, p_bundle, p_credits,
          p_amount_cents, coalesce(p_currency, 'eur'), p_email, p_source)
  on conflict (stripe_session_id) do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    select credits into v_credits from public.players where id = p_player_id;
    return jsonb_build_object('granted', false, 'credits', v_credits);
  end if;

  update public.players set credits = credits + p_credits, last_seen_at = now()
   where id = p_player_id returning credits into v_credits;

  return jsonb_build_object('granted', true, 'credits', v_credits);
end;
$$;

-- Spends one credit and opens a play. If the player already has an open
-- (unscored) play, that play is returned instead so a refresh never costs a credit.
create or replace function public.start_play(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_play    public.plays;
  v_credits integer;
begin
  perform 1 from public.players where id = p_player_id for update;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
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

create or replace function public.submit_score(
  p_player_id uuid,
  p_play_id uuid,
  p_score integer,
  p_tap_ms integer,
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
  v_expected   integer;
  v_week       date;
  v_best       integer;
  v_rank       integer;
  v_credits    integer;
  v_role       public.player_role;
begin
  select * into v_play from public.plays where id = p_play_id and player_id = p_player_id for update;
  if not found then
    raise exception 'PLAY_NOT_FOUND';
  end if;
  if v_play.voided then
    raise exception 'PLAY_VOID';
  end if;
  if v_play.score is not null then
    raise exception 'ALREADY_SCORED';
  end if;
  if p_score is null or p_score < 0 or p_score > 1000 then
    raise exception 'BAD_SCORE';
  end if;
  if p_tap_ms is null or p_tap_ms < 150 or p_tap_ms > 600000 then
    raise exception 'BAD_TAP';
  end if;

  -- The tap cannot have happened later than the time that has really passed.
  v_elapsed_ms := extract(epoch from (now() - v_play.started_at)) * 1000;
  if p_tap_ms > v_elapsed_ms + 2000 then
    raise exception 'BAD_TAP';
  end if;

  -- The score must be the score the light actually gives at that tap time.
  v_expected := public.expected_score(p_tap_ms, v_play.phase, v_play.speed_ms);
  if abs(v_expected - p_score) > 5 then
    raise exception 'SCORE_MISMATCH';
  end if;

  v_week := public.dublin_week_start(now());

  update public.plays
     set score = v_expected, tap_ms = p_tap_ms, finished_at = now(), week_start = v_week, client = p_client
   where id = p_play_id;

  select credits, role into v_credits, v_role from public.players where id = p_player_id;

  select max(score) into v_best from public.plays
   where player_id = p_player_id and week_start = v_week and score is not null and not voided;

  select rank into v_rank from public.leaderboard(v_role::text, v_week)
   where tag = public.player_tag(p_player_id);

  return jsonb_build_object(
    'score', v_expected,
    'best_this_week', v_best,
    'rank', v_rank,
    'credits', v_credits,
    'week_start', v_week
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Public read RPCs (anon may call these)
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
     where pl.week_start = coalesce(p_week, public.dublin_week_start(now()))
       and pl.score is not null and not pl.voided
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
     where pl.score is not null and not pl.voided
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
    'payments', (select count(*) from public.payments),
    'plays', (select count(*) from public.plays where score is not null and not voided),
    'players', (select count(*) from public.players),
    'week_start', public.dublin_week_start(now()),
    'week_end', (public.dublin_week_start(now()) + 6),
    'server_time', now()
  );
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function public.register_player(text, text) from public, anon, authenticated;
revoke execute on function public.me_player(uuid) from public, anon, authenticated;
revoke execute on function public.grant_credits(text, text, uuid, text, integer, integer, text, text, text) from public, anon, authenticated;
revoke execute on function public.start_play(uuid) from public, anon, authenticated;
revoke execute on function public.submit_score(uuid, uuid, integer, integer, jsonb) from public, anon, authenticated;
revoke execute on function public.expected_score(integer, double precision, integer) from public, anon, authenticated;
revoke execute on function public.player_tag(uuid) from public, anon, authenticated;
revoke execute on function public.dublin_week_start(timestamptz) from public, anon, authenticated;

grant execute on function public.register_player(text, text) to service_role;
grant execute on function public.me_player(uuid) to service_role;
grant execute on function public.grant_credits(text, text, uuid, text, integer, integer, text, text, text) to service_role;
grant execute on function public.start_play(uuid) to service_role;
grant execute on function public.submit_score(uuid, uuid, integer, integer, jsonb) to service_role;

grant execute on function public.leaderboard(text, date) to anon, authenticated, service_role;
grant execute on function public.past_winners() to anon, authenticated, service_role;
grant execute on function public.stats() to anon, authenticated, service_role;
