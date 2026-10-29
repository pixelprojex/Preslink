-- 0029: the public reads carry scores, never how many plays anyone has made.
-- Paid plays are a measure of spending, so board() (the site's only board read) no longer includes each player's
-- play count; the committee console still sees it. leaderboard() and past_winners() are left over from earlier
-- versions and nothing calls them any more, so the public can no longer run them.

create or replace function public.board(p_role text default null)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'rank', b.rank, 'tag', public.player_tag(p.id), 'initials', public.display_name(p.initials, p.suffix), 'role', p.role::text,
           'score', b.score, 'achieved_at', b.achieved_at, 'best_light', b.best_light, 'colour', p.colour)
         order by b.rank), '[]'::jsonb)
    from (select * from public.campaign_board(p_role, null::date) order by rank limit 100) b
    join public.players p on p.id = b.player_id;
$$;
grant execute on function public.board(text) to anon, authenticated, service_role;

revoke execute on function public.leaderboard(text, date) from public, anon, authenticated;
revoke execute on function public.past_winners() from public, anon, authenticated;
