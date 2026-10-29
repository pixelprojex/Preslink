-- 0030: integrity fixes from the pre-launch review.
-- 1. The closing date holds: after the end of ends_on (Dublin), no checkout opens and no play starts. A play
--    under way at the close can still be finished for an hour, so the boards stop moving at the close.
-- 2. A play's taps must fit in the time that has really passed since it started, within a second (was three).
-- 3. Sign-in lockouts grow: five wrong codes lock those initials for 15 minutes, the next five for 30, then an
--    hour, up to 16 hours. The count resets after a correct code, or a day without a wrong one.
-- 4. A demo checkout grants its plays once: its session id is recorded like a real payment's.
-- 5. Refunds made in Stripe come back here: the refunded amount leaves the total raised and the spending limits,
--    and the unused plays it paid for are taken off.
-- 6. site_content() is not read by the browser (stats() carries the content), so the public can't run it.

-- ---------------------------------------------------------------------------
-- 1. The close
-- ---------------------------------------------------------------------------
-- Midnight at the end of the closing date, Dublin time; null while no date is set.
create or replace function public.campaign_close()
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ((value::date + 1)::timestamp at time zone 'Europe/Dublin')
    from public.settings
   where key = 'ends_on' and value ~ '^\d{4}-\d{2}-\d{2}$';
$$;
revoke execute on function public.campaign_close() from public, anon, authenticated;
grant execute on function public.campaign_close() to service_role;

