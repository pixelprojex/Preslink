-- 0027: badges, announced on the Prizes page, for the record and never a prize (the research's advice:
-- symbolic awards for accomplishments, announced in advance, never for playing often).
--   bullseye  a light of 999: stopped on the exact millisecond of the mark
--   steady    all three lights of one play within 40 ms of the mark
-- Worked out from the plays like the best light, and carried by me_player as a list.

-- How far from the mark a light stopped, in whole milliseconds (round_score's position, without the curve).
create or replace function public.round_error_ms(p_tap_ms integer, p_phase double precision, p_target double precision, p_speed_ms integer)
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
  return round(abs(v_pos - p_target) * p_speed_ms)::integer;
end;
$$;
revoke execute on function public.round_error_ms(integer, double precision, double precision, integer) from public, anon, authenticated;

create or replace function public.player_badges(p_player_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ok as (
    select pl.id, pl.taps, pl.rounds, pl.speed_ms
      from public.plays pl
     where pl.player_id = p_player_id and pl.score is not null and not pl.voided
       and pl.taps is not null and jsonb_typeof(pl.taps) = 'array' and jsonb_array_length(pl.taps) = 3
       and pl.rounds is not null and jsonb_typeof(pl.rounds) = 'array' and jsonb_array_length(pl.rounds) = 3
  ),
  per_play as (
    select o.id,
           max(public.round_score((o.taps->>i)::integer, (o.rounds->i->>'phase')::double precision,
                                  (o.rounds->i->>'target')::double precision, o.speed_ms)) as top,
           max(public.round_error_ms((o.taps->>i)::integer, (o.rounds->i->>'phase')::double precision,
                                     (o.rounds->i->>'target')::double precision, o.speed_ms)) as worst
      from ok o
      cross join generate_series(0, 2) as i
     group by o.id
  )
  select to_jsonb(array_remove(array[
    case when exists (select 1 from per_play where top >= 999) then 'bullseye' end,
    case when exists (select 1 from per_play where worst <= 40) then 'steady' end
  ], null));
$$;
revoke execute on function public.player_badges(uuid) from public, anon, authenticated;
grant execute on function public.player_badges(uuid) to service_role;

-- me_player: as 0025, plus the player's badges.
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
    'badges', public.player_badges(v_row.id),
    'open_play', case when v_open.id is null then null else jsonb_build_object(
        'play_id', v_open.id, 'speed_ms', v_open.speed_ms, 'rounds', v_open.rounds) end
  ) || public.player_spend(v_row.id);
end;
$$;
