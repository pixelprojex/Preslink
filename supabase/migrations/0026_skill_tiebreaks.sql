-- 0026: spot prizes decided by skill, not by who was first to a lucky millisecond.
-- Best light: equal best lights are split by each player's second-best light, then their third-best; only
-- if those are equal too does the earlier one win. First play: equal first-play scores are split by that
-- play's best light, then its second and third. The boards keep "the earlier one wins" for equal scores.

create or replace function public.spot_prizes()
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
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
    select pp.player_id, pp.top[1] as light, pp.at1
      from per_player pp
     order by pp.top[1] desc, coalesce(pp.top[2], -1) desc, coalesce(pp.top[3], -1) desc, pp.at1 asc
     limit 1
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
    select f.player_id, f.score, f.finished_at
      from firsts f
      left join first_lights fl on fl.player_id = f.player_id
     order by f.score desc, coalesce(fl.top[1], -1) desc, coalesce(fl.top[2], -1) desc, coalesce(fl.top[3], -1) desc, f.finished_at asc
     limit 1
  )
  select jsonb_build_object(
    'best_light', (select jsonb_build_object('tag', public.player_tag(p.id), 'initials', public.display_name(p.initials, p.suffix),
                                             'role', p.role::text, 'score', b.light, 'achieved_at', b.at1, 'colour', p.colour)
                     from bl b join public.players p on p.id = b.player_id),
    'first_play', (select jsonb_build_object('tag', public.player_tag(p.id), 'initials', public.display_name(p.initials, p.suffix),
                                             'role', p.role::text, 'score', f.score, 'achieved_at', f.finished_at, 'colour', p.colour)
                     from fp f join public.players p on p.id = f.player_id)
  );
$$;
