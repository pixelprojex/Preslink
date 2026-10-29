-- Scores spread evenly over the whole bar, so a tap far from the line still earns a readable number
-- instead of the floor. The score falls with the square of the distance from the line, from 999 on
-- the line to about 60 at the far end of the bar, and 0016's cusp over the first 3 ms of error keeps
-- 999 to one person.
--      u = max(0, 1 - d)                 d = |pos - target|, a fraction of the bar
--      score = max(50, round(50 + 949 * u^2 - 12 * sqrt(min(err_ms, 3) / 3)))
-- At a one-second sweep: 10 ms off = 968, 20 ms = 949, 30 ms = 931, 50 ms = 894, 100 ms = 807, 150 ms = 724,
-- 200 ms = 645, 300 ms = 503, 400 ms = 380, half the bar = 275, 600 ms = 190, 700 ms = 123, the far end 59.
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
  v_u := greatest(0.0, 1 - v_d);
  return least(999, greatest(50, round(50 + 949 * v_u ^ 2 - 12 * sqrt(least(v_d * p_speed_ms, 3.0) / 3.0))))::integer;
end;
$$;
revoke execute on function public.round_score(integer, double precision, double precision, integer) from public, anon, authenticated;
