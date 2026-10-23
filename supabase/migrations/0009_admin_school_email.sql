-- The committee's player lookup now shows the school email (so a Students/Teachers claim can be
-- checked) and the best single light of each play. Same signature as 0005, so create or replace
-- keeps the grants (service_role only).
create or replace function public.admin_player(p_code text, p_initials text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_err text := public.admin_verify(p_code);
  v_raw text := upper(trim(coalesce(p_initials, '')));
  v_initials text := split_part(v_raw, '#', 1);
  v_suffix integer := nullif(split_part(v_raw, '#', 2), '')::integer;
  v_row public.players;
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  select * into v_row from public.players where initials = v_initials and (v_suffix is null or suffix = v_suffix) order by suffix limit 1;
  if not found then return jsonb_build_object('error', 'PLAYER_NOT_FOUND'); end if;
  return jsonb_build_object(
    'player', jsonb_build_object('id', v_row.id, 'initials', public.display_name(v_row.initials, v_row.suffix), 'role', v_row.role,
                                 'school_email', v_row.school_email, 'claim_code', v_row.claim_code,
                                 'credits', v_row.credits, 'banned', v_row.banned, 'created_at', v_row.created_at, 'last_seen_at', v_row.last_seen_at),
    'others', (select coalesce(jsonb_agg(public.display_name(initials, suffix) order by suffix), '[]'::jsonb) from public.players where initials = v_initials and id <> v_row.id),
    'plays', (select coalesce(jsonb_agg(jsonb_build_object('play_id', id, 'started_at', started_at, 'finished_at', finished_at, 'score', score,
                                                           'best_light', public.play_best_light(taps, rounds, speed_ms, score),
                                                           'week_start', week_start, 'voided', voided, 'void_reason', void_reason) order by started_at desc), '[]'::jsonb)
                from public.plays where player_id = v_row.id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('created_at', created_at, 'bundle', bundle, 'credits', credits, 'amount_cents', amount_cents,
                                                              'email', email, 'stripe_session_id', stripe_session_id) order by created_at desc), '[]'::jsonb)
                   from public.payments where player_id = v_row.id)
  );
end;
$$;
