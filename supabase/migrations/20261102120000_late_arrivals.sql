-- Late arrivals at Start session (owner's request, 2026-10-21).
--
-- In "Who came?", the people marked "Not here" no longer stay out: they join
-- the queue ON BREAK (people often just arrive late). Owner's choices:
--   * They are billed the court fee only when they arrive: the first time the
--     organizer marks them Ready. If they never come and are removed, nothing
--     was billed.
--   * No separate "won't come" state: someone who never shows is removed.
-- players.court_fee_pending marks "joined on break from Start, fee not billed
-- yet". Every way a player gets out of the break bills it first:
-- set_player_paused(false) and reset_matchmaking(include players on break).
-- Their sign-up is marked "arrived" (linked to the player) like the others.

alter table public.players add column court_fee_pending boolean not null default false;

-- Bills the waiting court fee of one player (if any) and clears the flag.
create function private.bill_pending_court_fee(p_player public.players, p_court_fee integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not p_player.court_fee_pending then
    return;
  end if;
  if p_court_fee > 0 then
    insert into public.ledger_entries (queue_id, player_id, player_name, amount, entry_type, note)
    values (p_player.queue_id, p_player.id, p_player.name, p_court_fee, 'court_fee', 'Initial court fee');
  end if;
  update public.players set court_fee_pending = false where id = p_player.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- start_session: those who came as before; the rest join on break, not billed
-- ---------------------------------------------------------------------------
create or replace function public.start_session(p_queue_id uuid, p_arrived bigint[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.queues;
  v_signup public.signups;
  v_player_id bigint;
  v_position integer;
  v_added integer := 0;
  v_late integer := 0;
  v_here boolean;
begin
  v_queue := private.lock_owned_queue(p_queue_id);
  if v_queue.status <> 'planned' then
    raise exception 'This session already started' using errcode = 'P0001';
  end if;

  select coalesce(max(queue_position) + 1, 0) into v_position
  from public.players
  where queue_id = p_queue_id and removed_at is null;

  -- Those who came first (in sign-up order), then the late ones at the end of
  -- the line (they play once they arrive and are marked Ready).
  for v_signup in
    select * from public.signups
    where queue_id = p_queue_id and status = 'going'
    order by (id = any(coalesce(p_arrived, '{}'))) desc, created_at, id
  loop
    v_here := v_signup.id = any(coalesce(p_arrived, '{}'));
    v_player_id := null;
    insert into public.players (queue_id, name, skill, queue_position, is_paused, court_fee_pending)
    values (p_queue_id, v_signup.name, v_signup.skill, v_position, not v_here, not v_here and v_queue.court_fee > 0)
    on conflict (queue_id, lower(name)) where removed_at is null do nothing
    returning id into v_player_id;

    if v_player_id is null then
      -- Already a player with that name: link to them, don't bill twice.
      select id into v_player_id from public.players
      where queue_id = p_queue_id and removed_at is null and lower(name) = lower(v_signup.name);
    else
      v_position := v_position + 1;
      if v_here then
        v_added := v_added + 1;
        if v_queue.court_fee > 0 then
          insert into public.ledger_entries (queue_id, player_id, player_name, amount, entry_type, note)
          values (p_queue_id, v_player_id, v_signup.name, v_queue.court_fee, 'court_fee', 'Initial court fee');
        end if;
      else
        v_late := v_late + 1;
      end if;
    end if;

    update public.signups
    set status = 'arrived', player_id = v_player_id, updated_at = now()
    where id = v_signup.id;
  end loop;

  update public.queues set status = 'live' where id = p_queue_id;
  update public.check_ins set is_open = false, updated_at = now() where queue_id = p_queue_id;

  perform private.touch_queue(p_queue_id);
  return jsonb_build_object('added', v_added, 'late', v_late);
end;
$$;

-- ---------------------------------------------------------------------------
-- set_player_paused: same as before; marking a late arrival Ready bills them
-- ---------------------------------------------------------------------------
create or replace function public.set_player_paused(p_queue_id uuid, p_player_id bigint, p_paused boolean)
returns public.players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.queues;
  v_player public.players;
begin
  v_queue := private.lock_owned_queue(p_queue_id);
  v_player := private.get_active_player(p_queue_id, p_player_id);
  if p_paused then
    perform private.require_player_editable(v_player, 'pause');
  else
    perform private.bill_pending_court_fee(v_player, v_queue.court_fee);
  end if;

  update public.players
  set is_paused = p_paused
  where id = p_player_id
  returning * into v_player;

  perform private.touch_queue(p_queue_id);
  return v_player;
end;
$$;

-- ---------------------------------------------------------------------------
-- reset_matchmaking: same as before; returning players on break to Ready bills
-- any late arrival's waiting court fee first
-- ---------------------------------------------------------------------------
create or replace function public.reset_matchmaking(p_queue_id uuid, p_include_players_on_break boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.queues;
  v_player public.players;
begin
  v_queue := private.lock_owned_queue(p_queue_id);

  update public.matches
  set status = 'cancelled', queue_order = null,
      cancel_reason = 'Matchmaking reset before queued match started'
  where queue_id = p_queue_id and status = 'queued';

  delete from public.pair_memory where queue_id = p_queue_id;

  if p_include_players_on_break then
    for v_player in
      select * from public.players
      where queue_id = p_queue_id and removed_at is null and is_paused and court_fee_pending
    loop
      perform private.bill_pending_court_fee(v_player, v_queue.court_fee);
    end loop;
  end if;

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

-- ---------------------------------------------------------------------------
-- Permissions (the public functions keep theirs: create or replace)
-- ---------------------------------------------------------------------------
revoke all on function private.bill_pending_court_fee(public.players, integer) from public, anon, authenticated;
