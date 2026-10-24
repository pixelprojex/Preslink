-- Demo plays now count on the "raised so far" counter, so the site behaves like the real thing
-- before Stripe is switched on. Each demo bundle records a payment row with source 'manual' and a
-- session id starting with 'demo_'. Before taking real money, clear them with the snippet in
-- docs/admin.sql (payments where stripe_session_id like 'demo_%').
create or replace function public.grant_demo_credits(p_player_id uuid, p_credits integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_credits integer;
  v_bundle  text;
  v_amount  integer;
begin
  if p_credits is null or p_credits < 1 or p_credits > 7 then
    raise exception 'BAD_CREDITS';
  end if;
  update public.players set credits = credits + p_credits, last_seen_at = now()
   where id = p_player_id returning credits into v_credits;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  v_bundle := case p_credits when 1 then 'single' when 3 then 'triple' when 7 then 'seven' else 'single' end;
  v_amount := case p_credits when 1 then 200 when 3 then 500 when 7 then 1000 else p_credits * 200 end;
  insert into public.payments (stripe_session_id, stripe_payment_intent, player_id, bundle, credits, amount_cents, currency, email, source)
  values ('demo_' || replace(gen_random_uuid()::text, '-', ''), null, p_player_id, v_bundle, p_credits, v_amount, 'eur', null, 'manual');
  return jsonb_build_object('credits', v_credits);
end;
$$;
revoke execute on function public.grant_demo_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.grant_demo_credits(uuid, integer) to service_role;
