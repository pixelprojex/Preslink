-- 0024: a colour for every initials tile. players.colour is 0 ("pick one from the letters": the site
-- hashes the initials into one of eight) or 1 to 8, a colour the player chose on the You tab. The boards,
-- the spot prizes and the player's own record carry it so everyone sees the same tile.
alter table public.players add column if not exists colour smallint not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'players_colour_range') then
    alter table public.players add constraint players_colour_range check (colour between 0 and 8);
  end if;
end $$;

-- me_player: as 0014, plus the colour.
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
  );
end;
$$;

-- The player picks a colour (0 goes back to the one from the letters).
create or replace function public.set_colour(p_id uuid, p_colour integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_colour is null or p_colour < 0 or p_colour > 8 then
    raise exception 'BAD_COLOUR';
  end if;
  update public.players set colour = p_colour where id = p_id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  return public.me_player(p_id);
end;
$$;
revoke execute on function public.set_colour(uuid, integer) from public, anon, authenticated;
grant execute on function public.set_colour(uuid, integer) to service_role;

-- board: the leaderboard rows as JSON, with the colour. A new name beside leaderboard() (whose row type
-- cannot grow without dropping it), so an older page keeps working while the new one reads this.
create or replace function public.board(p_role text default null)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'rank', b.rank, 'tag', public.player_tag(p.id), 'initials', public.display_name(p.initials, p.suffix), 'role', p.role::text,
           'score', b.score, 'achieved_at', b.achieved_at, 'plays', b.plays, 'best_light', b.best_light, 'colour', p.colour)
         order by b.rank), '[]'::jsonb)
    from (select * from public.campaign_board(p_role, null::date) order by rank limit 100) b
    join public.players p on p.id = b.player_id;
$$;
grant execute on function public.board(text) to anon, authenticated, service_role;

-- spot_prizes: as 0007, plus the colour.
create or replace function public.spot_prizes()
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  with scored as (
    select pl.player_id, pl.started_at, pl.finished_at,
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
  mp as (
    select s.player_id, count(*) as plays, min(s.started_at) as since
      from scored s
     group by s.player_id
     order by count(*) desc, min(s.started_at) asc
     limit 1
  )
  select jsonb_build_object(
    'best_light', (select jsonb_build_object('tag', public.player_tag(p.id), 'initials', public.display_name(p.initials, p.suffix),
                                             'role', p.role::text, 'score', b.light, 'achieved_at', b.finished_at, 'colour', p.colour)
                     from bl b join public.players p on p.id = b.player_id),
    'most_plays', (select jsonb_build_object('tag', public.player_tag(p.id), 'initials', public.display_name(p.initials, p.suffix),
                                             'role', p.role::text, 'plays', m.plays, 'since', m.since, 'colour', p.colour)
                     from mp m join public.players p on p.id = m.player_id)
  );
$$;
