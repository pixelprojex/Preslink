-- A steep peak at the line on top of a gentle ramp across the whole bar. The ramp (300 on the line
-- down to about 45 at the far end) means a tap anywhere earns a readable number; the peak (649 on the
-- line, halving every 35 ms) means the high numbers are hard to reach, so an ordinary play lands in the
-- hundreds and the top of the board is earned. 0016's cusp over the first 3 ms keeps 999 to one person.
--      d = |pos - target|, a fraction of the bar
--      score = max(50, round(50 + 300 * (1 - d) + 649 * exp(-d / 0.05) - 12 * sqrt(min(err_ms, 3) / 3)))
-- At a one-second sweep: 10 ms off = 866, 20 ms = 767, 30 ms = 685, 50 ms = 562, 100 ms = 396, 150 ms = 325,
-- 200 ms = 290, 300 ms = 250, half the bar = 188, 700 ms = 128, the far end 83.
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
begin
  v_x := p_tap_ms::double precision / p_speed_ms::double precision + p_phase;
  v_x := v_x - 2 * floor(v_x / 2);
  v_pos := case when v_x < 1 then v_x else 2 - v_x end;
  v_d := abs(v_pos - p_target);
  return least(999, greatest(50, round(50 + 300 * (1 - v_d) + 649 * exp(-v_d / 0.05) - 12 * sqrt(least(v_d * p_speed_ms, 3.0) / 3.0))))::integer;
end;
$$;
revoke execute on function public.round_score(integer, double precision, double precision, integer) from public, anon, authenticated;
