-- Scores follow the skill, so the field spreads out into a bell instead of bunching above 900.
--   score = 50 + 950 * exp(-|pos - target| / 0.0158)
-- On a 950 ms pass that is about 15 ms per e-fold: 2 ms off ≈ 880, 5 ms ≈ 730, 10 ms ≈ 540,
-- 20 ms ≈ 300, 50 ms ≈ 85; anywhere far from the mark stays at 50. A play average above 900
-- needs three taps within about a millisecond and a half. Same wave as before; only the curve
-- changed, and the app and demo backend mirror it.
create or replace function public.round_score(p_tap_ms integer, p_phase double precision, p_target double precision, p_speed_ms integer)
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
  return (50 + round(950 * exp(-abs(v_pos - p_target) / 0.0158)))::integer;
end;
$$;
revoke execute on function public.round_score(integer, double precision, double precision, integer) from public, anon, authenticated;
