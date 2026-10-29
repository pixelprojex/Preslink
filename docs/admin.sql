-- PresLink Arcade: extra SQL for the committee.
-- Day-to-day admin (winners with claim codes, voiding, banning, blocking names, goal and prize)
-- is in the app's Committee screen (/#admin). These queries are for anything beyond that.
-- Run them in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

-- 0. Set or change the committee code (the first call needs no old code).
--    Everything below can also be done from the Committee screen in the app (/#admin):
--    boards for any week with claim codes, find a player, void/restore, ban, rename, block names, CSV.
select public.admin_set_code(null, 'YourCommitteeCode');            -- first time
select public.admin_set_code('OldCode', 'NewCommitteeCode');        -- later
-- If the committee is locked out after too many wrong tries, clear the lock:
delete from public.auth_attempts where scope = 'admin';

-- 1. This week's leaderboard WITH claim codes (students). Change 'student' to 'teacher' for the other board.
select l.rank, l.initials, p.claim_code, l.score, l.plays, l.achieved_at at time zone 'Europe/Dublin' as achieved_dublin
  from public.leaderboard('student') l
  join public.players p on public.player_tag(p.id) = l.tag
 order by l.rank;

-- 2. Last week's winners with claim codes (run on Monday morning).
with last_week as (select public.dublin_week_start(now()) - 7 as ws)
select l.role, l.rank, l.initials, p.claim_code, l.score, l.achieved_at at time zone 'Europe/Dublin' as achieved_dublin
  from last_week w, public.leaderboard(null, w.ws) l
  join public.players p on public.player_tag(p.id) = l.tag
 where l.rank <= 3
 order by l.role, l.rank;

-- 3. Every past weekly winner (what players see under "Past winners").
select * from public.past_winners();

-- 4. Money: total raised, number of coins inserted, plays, players.
select public.stats();

-- 5. Money by day (Dublin time).
select (created_at at time zone 'Europe/Dublin')::date as day,
       count(*) as payments,
       sum(amount_cents) / 100.0 as euros
  from public.payments
 group by 1 order by 1 desc;

-- 6. Look up a player by initials and claim code (e.g. to verify a winner, or to help someone).
select id, initials, role, claim_code, credits, created_at, last_seen_at
  from public.players
 where initials = 'JAK' and claim_code = '0421';

-- 7. All plays by one player (use the id from query 6).
select started_at, finished_at, score, tap_ms, week_start, voided, void_reason
  from public.plays
 where player_id = '00000000-0000-0000-0000-000000000000'
 order by started_at desc;

-- 8. Void a suspicious play (it disappears from the leaderboard). Use the play id from query 7.
update public.plays
   set voided = true, void_reason = 'committee: reason here'
 where id = '00000000-0000-0000-0000-000000000000';

-- 9. Give a player credits by hand (e.g. a paid play lost to a technical fault). Use a unique session id.
select public.grant_credits('manual-' || gen_random_uuid()::text, null,
                            '00000000-0000-0000-0000-000000000000', -- player id
                            'manual', 1, 0, 'eur', null, 'manual');
-- Note: amount_cents must be > 0 in the payments table. For a goodwill play with no money, use "Give a free play"
-- on the player in the committee console: it adds the play and keeps the reason (at most three per player).

-- 10. Find the payment for a Stripe Checkout session id (from the Stripe dashboard).
select * from public.payments where stripe_session_id = 'cs_live_...';

-- 11. Players who have paid but never played (check they are not stuck).
select p.initials, p.claim_code, p.credits, p.last_seen_at
  from public.players p
 where p.credits > 0
 order by p.last_seen_at;

-- Before taking real money: remove the demo payments (free plays recorded while no Stripe key was set),
-- so "raised so far" starts from zero. Run in the Supabase SQL editor.
-- delete from public.payments where stripe_session_id like 'demo_%';

-- Launch day, after all testing: start the campaign from a clean slate. This removes every test player with
-- their plays (scores, taps, device details), payments and free plays, and the sign-in lockouts, so no test score
-- can lead a board or a spot prize; settings, blocked names and the Stripe connection stay. It cannot be undone:
-- run it once, in the Supabase SQL editor, before the link goes out.
-- delete from public.plays;
-- delete from public.payments;
-- delete from public.free_plays;
-- delete from public.players;
-- delete from public.auth_attempts;
