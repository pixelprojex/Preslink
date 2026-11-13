-- 0032: two safety controls for the committee (the school's page). Neither edits the site.
--
-- 1. Pause payments. While settings.payments_paused is 'true' the API opens no new checkout (it answers PAUSED).
--    Games already bought can still be played, and a payment already in progress still completes.
-- 2. Move a player off the Students or Teachers board, for a wrong or made-up school email: the player goes back
--    to the Everyone board and the school email is cleared. Their scores and games are untouched.

create or replace function public.payments_paused()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select value from public.settings where key = 'payments_paused') = 'true', false);
$$;

create or replace function public.admin_set_paused(p_code text, p_paused boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_err text := public.admin_verify(p_code);
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  insert into public.settings (key, value)
  values ('payments_paused', case when coalesce(p_paused, true) then 'true' else 'false' end)
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('ok', true, 'paused', coalesce(p_paused, true));
end;
$$;

create or replace function public.admin_unboard(p_code text, p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_err text := public.admin_verify(p_code);
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  update public.players set role = 'everyone', school_email = null where id = p_player_id;
  if not found then return jsonb_build_object('error', 'PLAYER_NOT_FOUND'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.payments_paused() from public, anon, authenticated;
revoke execute on function public.admin_set_paused(text, boolean) from public, anon, authenticated;
revoke execute on function public.admin_unboard(text, uuid) from public, anon, authenticated;
grant execute on function public.payments_paused() to service_role;
grant execute on function public.admin_set_paused(text, boolean) to service_role;
grant execute on function public.admin_unboard(text, uuid) to service_role;
