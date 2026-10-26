-- 0025: safeguards.
-- 1. The same three lights for everyone on a given (Dublin) day, with every mark and starting point on the
--    same 1 ms grid as taps: no play is luckier than another, and a perfect tap is possible on every light.
-- 2. Spending limits: a daily and a campaign cap per player (settings daily_cap_cents and
--    campaign_cap_cents), checked before every checkout, and the running total on the player's record.
-- 3. A spot prize money cannot buy: the best score on anyone's first play replaces "most plays".

insert into public.settings (key, value) values
  ('daily_cap_cents', '2000'), ('campaign_cap_cents', '10000'), ('prize_first_play', '')
on conflict (key) do nothing;

-- The day's lights: three marks (15% to 85% along the bar) and starting points, from a hash of the date,
-- in thousandths so that with a one-second sweep each mark is reached on a whole millisecond.
create or replace function public.day_rounds(p_day date)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_agg(jsonb_build_object(
           'phase',  round((('x' || substr(md5('preslink-phase-' || p_day::text || '-' || i::text), 1, 7))::bit(28)::integer % 1000) / 1000.0, 3),
           'target', round((150 + ('x' || substr(md5('preslink-mark-' || p_day::text || '-' || i::text), 1, 7))::bit(28)::integer % 701) / 1000.0, 3))
         order by i)
    from generate_series(1, 3) as i;
$$;
revoke execute on function public.day_rounds(date) from public, anon, authenticated;
grant execute on function public.day_rounds(date) to service_role;

-- start_play: as 0014, with the day's lights instead of random ones.
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

-- What a player has spent, today (Dublin) and in all, with the two limits.
create or replace function public.player_spend(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'spent_cents', coalesce((select sum(amount_cents) from public.payments where player_id = p_player_id), 0),
    'spent_today_cents', coalesce((select sum(amount_cents) from public.payments
                                    where player_id = p_player_id
                                      and (created_at at time zone 'Europe/Dublin')::date = (now() at time zone 'Europe/Dublin')::date), 0),
    'daily_cap_cents', coalesce((select value::integer from public.settings where key = 'daily_cap_cents'), 2000),
    'campaign_cap_cents', coalesce((select value::integer from public.settings where key = 'campaign_cap_cents'), 10000));
$$;
revoke execute on function public.player_spend(uuid) from public, anon, authenticated;
grant execute on function public.player_spend(uuid) to service_role;

-- Before a checkout: refuse a payment that would pass the day's or the campaign's limit.
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

-- me_player: as 0024, plus what the player has spent and the limits.
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
    'contact_email', v_row.contact_email,
    'claim_code', v_row.claim_code,
    'credits', v_row.credits,
    'banned', v_row.banned,
    'colour', v_row.colour,
    'best', v_best,
    'best_light', v_light,
    'best_this_week', v_best,
    'open_play', case when v_open.id is null then null else jsonb_build_object(
        'play_id', v_open.id, 'speed_ms', v_open.speed_ms, 'rounds', v_open.rounds) end
  ) || public.player_spend(v_row.id);
end;
$$;

-- spot_prizes: best light as before; first_play (the best score on anyone's first scored play) replaces
-- most_plays, which rewarded spending.
create or replace function public.spot_prizes()
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  with scored as (
    select pl.player_id, pl.started_at, pl.finished_at, pl.score,
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
  firsts as (
    select distinct on (s.player_id) s.player_id, s.score, s.finished_at
      from scored s
     order by s.player_id, s.started_at asc
  ),
  fp as (
    select f.player_id, f.score, f.finished_at
      from firsts f
     order by f.score desc, f.finished_at asc
     limit 1
  )
  select jsonb_build_object(
    'best_light', (select jsonb_build_object('tag', public.player_tag(p.id), 'initials', public.display_name(p.initials, p.suffix),
                                             'role', p.role::text, 'score', b.light, 'achieved_at', b.finished_at, 'colour', p.colour)
                     from bl b join public.players p on p.id = b.player_id),
    'first_play', (select jsonb_build_object('tag', public.player_tag(p.id), 'initials', public.display_name(p.initials, p.suffix),
                                             'role', p.role::text, 'score', f.score, 'achieved_at', f.finished_at, 'colour', p.colour)
                     from fp f join public.players p on p.id = f.player_id)
  );
$$;

-- stats: as 0023, with the first_play prize text in place of most_plays.
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

-- admin_set_settings: as 0007, with first_play among the prize keys instead of most_plays.
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
                  where k in ('students', 'teachers', 'everyone', 'best_light', 'first_play') loop
      insert into public.settings (key, value) values ('prize_' || v_key, left(coalesce(p_prizes->>v_key, ''), 200))
      on conflict (key) do update set value = excluded.value;
    end loop;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
