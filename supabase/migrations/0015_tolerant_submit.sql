-- The client's score is advisory. The server recomputes every light from the three tap times and
-- stores its own result, so a build of the site that still carries an older curve keeps working
-- the day the curve changes (0014 broke the live site that way for a while: every play came back
-- SCORE_MISMATCH and was not saved). The earliest accepted tap is now 60 ms into a sweep instead
-- of 150, so a quick first tap is never swallowed. Same signature as 0007: the grants stay.
create or replace function public.submit_play(
  p_player_id uuid,
  p_play_id uuid,
  p_score integer,
  p_taps jsonb,
  p_client jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_play       public.plays;
  v_elapsed_ms double precision;
  v_tap        integer;
  v_sum        integer := 0;
  v_scores     integer[] := '{}';
  v_expected   integer;
  v_week       date;
  v_best       integer;
  v_rank       integer;
  v_rank_all   integer;
  v_credits    integer;
  v_role       public.player_role;
  i            integer;
begin
  select * into v_play from public.plays where id = p_play_id and player_id = p_player_id for update;
  if not found then raise exception 'PLAY_NOT_FOUND'; end if;
  if v_play.voided then raise exception 'PLAY_VOID'; end if;
  if v_play.score is not null then raise exception 'ALREADY_SCORED'; end if;
  if v_play.rounds is null then raise exception 'PLAY_VOID'; end if;
  if p_score is null or p_score < 0 or p_score > 1000 then raise exception 'BAD_SCORE'; end if;
  if p_taps is null or jsonb_typeof(p_taps) <> 'array' or jsonb_array_length(p_taps) <> 3 then raise exception 'BAD_TAP'; end if;

  for i in 0..2 loop
    if jsonb_typeof(p_taps->i) <> 'number' then raise exception 'BAD_TAP'; end if;
    v_tap := (p_taps->>i)::integer;
    if v_tap < 60 or v_tap > 120000 then raise exception 'BAD_TAP'; end if;
    v_sum := v_sum + v_tap;
    v_scores := v_scores || public.round_score(v_tap, (v_play.rounds->i->>'phase')::double precision,
                                               (v_play.rounds->i->>'target')::double precision, v_play.speed_ms);
  end loop;

  -- The three sweeps ran one after another: they cannot add up to more time than has really passed.
  v_elapsed_ms := extract(epoch from (now() - v_play.started_at)) * 1000;
  if v_sum > v_elapsed_ms + 3000 then raise exception 'BAD_TAP'; end if;

  -- The server's own number is the score. The browser shows this one, whatever it worked out itself.
  v_expected := round((v_scores[1] + v_scores[2] + v_scores[3])::numeric / 3)::integer;

  v_week := public.dublin_week_start(now());
  update public.plays
     set score = v_expected, taps = p_taps, tap_ms = (p_taps->>0)::integer, finished_at = now(), week_start = v_week, client = p_client
   where id = p_play_id;

  select credits, role into v_credits, v_role from public.players where id = p_player_id;
  select max(score) into v_best from public.plays
   where player_id = p_player_id and score is not null and not voided;
  select b.rank into v_rank from public.campaign_board(v_role::text) b where b.player_id = p_player_id;
  select b.rank into v_rank_all from public.campaign_board('everyone') b where b.player_id = p_player_id;

  return jsonb_build_object(
    'score', v_expected,
    'rounds', to_jsonb(v_scores),
    'best', v_best,
    'best_this_week', v_best,
    'best_light', greatest(v_scores[1], v_scores[2], v_scores[3]),
    'rank', v_rank,
    'rank_all', v_rank_all,
    'credits', v_credits,
    'week_start', v_week
  );
end;
$$;