-- spend_check: as 0025, and nothing more is sold after the close.
create or replace function public.spend_check(p_player_id uuid, p_amount_cents integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  if now() >= public.campaign_close() then
    raise exception 'CLOSED';
  end if;
  v := public.player_spend(p_player_id);
  if (v->>'spent_today_cents')::integer + coalesce(p_amount_cents, 0) > (v->>'daily_cap_cents')::integer then
    raise exception 'DAILY_LIMIT';
  end if;
  if (v->>'spent_cents')::integer + coalesce(p_amount_cents, 0) > (v->>'campaign_cap_cents')::integer then
    raise exception 'SPEND_LIMIT';
  end if;
  return v;
end;
$$;
revoke execute on function public.spend_check(uuid, integer) from public, anon, authenticated;
grant execute on function public.spend_check(uuid, integer) to service_role;

-- start_play: as 0025; after the close an open play can still be finished, but no new one starts.
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
  if now() >= public.campaign_close() then
    raise exception 'CLOSED';
  end if;
  update public.plays set voided = true, void_reason = 'superseded'
   where player_id = p_player_id and score is null and not voided and rounds is null;

  update public.players set credits = credits - 1, last_seen_at = now()
   where id = p_player_id and credits > 0
   returning credits into v_credits;
  if not found then
    raise exception 'NO_CREDITS';
  end if;

  -- One second per pass, every play; the day's three lights, the same for everyone.
  v_rounds := public.day_rounds((now() at time zone 'Europe/Dublin')::date);

  insert into public.plays (player_id, phase, speed_ms, rounds)
  values (p_player_id, (v_rounds->0->>'phase')::double precision, 1000, v_rounds)
  returning * into v_play;
  return jsonb_build_object('play_id', v_play.id, 'speed_ms', v_play.speed_ms, 'rounds', v_play.rounds,
                            'credits', v_credits, 'resumed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 1 and 2. submit_play: as 0015, with the close and a one-second allowance
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
  v_close      timestamptz := public.campaign_close();
  i            integer;
begin
  select * into v_play from public.plays where id = p_play_id and player_id = p_player_id for update;
  if not found then raise exception 'PLAY_NOT_FOUND'; end if;
  if v_play.voided then raise exception 'PLAY_VOID'; end if;
  if v_play.score is not null then raise exception 'ALREADY_SCORED'; end if;
  if v_play.rounds is null then raise exception 'PLAY_VOID'; end if;
  -- A play started before the close may be finished within the hour after it; nothing later counts.
  if v_close is not null and (v_play.started_at >= v_close or now() >= v_close + interval '1 hour') then
    raise exception 'CLOSED';
  end if;
  if p_score is null or p_score < 0 or p_score > 1000 then raise exception 'BAD_SCORE'; end if;
  if p_taps is null or jsonb_typeof(p_taps) <> 'array' or jsonb_array_length(p_taps) <> 3 then raise exception 'BAD_TAP'; end if;

  for i in 0..2 loop
    if jsonb_typeof(p_taps->i) <> 'number' then raise exception 'BAD_TAP'; end if;
    v_tap := (p_taps->>i)::integer;
    if v_tap < 60 or v_tap > 120000 then raise exception 'BAD_TAP'; end if;
    v_sum := v_sum + v_tap;
    v_scores := v_scores || public.round_score(v_tap, (v_play.rounds->i->>'phase')::double precision,
                                               (v_play.rounds->i->>'target')::double precision, v_play.speed_ms);
  end loop;

  -- The three sweeps ran one after another, after the play was handed out: they cannot add up to more time than
  -- has really passed. The second allows for a phone's timing offset (up to 80 ms a light) and rounding.
  v_elapsed_ms := extract(epoch from (now() - v_play.started_at)) * 1000;
  if v_sum > v_elapsed_ms + 1000 then raise exception 'BAD_TAP'; end if;

  -- The server's own number is the score. The browser shows this one, whatever it worked out itself.
  v_expected := round((v_scores[1] + v_scores[2] + v_scores[3])::numeric / 3)::integer;

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
-- 3. Sign-in lockouts that grow
-- ---------------------------------------------------------------------------
alter table public.auth_attempts add column if not exists strikes integer not null default 0;

create or replace function public.note_signin_attempt(p_scope text, p_ok boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_ok then -- a right code: the slate is clean again
    update public.auth_attempts set fails = 0, strikes = 0, locked_until = null, updated_at = now() where scope = p_scope;
    return;
  end if;
  insert into public.auth_attempts (scope, fails, updated_at) values (p_scope, 1, now())
  on conflict (scope) do update
    set fails   = case when public.auth_attempts.updated_at < now() - interval '1 day' then 1 else public.auth_attempts.fails + 1 end,
        strikes = case when public.auth_attempts.updated_at < now() - interval '1 day' then 0 else public.auth_attempts.strikes end,
        updated_at = now();
  update public.auth_attempts
     set locked_until = now() + interval '15 minutes' * power(2, least(strikes, 6)),
         strikes = strikes + 1,
         fails = 0
   where scope = p_scope and fails >= 5;
end;
$$;
revoke execute on function public.note_signin_attempt(text, boolean) from public, anon, authenticated;

-- signin_player: as 0005, with the growing lockout.
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
    perform public.note_signin_attempt(v_scope, false);
    return jsonb_build_object('error', 'BAD_SIGNIN');
  end if;
  perform public.note_signin_attempt(v_scope, true);
  return public.me_player(v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Demo plays granted once per demo checkout
-- ---------------------------------------------------------------------------
create or replace function public.grant_demo_credits(p_player_id uuid, p_credits integer, p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_credits integer;
  v_id      uuid;
begin
  if p_credits is null or p_credits not in (1, 3, 7) then
    raise exception 'BAD_CREDITS';
  end if;
  if coalesce(p_session_id, '') !~ '^cs_demo_' then
    raise exception 'BAD_SESSION';
  end if;
  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  insert into public.payments (stripe_session_id, stripe_payment_intent, player_id, bundle, credits, amount_cents, currency, email, source)
  values (p_session_id, null, p_player_id,
          case p_credits when 1 then 'single' when 3 then 'triple' else 'seven' end, p_credits,
          case p_credits when 1 then 200 when 3 then 500 else 1000 end, 'eur', null, 'manual')
  on conflict (stripe_session_id) do nothing
  returning id into v_id;
  if v_id is not null then
    update public.players set credits = credits + p_credits, last_seen_at = now()
     where id = p_player_id returning credits into v_credits;
  else
    select credits into v_credits from public.players where id = p_player_id;
  end if;
  return jsonb_build_object('credits', v_credits, 'granted', v_id is not null);
end;
$$;
revoke execute on function public.grant_demo_credits(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.grant_demo_credits(uuid, integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Refunds
-- ---------------------------------------------------------------------------
alter table public.payments add column if not exists refunded_cents integer not null default 0;

-- Called by the webhook with Stripe's running total refunded on the payment's charge. The plays taken off are the
-- share of the bundle the refund covers (a €2 refund of 3 plays for €5 takes one), less what earlier refunds took,
-- and never more than the player still has.
create or replace function public.refund_payment(p_payment_intent text, p_refunded_cents integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pay    public.payments;
  v_new    integer;
  v_remove integer;
  v_left   integer;
begin
  select * into v_pay from public.payments where stripe_payment_intent = p_payment_intent for update;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  v_new := greatest(v_pay.refunded_cents, least(v_pay.amount_cents, coalesce(p_refunded_cents, 0)));
  v_remove := floor(v_pay.credits * v_new::numeric / v_pay.amount_cents)::integer
            - floor(v_pay.credits * v_pay.refunded_cents::numeric / v_pay.amount_cents)::integer;
  update public.payments set refunded_cents = v_new where id = v_pay.id;
  update public.players set credits = greatest(0, credits - v_remove) where id = v_pay.player_id
  returning credits into v_left;
  return jsonb_build_object('found', true, 'refunded_cents', v_new, 'plays_removed', v_remove, 'credits', v_left);
end;
$$;
revoke execute on function public.refund_payment(text, integer) from public, anon, authenticated;
grant execute on function public.refund_payment(text, integer) to service_role;

-- What a player has spent (net of refunds), today (Dublin) and in all, with the two limits.
create or replace function public.player_spend(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'spent_cents', coalesce((select sum(amount_cents - refunded_cents) from public.payments where player_id = p_player_id), 0),
    'spent_today_cents', coalesce((select sum(amount_cents - refunded_cents) from public.payments
                                    where player_id = p_player_id
                                      and (created_at at time zone 'Europe/Dublin')::date = (now() at time zone 'Europe/Dublin')::date), 0),
    'daily_cap_cents', coalesce((select value::integer from public.settings where key = 'daily_cap_cents'), 2000),
    'campaign_cap_cents', coalesce((select value::integer from public.settings where key = 'campaign_cap_cents'), 10000));
$$;
revoke execute on function public.player_spend(uuid) from public, anon, authenticated;
grant execute on function public.player_spend(uuid) to service_role;

-- stats(): as 0028, with the total raised net of refunds.
create or replace function public.stats()
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'total_raised_cents', coalesce((select sum(amount_cents - refunded_cents) from public.payments), 0),
    'goal_cents', coalesce((select value::integer from public.settings where key = 'goal_cents'), 0),
    'prize_text', coalesce((select value from public.settings where key = 'prize_text'), ''),
    'ends_on', coalesce((select value from public.settings where key = 'ends_on'), ''),
    'prize_mode', case when (select value from public.settings where key = 'prize_mode') = 'honours' then 'honours' else 'prizes' end,
    'prizes', jsonb_build_object(
      'students',   coalesce((select value from public.settings where key = 'prize_students'), ''),
      'teachers',   coalesce((select value from public.settings where key = 'prize_teachers'), ''),
      'everyone',   coalesce((select value from public.settings where key = 'prize_everyone'), ''),
      'best_light', coalesce((select value from public.settings where key = 'prize_best_light'), ''),
      'first_play', coalesce((select value from public.settings where key = 'prize_first_play'), '')
    ),
    'content', public.site_content(),
    'payments', (select count(*) from public.payments),
    'plays', (select count(*) from public.plays where score is not null and not voided),
    'players', (select count(*) from public.players),
    'week_start', public.dublin_week_start(now()),
    'week_end', (public.dublin_week_start(now()) + 6),
    'server_time', now()
  );
$$;
grant execute on function public.stats() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. One less public read
-- ---------------------------------------------------------------------------
revoke execute on function public.site_content() from public, anon, authenticated;
