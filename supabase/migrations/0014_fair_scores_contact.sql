-- 1. Fair scores. The curve is a bell over the timing error in milliseconds, not a spike:
--      score = 50 + 950 * exp(-(error_ms / 40)^2),   error_ms = |pos - target| * speed_ms
--    10 ms off = 942, 15 ms = 875, 20 ms = 790, 30 ms = 591, 40 ms = 399, 50 ms = 249, 60 ms = 150,
--    80 ms = 67, further = 50. Near the mark the curve is flat (a 5 ms miss still scores 985), so a
--    good tap is not a coin flip; a wild tap is still 50, never 0. 900+ needs three taps inside about
--    13 ms, which is rare; most people land between 300 and 800. The sweep is a fixed one second per
--    pass so every play is the same test. The app and the demo backend mirror this exactly.
create or replace function public.round_score(p_tap_ms integer, p_phase double precision, p_target double precision, p_speed_ms integer)
returns integer
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_x   double precision;
  v_pos double precision;
  v_err double precision;
begin
  v_x := p_tap_ms::double precision / p_speed_ms::double precision + p_phase;
  v_x := v_x - 2 * floor(v_x / 2);
  v_pos := case when v_x < 1 then v_x else 2 - v_x end;
  v_err := abs(v_pos - p_target) * p_speed_ms;
  return (50 + round(950 * exp(-((v_err / 40.0) ^ 2))))::integer;
end;
$$;
revoke execute on function public.round_score(integer, double precision, double precision, integer) from public, anon, authenticated;

create or replace function public.start_play(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_play    public.plays;
  v_credits integer;
  v_banned  boolean;
  v_rounds  jsonb;
begin
  select banned into v_banned from public.players where id = p_player_id for update;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  if v_banned then
    raise exception 'BANNED';
  end if;
  select * into v_play from public.plays
   where player_id = p_player_id and score is null and not voided and rounds is not null
   order by started_at desc limit 1;
  if found then
    select credits into v_credits from public.players where id = p_player_id;
    return jsonb_build_object('play_id', v_play.id, 'speed_ms', v_play.speed_ms, 'rounds', v_play.rounds,
                              'credits', v_credits, 'resumed', true);
  end if;
  update public.plays set voided = true, void_reason = 'superseded'
   where player_id = p_player_id and score is null and not voided and rounds is null;

  update public.players set credits = credits - 1, last_seen_at = now()
   where id = p_player_id and credits > 0
   returning credits into v_credits;
  if not found then
    raise exception 'NO_CREDITS';
  end if;

  -- One second per pass, every play. Three lights, each with its own mark and starting point.
  v_rounds := jsonb_build_array(
    jsonb_build_object('phase', random(), 'target', 0.15 + random() * 0.7),
    jsonb_build_object('phase', random(), 'target', 0.15 + random() * 0.7),
    jsonb_build_object('phase', random(), 'target', 0.15 + random() * 0.7));

  insert into public.plays (player_id, phase, speed_ms, rounds)
  values (p_player_id, (v_rounds->0->>'phase')::double precision, 1000, v_rounds)
  returning * into v_play;
  return jsonb_build_object('play_id', v_play.id, 'speed_ms', v_play.speed_ms, 'rounds', v_play.rounds,
                            'credits', v_credits, 'resumed', false);
end;
$$;

-- 2. Reaching the winners. Every player can leave an email after their first play; the committee
--    emails the winners when the arcade closes. A school email on either field puts the player on
--    the Students or Teachers board (format check only, nothing is sent).
alter table public.players add column if not exists contact_email text;

create or replace function public.me_player(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row   public.players;
  v_best  integer;
  v_light integer;
  v_open  public.plays;
begin
  update public.players set last_seen_at = now() where id = p_id returning * into v_row;
  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;
  select max(score), max(public.play_best_light(taps, rounds, speed_ms, score)) into v_best, v_light
    from public.plays
   where player_id = p_id and score is not null and not voided;
  select * into v_open from public.plays
   where player_id = p_id and score is null and not voided and rounds is not null
   order by started_at desc limit 1;
  return jsonb_build_object(
    'id', v_row.id,
    'tag', public.player_tag(v_row.id),
    'initials', v_row.initials,
    'suffix', v_row.suffix,
    'display', public.display_name(v_row.initials, v_row.suffix),
    'role', v_row.role,
    'school_email', v_row.school_email,
    'contact_email', v_row.contact_email,
    'claim_code', v_row.claim_code,
    'credits', v_row.credits,
    'banned', v_row.banned,
    'best', v_best,
    'best_light', v_light,
    'best_this_week', v_best,
    'open_play', case when v_open.id is null then null else jsonb_build_object(
        'play_id', v_open.id, 'speed_ms', v_open.speed_ms, 'rounds', v_open.rounds) end
  );
end;
$$;

-- p_email: where to send the news (any address). p_school_email: optional; a student or teacher
-- address joins that board. If p_email itself is a school address, it counts as the school email.
-- An empty school email leaves the board as it is.
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
  if v_email !~ '^[a-z0-9._%+''-]+@[a-z0-9.-]+\.[a-z]{2,}$' or length(v_email) > 120 then
    raise exception 'BAD_EMAIL';
  end if;
  if v_school = '' and v_email ~ '@(pbccork\.ie|pbc-cork\.ie)$' then
    v_school := v_email;
  end if;
  if v_school <> '' then
    if v_school ~ '^[a-z0-9._%+''-]+@pbccork\.ie$' then
      v_role := 'student';
    elsif v_school ~ '^[a-z0-9._%+''-]+@pbc-cork\.ie$' then
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
revoke execute on function public.set_contact(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_contact(uuid, text, text) to service_role;

-- The committee's player lookup shows both emails.
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
                                 'school_email', v_row.school_email, 'contact_email', v_row.contact_email, 'claim_code', v_row.claim_code,
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

-- Every player's emails for the committee: who to write to when the arcade closes.
create or replace function public.admin_emails(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_err text := public.admin_verify(p_code);
begin
  if v_err is not null then return jsonb_build_object('error', v_err); end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'player_id', p.id, 'initials', public.display_name(p.initials, p.suffix), 'role', p.role,
            'contact_email', p.contact_email, 'school_email', p.school_email, 'claim_code', p.claim_code, 'banned', p.banned,
            'best', (select max(score) from public.plays x where x.player_id = p.id and x.score is not null and not x.voided)
          ) order by p.created_at), '[]'::jsonb)
          from public.players p);
end;
$$;
revoke execute on function public.admin_emails(text) from public, anon, authenticated;
grant execute on function public.admin_emails(text) to service_role;
