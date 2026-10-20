-- Step 8: Finish Game (with the rest rule and auto-start of Up Next) and
-- Reset Matchmaking. Ports of finish_game / reset_matchmaking in the old
-- OrcaRally backend/main.py.

-- ---------------------------------------------------------------------------
-- finish_game
-- ---------------------------------------------------------------------------
-- p_match_id: the match the organizer saw on that court. If the court already
-- holds a different match (double tap, or another phone finished it and the
-- next queued match started), we refuse instead of finishing the wrong game.
--
-- Rest rule (old code, unchanged): the freed players must sit out as many
-- games as can be filled by everyone else who is free or already in Up Next
-- (not counting players on other courts), at least 1 when another court is
-- still playing or matches are waiting. Each later match start (and queue)
-- lowers their counter by 1.
--
-- Returns {message, rest_games_needed, queued_remaining}.
create function public.finish_game(p_queue_id uuid, p_court_no integer, p_match_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.queues;
  v_match public.matches;
  v_game_ids bigint[];
  v_players_per_game integer;
  v_non_freed_available integer;
  v_rest integer;
  v_started_next boolean;
begin
  v_queue := private.lock_owned_queue(p_queue_id);

  if p_court_no is null or p_court_no < 1 or p_court_no > v_queue.court_count then
    raise exception 'Court not found' using errcode = 'P0001';
  end if;

  select * into v_match
  from public.matches
  where queue_id = p_queue_id and status = 'started' and court_no = p_court_no;

  if not found then
    raise exception 'Court is not occupied' using errcode = 'P0001';
  end if;
  if p_match_id is not null and v_match.id <> p_match_id then
    raise exception 'This court already changed. Please check the courts again.' using errcode = 'P0001';
  end if;

  select array_agg(player_id) into v_game_ids from public.match_players where match_id = v_match.id;
  v_players_per_game := case when v_queue.game_mode = 'singles' then 2 else 4 end;

  -- Everyone not in this game and not on another court (includes Up Next and,
  -- like the old code, players on break).
  select count(*) into v_non_freed_available
  from public.players
  where queue_id = p_queue_id
    and removed_at is null
    and not (id = any(v_game_ids))
    and not is_playing;

  v_rest := v_non_freed_available / v_players_per_game;

  if v_rest < 1 and (
    exists (
      select 1 from public.matches
      where queue_id = p_queue_id and status = 'started' and court_no <> p_court_no
    )
    or exists (select 1 from public.matches where queue_id = p_queue_id and status = 'queued')
  ) then
    v_rest := 1;
  end if;

  update public.matches
  set status = 'completed', completed_at = now()
  where id = v_match.id;

  update public.players
  set is_playing = false, rest_games_needed = v_rest
  where id = any(v_game_ids);

  v_started_next := private.start_next_pending(p_queue_id, p_court_no);
  perform private.touch_queue(p_queue_id);

  if v_started_next then
    return jsonb_build_object(
      'message', 'Court finished; next queued match started',
      'rest_games_needed', v_rest,
      'queued_remaining', (select count(*) from public.matches where queue_id = p_queue_id and status = 'queued')
    );
  end if;

  return jsonb_build_object(
    'message', 'Court is now available',
    'rest_games_needed', v_rest,
    'queued_remaining', 0
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- reset_matchmaking
-- ---------------------------------------------------------------------------
-- Clears Up Next, the anti-repeat memory and every court; all players go back
-- to the queue with no rest. Match history is kept (matches are marked
-- cancelled with a reason). The match counter is NOT reset (same as before).
-- p_include_players_on_break = true also returns players on break to Ready.
create function public.reset_matchmaking(p_queue_id uuid, p_include_players_on_break boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_owned_queue(p_queue_id);

  update public.matches
  set status = 'cancelled', queue_order = null,
      cancel_reason = 'Matchmaking reset before queued match started'
  where queue_id = p_queue_id and status = 'queued';

  delete from public.pair_memory where queue_id = p_queue_id;

  update public.players
  set is_playing = false,
      is_waiting_match = false,
      is_paused = case when p_include_players_on_break then false else is_paused end,
      rest_games_needed = 0
  where queue_id = p_queue_id and removed_at is null;

  update public.matches
  set status = 'cancelled',
      cancel_reason = 'Matchmaking reset while court was active',
      completed_at = now()
  where queue_id = p_queue_id and status = 'started';

  perform private.reindex_players(p_queue_id);
  perform private.touch_queue(p_queue_id);

  return jsonb_build_object(
    'message',
    'Matchmaking reset; courts cleared, queue returned, and history preserved'
      || case when p_include_players_on_break then '; players on break were returned to ready' else '' end
  );
end;
$$;

revoke all on function public.finish_game(uuid, integer, uuid) from public, anon;
revoke all on function public.reset_matchmaking(uuid, boolean) from public, anon;
grant execute on function public.finish_game(uuid, integer, uuid) to authenticated;
grant execute on function public.reset_matchmaking(uuid, boolean) to authenticated;
