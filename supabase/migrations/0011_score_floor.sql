-- A light never scores zero: the curve now runs from 50 (anywhere far from the mark) to 1,000
-- (exactly on it). Same steep exponent as 0008, so above 900 stays hard.
--   score = 50 + 950 * (1 - |pos - target| / 0.5) ^ 3
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
  return (50 + round(950 * power(greatest(0, 1 - abs(v_pos - p_target) / 0.5), 3.0)))::integer;
end;
$$;
revoke execute on function public.round_score(integer, double precision, double precision, integer) from public, anon, authenticated;
