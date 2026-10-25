-- 999 is the ceiling and the top is a fine ruler. On top of the bell from 0014 a cusp takes up to
-- 12 points off over the first 3 ms of error (square-root shaped, so the first fractions of a
-- millisecond cost the most):
--      score = max(50, round(50 + 949 * exp(-(err/40)^2) - 12 * sqrt(min(err, 3) / 3)))
-- On the mark = 999, 0.05 ms off = 997, 0.25 ms = 995, 0.5 ms = 994, 1 ms = 991, 2 ms = 987, 3 ms = 982,
-- 5 ms = 972, 10 ms = 930, 20 ms = 777, 30 ms = 579, 40 ms = 387, 60 ms = 138, 80 ms = 55, far = 50.
-- Taps are whole milliseconds and the mark is a random fraction, so the error is a real number: a
-- 999 needs the tap within about five microseconds of the mark, which keeps the top of the board
-- to one person. The app and the demo backend mirror this exactly.
create or replace function public.round_score(p_tap_ms integer, p_phase double precision, p_target double precision, p_speed_ms integer)
returns integer
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_x   double precision;
  v_pos double precision;
  v_err double precision;
begin
  v_x := p_tap_ms::double precision / p_speed_ms::double precision + p_phase;
  v_x := v_x - 2 * floor(v_x / 2);
  v_pos := case when v_x < 1 then v_x else 2 - v_x end;
  v_err := abs(v_pos - p_target) * p_speed_ms;
  return greatest(50, round(50 + 949 * exp(-((v_err / 40.0) ^ 2)) - 12 * sqrt(least(v_err, 3.0) / 3.0)))::integer;
end;
$$;
revoke execute on function public.round_score(integer, double precision, double precision, integer) from public, anon, authenticated;
