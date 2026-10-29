-- 0031: controls for the committee to run the game. Nothing here changes the site's words, photos, prizes, dates,
-- goal, limits or settings: those stay with the owner.
-- 1. Free plays. When a play fails through a fault on our side (Terms, 7: "we will give you a new play or a
--    refund"), the committee gives a new play with a short reason. It is kept in free_plays, not in payments, so the
--    money raised and the spending limits don't move. At most three per player in all (settings.free_play_limit).
-- 2. Winners: the top three of each prize slot under the public rules, with the code a winner shows to collect and
--    the emails to reach them.
-- 3. Blocked names: the committee's own list beside the site's built-in one. The committee can unblock only the
--    names it blocked; the built-in list stays.
-- 4. The campaign at a glance, read only: the close, the goal, the spending limits and the prize mode.
-- 5. The payments list and a player's record carry refunds and the Stripe payment intent; the record lists free plays.
-- Every function checks the committee code (admin_verify, with its lockout) and returns errors rather than raising
-- them, like the admin functions before it. None can be run by anon or authenticated.

-- ---------------------------------------------------------------------------
-- 1. Free plays
-- ---------------------------------------------------------------------------
insert into public.settings (key, value) values ('free_play_limit', '3') on conflict (key) do nothing;

create table if not exists public.free_plays (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references public.players (id),
  reason     text not null check (length(reason) between 3 and 200),
  created_at timestamptz not null default now()
);
create index if not exists free_plays_player_idx on public.free_plays (player_id, created_at);
alter table public.free_plays enable row level security;
revoke all on table public.free_plays from public, anon, authenticated;

-- One credit, with the reason kept beside it. The player's row is locked first, so two clicks at once can't pass the
-- limit. Refused for a banned player (unban first) and after the close, when no new play can start (a refund is the
-- remedy then).
create or replace function public.admin_give_play(p_code text, p_player_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_err     text := public.admin_verify(p_code);
  v_reason  text := left(trim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g')), 200);
  v_limit   integer := coalesce((select value::integer from public.settings where key = 'free_play_limit'), 3);
  v_banned  boolean;
  v_given   integer;
  v_credits integer;
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  if length(v_reason) < 3 then return jsonb_build_object('error', 'BAD_REASON'); end if;
  select banned into v_banned from public.players where id = p_player_id for update;
  if not found then return jsonb_build_object('error', 'PLAYER_NOT_FOUND'); end if;
  if v_banned then return jsonb_build_object('error', 'BANNED'); end if;
  if now() >= public.campaign_close() then return jsonb_build_object('error', 'CLOSED'); end if;
  select count(*) into v_given from public.free_plays where player_id = p_player_id;
  if v_given >= v_limit then return jsonb_build_object('error', 'FREE_PLAY_LIMIT'); end if;
  insert into public.free_plays (player_id, reason) values (p_player_id, v_reason);
  update public.players set credits = credits + 1 where id = p_player_id returning credits into v_credits;
  return jsonb_build_object('ok', true, 'credits', v_credits, 'given', v_given + 1, 'limit', v_limit);
end;
$$;

-- admin_player: as 0014, and each payment carries its refund, payment intent and source; the record lists the free
-- plays given, newest first, and the limit.
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
    'player', jsonb_build_object('id', v_row.id, 'initials', public.display_name(v_row.initials, v_row.suffix), 'role', v_row.role,
                                 'school_email', v_row.school_email, 'contact_email', v_row.contact_email, 'claim_code', v_row.claim_code,
                                 'credits', v_row.credits, 'banned', v_row.banned, 'created_at', v_row.created_at, 'last_seen_at', v_row.last_seen_at),
    'others', (select coalesce(jsonb_agg(public.display_name(initials, suffix) order by suffix), '[]'::jsonb) from public.players where initials = v_initials and id <> v_row.id),
    'plays', (select coalesce(jsonb_agg(jsonb_build_object('play_id', id, 'started_at', started_at, 'finished_at', finished_at, 'score', score,
                                                           'best_light', public.play_best_light(taps, rounds, speed_ms, score),
                                                           'week_start', week_start, 'voided', voided, 'void_reason', void_reason) order by started_at desc), '[]'::jsonb)
                from public.plays where player_id = v_row.id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('created_at', created_at, 'bundle', bundle, 'credits', credits, 'amount_cents', amount_cents,
                                                              'refunded_cents', refunded_cents, 'email', email, 'source', source,
                                                              'stripe_session_id', stripe_session_id, 'stripe_payment_intent', stripe_payment_intent)
                                           order by created_at desc), '[]'::jsonb)
                   from public.payments where player_id = v_row.id),
    'free_plays', (select coalesce(jsonb_agg(jsonb_build_object('created_at', created_at, 'reason', reason) order by created_at desc), '[]'::jsonb)
                     from public.free_plays where player_id = v_row.id),
    'free_play_limit', coalesce((select value::integer from public.settings where key = 'free_play_limit'), 3)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Winners
-- ---------------------------------------------------------------------------
-- The top three of each prize slot, as the public site ranks them. The boards are campaign_board(), which board()
-- reads: banned players and cancelled plays left out, equal scores to the earlier one. Best light and first play are
-- spot_prizes() (0026) three deep: the same plays, the same lights, the same order. If those rules change, this
-- changes with them.
create or replace function public.admin_winners(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_err   text := public.admin_verify(p_code);
  v_slots jsonb;
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  with plays_ok as (
    select pl.id, pl.player_id, pl.started_at, pl.finished_at, pl.score, pl.taps, pl.rounds, pl.speed_ms,
           (pl.taps is not null and jsonb_typeof(pl.taps) = 'array' and pl.rounds is not null and jsonb_typeof(pl.rounds) = 'array') as has_lights
      from public.plays pl
      join public.players p on p.id = pl.player_id
     where pl.score is not null and not pl.voided and not p.banned
  ),
  lights as (
    select o.id as play_id, o.player_id, o.finished_at,
           case when o.has_lights
                then public.round_score((o.taps->>i)::integer, (o.rounds->i->>'phase')::double precision,
                                        (o.rounds->i->>'target')::double precision, o.speed_ms)
                else o.score end as light
      from plays_ok o
      cross join generate_series(0, 2) as i
     where (o.has_lights and i < least(jsonb_array_length(o.taps), jsonb_array_length(o.rounds)))
        or (not o.has_lights and i = 0)
  ),
  per_player as (
    select l.player_id,
           (array_agg(l.light order by l.light desc, l.finished_at asc))[1:3] as top,
           (array_agg(l.finished_at order by l.light desc, l.finished_at asc))[1] as at1
      from lights l
     group by l.player_id
  ),
  bl as (
    select pp.player_id, pp.top[1] as score, pp.at1 as achieved_at, to_jsonb(pp.top) as lights,
           row_number() over (order by pp.top[1] desc, coalesce(pp.top[2], -1) desc, coalesce(pp.top[3], -1) desc, pp.at1 asc) as rank
      from per_player pp
  ),
  firsts as (
    select distinct on (o.player_id) o.id, o.player_id, o.score, o.finished_at
      from plays_ok o
     order by o.player_id, o.started_at asc
  ),
  first_lights as (
    select f.player_id, (array_agg(l.light order by l.light desc))[1:3] as top
      from firsts f
      join lights l on l.play_id = f.id
     group by f.player_id
  ),
  fp as (
    select f.player_id, f.score, f.finished_at as achieved_at, to_jsonb(fl.top) as lights,
           row_number() over (order by f.score desc, coalesce(fl.top[1], -1) desc, coalesce(fl.top[2], -1) desc,
                                       coalesce(fl.top[3], -1) desc, f.finished_at asc) as rank
      from firsts f
      left join first_lights fl on fl.player_id = f.player_id
  ),
  slots as (
    select 'everyone'::text as slot, b.rank::integer as rank, b.player_id, b.score, b.achieved_at, null::jsonb as lights
      from public.campaign_board('everyone', null::date) b where b.rank <= 3
    union all
    select 'students', b.rank::integer, b.player_id, b.score, b.achieved_at, null
      from public.campaign_board('student', null::date) b where b.rank <= 3
    union all
    select 'teachers', b.rank::integer, b.player_id, b.score, b.achieved_at, null
      from public.campaign_board('teacher', null::date) b where b.rank <= 3
    union all
    select 'best_light', x.rank::integer, x.player_id, x.score, x.achieved_at, x.lights from bl x where x.rank <= 3
    union all
    select 'first_play', x.rank::integer, x.player_id, x.score, x.achieved_at, x.lights from fp x where x.rank <= 3
  )
  select jsonb_object_agg(g.slot, g.rows) into v_slots
    from (
      select s.slot, jsonb_agg(jsonb_build_object(
               'rank', s.rank, 'player_id', p.id, 'initials', public.display_name(p.initials, p.suffix), 'role', p.role::text,
               'score', s.score, 'achieved_at', s.achieved_at, 'lights', s.lights, 'claim_code', p.claim_code,
               'contact_email', p.contact_email, 'school_email', p.school_email, 'banned', p.banned) order by s.rank) as rows
        from slots s
        join public.players p on p.id = s.player_id
       group by s.slot
    ) g;
  v_slots := coalesce(v_slots, '{}'::jsonb);
  return jsonb_build_object(
    'everyone',   coalesce(v_slots->'everyone', '[]'::jsonb),
    'students',   coalesce(v_slots->'students', '[]'::jsonb),
    'teachers',   coalesce(v_slots->'teachers', '[]'::jsonb),
    'best_light', coalesce(v_slots->'best_light', '[]'::jsonb),
    'first_play', coalesce(v_slots->'first_play', '[]'::jsonb),
    'ends_on',    coalesce((select value from public.settings where key = 'ends_on'), ''),
    'closes_at',  public.campaign_close(),
    'prize_mode', case when (select value from public.settings where key = 'prize_mode') = 'honours' then 'honours' else 'prizes' end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Blocked names
-- ---------------------------------------------------------------------------
-- The names the committee blocked, with when, and how many players already have those letters (a block stops new
-- players choosing them; a player who has them keeps them until the committee resets the name); and the site's own.
create or replace function public.admin_blocked(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_err text := public.admin_verify(p_code);
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  return jsonb_build_object(
    'committee', (select coalesce(jsonb_agg(jsonb_build_object('initials', b.initials, 'created_at', b.created_at,
                                                               'players', (select count(*) from public.players p where p.initials = b.initials))
                                            order by b.initials), '[]'::jsonb)
                    from public.blocked_initials b where b.note = 'committee'),
    'built_in', (select coalesce(jsonb_agg(b.initials order by b.initials), '[]'::jsonb)
                   from public.blocked_initials b where b.note is distinct from 'committee'));
end;
$$;

-- Unblock a name the committee blocked. The site's own names stay blocked (BUILT_IN_NAME); a name that isn't blocked
-- is left as it is. The unblocking itself is admin_block_initials' (0002), which checks the code again.
create or replace function public.admin_unblock_initials(p_code text, p_initials text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_err      text := public.admin_verify(p_code);
  v_initials text := upper(trim(coalesce(p_initials, '')));
  v_note     text;
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  if v_initials !~ '^[A-Z]{3}$' then return jsonb_build_object('error', 'BAD_INITIALS'); end if;
  select note into v_note from public.blocked_initials where initials = v_initials;
  if not found then return jsonb_build_object('ok', true); end if;
  if v_note is distinct from 'committee' then return jsonb_build_object('error', 'BUILT_IN_NAME'); end if;
  return public.admin_block_initials(p_code, v_initials, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The campaign at a glance (read only: the owner sets all of it)
-- ---------------------------------------------------------------------------
-- The same values and defaults as stats(), player_spend() and campaign_close() read.
create or replace function public.admin_campaign(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_err   text := public.admin_verify(p_code);
  v_close timestamptz := public.campaign_close();
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  return jsonb_build_object(
    'ends_on', coalesce((select value from public.settings where key = 'ends_on'), ''),
    'closes_at', v_close,
    'closed', coalesce(now() >= v_close, false),
    'goal_cents', coalesce((select value::integer from public.settings where key = 'goal_cents'), 0),
    'prize_mode', case when (select value from public.settings where key = 'prize_mode') = 'honours' then 'honours' else 'prizes' end,
    'daily_cap_cents', coalesce((select value::integer from public.settings where key = 'daily_cap_cents'), 2000),
    'campaign_cap_cents', coalesce((select value::integer from public.settings where key = 'campaign_cap_cents'), 10000),
    'free_play_limit', coalesce((select value::integer from public.settings where key = 'free_play_limit'), 3),
    'server_time', now());
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Payments with their refunds
-- ---------------------------------------------------------------------------
-- admin_payments: as 0023, and each row carries refunded_cents; the page carries the refunds of everything that
-- matched beside the count and the sum, which stays the amount paid before refunds.
create or replace function public.admin_payments(p_code text, p_q text default null, p_from date default null, p_to date default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_err      text := public.admin_verify(p_code);
  v_q        text := nullif(lower(trim(coalesce(p_q, ''))), '');
  v_rows     jsonb;
  v_total    bigint;
  v_sum      bigint;
  v_refunded bigint;
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  select coalesce(jsonb_agg((to_jsonb(x) - 'total' - 'sum_cents' - 'refunded_total') order by x.created_at desc), '[]'::jsonb),
         coalesce(max(x.total), 0), coalesce(max(x.sum_cents), 0), coalesce(max(x.refunded_total), 0)
    into v_rows, v_total, v_sum, v_refunded
    from (
      select f.*, count(*) over () as total, sum(f.amount_cents) over () as sum_cents, sum(f.refunded_cents) over () as refunded_total
        from (
          select pm.id, pm.created_at, public.display_name(p.initials, p.suffix) as initials, p.id as player_id, p.role::text as role,
                 pm.bundle, pm.credits, pm.amount_cents, pm.refunded_cents, pm.email, pm.source, pm.stripe_session_id, pm.stripe_payment_intent,
                 p.contact_email
            from public.payments pm
            join public.players p on p.id = pm.player_id
           where (p_from is null or (pm.created_at at time zone 'Europe/Dublin')::date >= p_from)
             and (p_to is null or (pm.created_at at time zone 'Europe/Dublin')::date <= p_to)
             and (v_q is null
                  or lower(public.display_name(p.initials, p.suffix)) like v_q || '%'
                  or lower(coalesce(pm.email, '')) like '%' || v_q || '%'
                  or lower(coalesce(p.contact_email, '')) like '%' || v_q || '%'
                  or lower(pm.stripe_session_id) like '%' || v_q || '%'
                  or lower(coalesce(pm.stripe_payment_intent, '')) like '%' || v_q || '%'
                  or lower(pm.bundle) = v_q
                  or (v_q ~ '^[0-9]+$' and pm.amount_cents = v_q::integer * 100))
        ) f
       order by f.created_at desc
       limit greatest(1, least(coalesce(p_limit, 50), 500)) offset greatest(0, coalesce(p_offset, 0))
    ) x;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'sum_cents', v_sum, 'refunded_cents', v_refunded);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: the service role (the API) only, as 0029 and 0030
-- ---------------------------------------------------------------------------
revoke execute on function public.admin_give_play(text, uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_player(text, text) from public, anon, authenticated;
revoke execute on function public.admin_winners(text) from public, anon, authenticated;
revoke execute on function public.admin_blocked(text) from public, anon, authenticated;
revoke execute on function public.admin_unblock_initials(text, text) from public, anon, authenticated;
revoke execute on function public.admin_campaign(text) from public, anon, authenticated;
revoke execute on function public.admin_payments(text, text, date, date, integer, integer) from public, anon, authenticated;

grant execute on function public.admin_give_play(text, uuid, text) to service_role;
grant execute on function public.admin_player(text, text) to service_role;
grant execute on function public.admin_winners(text) to service_role;
grant execute on function public.admin_blocked(text) to service_role;
grant execute on function public.admin_unblock_initials(text, text) to service_role;
grant execute on function public.admin_campaign(text) to service_role;
grant execute on function public.admin_payments(text, text, date, date, integer, integer) to service_role;
