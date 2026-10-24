-- Harder scoring: the exponent of the per-light curve goes from 1.6 to 3.0.
--
--   score = 1000 * (1 - |pos - target| / 0.5) ^ 3      (pos = triangle-wave position at the tap)
--
-- Why: with 1.6 a 20 ms late tap at ~950 ms per pass still scored about 934 and 30 ms about 900,
-- so the boards bunched up between 900 and 1,000 and a 1,000 came up far too often for the prizes
-- on offer. With 3.0 the same taps score about 880 and 822, 50 ms about 716 and 80 ms about 575,
-- so scores spread out below 900. A light only rounds to 1,000 when the tap is within a tenth of
-- a millisecond of the target; taps are whole milliseconds, so most rounds have no millisecond
-- that scores 1,000 at all and the rest have exactly one. A perfect 1,000 play (the mean of three
-- lights) is practically out of reach.
--
-- Same signature and body as 0006 apart from the exponent; create or replace keeps the existing
-- grants, and the revoke below restates them. The clients (site/app.js, site/mock.js) mirror this
-- curve and use the same exponent.
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
  return round(1000 * power(greatest(0, 1 - abs(v_pos - p_target) / 0.5), 3.0))::integer;
end;
$$;

revoke execute on function public.round_score(integer, double precision, double precision, integer) from public, anon, authenticated;
