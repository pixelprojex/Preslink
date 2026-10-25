-- The committee connects Stripe from the Committee page instead of the Supabase dashboard. The
-- Edge Function checks the secret key with Stripe, creates the webhook endpoint, and keeps the key
-- and the webhook signing secret here. Only the service role can read or write this table: row
-- level security is on with no policies, and nothing is granted to anon or authenticated. The
-- Edge Functions read these when the STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET secrets are not set.
create table if not exists public.app_secrets (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on table public.app_secrets from public, anon, authenticated;

create or replace function public.app_secret_get(p_key text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select value from public.app_secrets where key = p_key;
$$;
revoke execute on function public.app_secret_get(text) from public, anon, authenticated;
grant execute on function public.app_secret_get(text) to service_role;

-- An empty value clears the key (the row stays, empty), so no row is ever removed.
create or replace function public.app_secret_set(p_key text, p_value text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.app_secrets (key, value, updated_at) values (p_key, coalesce(p_value, ''), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;
revoke execute on function public.app_secret_set(text, text) from public, anon, authenticated;
grant execute on function public.app_secret_set(text, text) to service_role;
