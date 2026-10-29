-- The committee console. The committee edits the site's words and photos (home title and line, a
-- notice, the About stories, the contact details) as one JSON document in settings, which the public
-- stats() carries so the site renders it without another request. Payments and players get a search
-- with paging. Photos go in a public storage bucket, uploaded by the API with the service role.

insert into public.settings (key, value) values ('site_content', '{}') on conflict do nothing;

create or replace function public.site_content()
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce((select value::jsonb from public.settings where key = 'site_content' and coalesce(value, '') <> ''), '{}'::jsonb);
$$;
grant execute on function public.site_content() to anon, authenticated;

-- stats() as in 0007, plus the content document.
create or replace function public.stats()
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'total_raised_cents', coalesce((select sum(amount_cents) from public.payments), 0),
    'goal_cents', coalesce((select value::integer from public.settings where key = 'goal_cents'), 0),
    'prize_text', coalesce((select value from public.settings where key = 'prize_text'), ''),
    'ends_on', coalesce((select value from public.settings where key = 'ends_on'), ''),
    'prizes', jsonb_build_object(
      'students',   coalesce((select value from public.settings where key = 'prize_students'), ''),
      'teachers',   coalesce((select value from public.settings where key = 'prize_teachers'), ''),
      'everyone',   coalesce((select value from public.settings where key = 'prize_everyone'), ''),
      'best_light', coalesce((select value from public.settings where key = 'prize_best_light'), ''),
      'most_plays', coalesce((select value from public.settings where key = 'prize_most_plays'), '')
    ),
    'content', public.site_content(),
    'payments', (select count(*) from public.payments),
    'plays', (select count(*) from public.plays where score is not null and not voided),
    'players', (select count(*) from public.players),
    'week_start', public.dublin_week_start(now()),
    'week_end', (public.dublin_week_start(now()) + 6),
    'server_time', now()
  );
$$;

create or replace function public.admin_set_content(p_code text, p_content jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_err text := public.admin_verify(p_code);
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' then return jsonb_build_object('error', 'BAD_CONTENT'); end if;
  if length(p_content::text) > 400000 then return jsonb_build_object('error', 'CONTENT_TOO_BIG'); end if;
  insert into public.settings (key, value) values ('site_content', p_content::text)
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.admin_set_content(text, jsonb) from public, anon, authenticated;

-- Every payment, newest first, with a search over the name, the emails, the Stripe ids, the bundle
-- and the amount in euro, an optional date range (Dublin days), and paging. Each page carries the
-- count and the sum of everything that matched.
create or replace function public.admin_payments(p_code text, p_q text default null, p_from date default null, p_to date default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_err   text := public.admin_verify(p_code);
  v_q     text := nullif(lower(trim(coalesce(p_q, ''))), '');
  v_rows  jsonb;
  v_total bigint;
  v_sum   bigint;
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  select coalesce(jsonb_agg((to_jsonb(x) - 'total' - 'sum_cents') order by x.created_at desc), '[]'::jsonb), coalesce(max(x.total), 0), coalesce(max(x.sum_cents), 0)
    into v_rows, v_total, v_sum
    from (
      select f.*, count(*) over () as total, sum(f.amount_cents) over () as sum_cents
        from (
          select pm.id, pm.created_at, public.display_name(p.initials, p.suffix) as initials, p.id as player_id, p.role::text as role,
                 pm.bundle, pm.credits, pm.amount_cents, pm.email, pm.source, pm.stripe_session_id, pm.stripe_payment_intent, p.contact_email
            from public.payments pm
            join public.players p on p.id = pm.player_id
           where (p_from is null or (pm.created_at at time zone 'Europe/Dublin')::date >= p_from)
             and (p_to is null or (pm.created_at at time zone 'Europe/Dublin')::date <= p_to)
             and (v_q is null
                  or lower(public.display_name(p.initials, p.suffix)) like v_q || '%'
                  or lower(coalesce(pm.email, '')) like '%' || v_q || '%'
                  or lower(coalesce(p.contact_email, '')) like '%' || v_q || '%'
                  or lower(pm.stripe_session_id) like '%' || v_q || '%'
                  or lower(coalesce(pm.stripe_payment_intent, '')) like '%' || v_q || '%'
                  or lower(pm.bundle) = v_q
                  or (v_q ~ '^[0-9]+$' and pm.amount_cents = v_q::integer * 100))
        ) f
       order by f.created_at desc
       limit greatest(1, least(coalesce(p_limit, 50), 500)) offset greatest(0, coalesce(p_offset, 0))
    ) x;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'sum_cents', v_sum);
end;
$$;
revoke execute on function public.admin_payments(text, text, date, date, integer, integer) from public, anon, authenticated;

-- Every player, most recently seen first, with a search over the name, the emails and the code, a
-- board filter, a banned filter, and paging; each row carries plays, best score and money paid.
create or replace function public.admin_players(p_code text, p_q text default null, p_role text default null, p_banned boolean default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_err   text := public.admin_verify(p_code);
  v_q     text := nullif(lower(trim(coalesce(p_q, ''))), '');
  v_rows  jsonb;
  v_total bigint;
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  if p_role is not null and p_role not in ('student', 'teacher', 'everyone') then return jsonb_build_object('error', 'BAD_ROLE'); end if;
  select coalesce(jsonb_agg((to_jsonb(x) - 'total') order by x.last_seen_at desc), '[]'::jsonb), coalesce(max(x.total), 0)
    into v_rows, v_total
    from (
      select b.*, count(*) over () as total
        from (
          select p.id, public.display_name(p.initials, p.suffix) as initials, p.role::text as role, p.claim_code, p.contact_email, p.school_email,
                 p.credits, p.banned, p.created_at, p.last_seen_at,
                 (select count(*) from public.plays pl where pl.player_id = p.id and pl.score is not null and not pl.voided) as plays,
                 (select max(pl.score) from public.plays pl where pl.player_id = p.id and pl.score is not null and not pl.voided) as best,
                 (select coalesce(sum(pm.amount_cents), 0) from public.payments pm where pm.player_id = p.id) as paid_cents
            from public.players p
           where (p_role is null or p.role::text = p_role)
             and (p_banned is null or p.banned = p_banned)
             and (v_q is null
                  or lower(public.display_name(p.initials, p.suffix)) like v_q || '%'
                  or lower(coalesce(p.contact_email, '')) like '%' || v_q || '%'
                  or lower(coalesce(p.school_email, '')) like '%' || v_q || '%'
                  or p.claim_code = v_q)
        ) b
       order by b.last_seen_at desc
       limit greatest(1, least(coalesce(p_limit, 50), 500)) offset greatest(0, coalesce(p_offset, 0))
    ) x;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;
revoke execute on function public.admin_players(text, text, text, boolean, integer, integer) from public, anon, authenticated;

-- A public bucket for the committee's photos. The API uploads with the service role; anyone can view.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    execute $q$insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
               values ('site', 'site', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
               on conflict (id) do update set public = true$q$;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'site photos are public') then
      execute $q$create policy "site photos are public" on storage.objects for select to public using (bucket_id = 'site')$q$;
    end if;
  end if;
end $$;
