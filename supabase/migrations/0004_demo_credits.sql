-- Free plays while no Stripe key is configured (demo). Adds credits without recording a payment,
-- so "raised so far" only ever counts real money.
create or replace function public.grant_demo_credits(p_player_id uuid, p_credits integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_credits integer;
begin
  if p_credits is null or p_credits < 1 or p_credits > 7 then
    raise exception 'BAD_CREDITS';
  end if;
  update public.players set credits = credits + p_credits, last_seen_at = now()
   where id = p_player_id returning credits into v_credits;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  return jsonb_build_object('credits', v_credits);
end;
$$;
revoke execute on function public.grant_demo_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.grant_demo_credits(uuid, integer) to service_role;
