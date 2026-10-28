-- 0028: a switch between prizes and honours. Irish gaming law counts a paid game of skill with prizes of money's
-- worth as gaming, and Stripe needs written approval for skill games with prizes; until a solicitor (and Stripe)
-- have signed off, the owner can run the same boards as honours instead (no prize of money or money's worth):
--   update public.settings set value = 'honours' where key = 'prize_mode';   -- or 'prizes'
-- stats() carries the mode; the site changes its words to match.
insert into public.settings (key, value) values ('prize_mode', 'prizes') on conflict do nothing;

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
