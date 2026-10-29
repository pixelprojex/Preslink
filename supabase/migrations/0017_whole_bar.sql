-- The whole bar scores. The distance from the light to the line, as a fraction of the bar, is what
-- counts, the way the game worked before the millisecond curves: on the line 999, and the score
-- falls all the way to the floor only half a bar away. Two parts: a sharp one for the top (sixth
-- power of the closeness, so 900+ needs the light within about 11 ms of the line and the best score
-- is one person's) and a long one for the rest of the bar (closeness to the power 1.5), plus the
-- cusp from 0016 over the first 3 ms so 999 itself needs a tap within microseconds of the line.
--      u = max(0, 1 - d / 0.5)            d = |pos - target|, a fraction of the bar
--      score = 50 + 949 * (0.63 * u^6 + 0.37 * u^1.5) - 12 * sqrt(min(err_ms, 3) / 3),  50..999
-- At a one-second sweep: 10 ms off = 908, 20 ms = 836, 30 ms = 770, 50 ms = 656, 100 ms = 446 (a tenth of the
-- bar), 200 ms = 229 (a fifth), 300 ms = 129, 400 ms = 69, half the bar or more = 50. The app and the demo
-- backend mirror this exactly.
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
  return least(999, greatest(50, round(50 + 949 * (0.63 * v_u ^ 6 + 0.37 * v_u ^ 1.5) - 12 * sqrt(least(v_d * p_speed_ms, 3.0) / 3.0))))::integer;
end;
$$;
revoke execute on function public.round_score(integer, double precision, double precision, integer) from public, anon, authenticated;
