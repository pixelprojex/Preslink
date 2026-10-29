-- The first game's scoring, exactly: the score is the cube of how close the light stopped to the line,
-- measured over the whole bar (0008's curve), with 0016's two additions: 999 is the ceiling, and a cusp
-- over the first 3 ms of error keeps 999 to one person.
--      u = max(0, 1 - d / 0.5)            d = |pos - target|, a fraction of the bar
--      score = max(50, round(999 * u^3 - 12 * sqrt(min(err_ms, 3) / 3)))
-- At a one-second sweep: 10 ms off = 928, 20 ms = 872, 30 ms = 818, 50 ms = 716, 100 ms = 499, 150 ms = 331,
-- 200 ms = 204, 250 ms = 113, 300 ms = 52, further = 50. The build that is live on the site right now
-- scores lights with this same cube, so what players see during a play is what the board keeps.
create or replace function public.round_score(p_tap_ms integer, p_phase double precision, p_target double precision, p_speed_ms integer)
returns integer
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_x   double precision;
  v_pos double precision;
  v_d   double precision;
  v_u   double precision;
begin
  v_x := p_tap_ms::double precision / p_speed_ms::double precision + p_phase;
  v_x := v_x - 2 * floor(v_x / 2);
  v_pos := case when v_x < 1 then v_x else 2 - v_x end;
  v_d := abs(v_pos - p_target);
  v_u := greatest(0.0, 1 - v_d / 0.5);
  return least(999, greatest(50, round(999 * v_u ^ 3 - 12 * sqrt(least(v_d * p_speed_ms, 3.0) / 3.0))))::integer;
end;
$$;
revoke execute on function public.round_score(integer, double precision, double precision, integer) from public, anon, authenticated;
