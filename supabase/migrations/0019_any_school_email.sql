-- School emails: whatever comes before the @ is accepted, so long as the address ends in the
-- school's domain. The general email check only asks for something@something.tld.
create or replace function public.set_contact(p_id uuid, p_email text, p_school_email text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_school text := lower(trim(coalesce(p_school_email, '')));
  v_role   public.player_role;
begin
  if not exists (select 1 from public.players where id = p_id) then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email) > 120 then
    raise exception 'BAD_EMAIL';
  end if;
  if v_school = '' and v_email ~ '@(pbccork\.ie|pbc-cork\.ie)$' then
    v_school := v_email;
  end if;
  if v_school <> '' then
    if v_school ~ '^[^[:space:]@]+@pbccork\.ie$' then
      v_role := 'student';
    elsif v_school ~ '^[^[:space:]@]+@pbc-cork\.ie$' then
      v_role := 'teacher';
    else
      raise exception 'BAD_SCHOOL_EMAIL';
    end if;
    update public.players set contact_email = v_email, role = v_role, school_email = v_school, last_seen_at = now() where id = p_id;
  else
    update public.players set contact_email = v_email, last_seen_at = now() where id = p_id;
  end if;
  return public.me_player(p_id);
end;
$$;

create or replace function public.set_school(p_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_role  public.player_role;
begin
  if not exists (select 1 from public.players where id = p_id) then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  if v_email ~ '^[^[:space:]@]+@pbccork\.ie$' then
    v_role := 'student';
  elsif v_email ~ '^[^[:space:]@]+@pbc-cork\.ie$' then
    v_role := 'teacher';
  else
    raise exception 'BAD_SCHOOL_EMAIL';
  end if;
  update public.players set role = v_role, school_email = v_email, last_seen_at = now() where id = p_id;
  return public.me_player(p_id);
end;
$$;
