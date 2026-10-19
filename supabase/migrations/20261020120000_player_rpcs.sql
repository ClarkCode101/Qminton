-- Step 5: players (add, bulk add, remove, pause/resume, move to bottom).
--
-- Same rules as the old backend (OrcaRally backend/main.py), with these fixes:
--   * Every change locks the queue row first, so two phones editing the same
--     queue at once wait for each other instead of overwriting (old bug #1).
--   * Removing a player keeps the row (removed_at) so an unpaid balance stays
--     in Billing (old bug #2).
--   * Names are limited to 40 characters; duplicates are checked case-insensitively,
--     including duplicates inside one bulk paste.

-- ---------------------------------------------------------------------------
-- Private helpers (not reachable through the API)
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Locks the queue row for the rest of the transaction and checks ownership.
-- p_expected_version (optional) refuses the change if the queue was modified
-- since the caller last loaded it; matchmaking (step 7) will use this.
create function private.lock_owned_queue(p_queue_id uuid, p_expected_version bigint default null)
returns public.queues
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.queues;
begin
  if auth.uid() is null then
    raise exception 'Please log in again.' using errcode = 'P0001';
  end if;

  select * into v_queue
  from public.queues
  where id = p_queue_id and owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Queue not found' using errcode = 'P0001';
  end if;

  if p_expected_version is not null and v_queue.version <> p_expected_version then
    raise exception 'This queue was changed on another device. Please try again.' using errcode = 'P0001';
  end if;

  return v_queue;
end;
$$;

-- Marks the queue as changed: bumps version and updated_at (old _save_queue "touch").
create function private.touch_queue(p_queue_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.queues
  set version = version + 1, updated_at = now()
  where id = p_queue_id;
$$;

-- Renumbers active players 0..n-1 in their current order (old _reindex_players).
create function private.reindex_players(p_queue_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.players p
  set queue_position = ordered.new_position
  from (
    select id, (row_number() over (order by queue_position, id) - 1)::integer as new_position
    from public.players
    where queue_id = p_queue_id and removed_at is null
  ) ordered
  where p.id = ordered.id and p.queue_position <> ordered.new_position;
$$;

-- Loads an active player of this queue, or raises "Player not found".
create function private.get_active_player(p_queue_id uuid, p_player_id bigint)
returns public.players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.players;
begin
  select * into v_player
  from public.players
  where queue_id = p_queue_id and id = p_player_id and removed_at is null;

  if not found then
    raise exception 'Player not found' using errcode = 'P0001';
  end if;

  return v_player;
end;
$$;

-- Old _require_queue_editable: players on court or locked into a queued match
-- can't be removed, paused or moved.
create function private.require_player_editable(p_player public.players, p_action text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_player.is_playing then
    raise exception 'Cannot % a player who is currently playing', p_action using errcode = 'P0001';
  end if;
  if p_player.is_waiting_match then
    raise exception 'Cannot % a player who is already queued for the next match', p_action using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- add_players: one player (single add) or many (bulk paste)
-- ---------------------------------------------------------------------------
-- p_players = [{"name": "Juan", "skill": "beginner"}, ...]
-- p_skip_duplicates:
--   false (single add)  -> empty name / duplicate name is an error, like the old API.
--   true  (bulk paste)  -> empty and duplicate names are skipped, like the old API.
-- Each new player is billed the queue's court fee ("Initial court fee").
-- Returns the players that were added, in order.
create function public.add_players(p_queue_id uuid, p_players jsonb, p_skip_duplicates boolean default false)
returns setof public.players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.queues;
  v_item jsonb;
  v_name text;
  v_skill public.skill_level;
  v_next_position integer;
  v_player public.players;
  v_added integer := 0;
begin
  v_queue := private.lock_owned_queue(p_queue_id);

  if jsonb_typeof(p_players) is distinct from 'array' then
    raise exception 'Player list is invalid' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_players) > 100 then
    raise exception 'Add at most 100 players at a time' using errcode = 'P0001';
  end if;

  select coalesce(max(queue_position) + 1, 0) into v_next_position
  from public.players
  where queue_id = p_queue_id and removed_at is null;

  for v_item in select value from jsonb_array_elements(p_players) loop
    v_name := btrim(coalesce(v_item ->> 'name', ''));

    if v_name = '' then
      if p_skip_duplicates then continue; end if;
      raise exception 'Name is required' using errcode = 'P0001';
    end if;
    if char_length(v_name) > 40 then
      raise exception 'Player name must be 40 characters or less: %', left(v_name, 40) using errcode = 'P0001';
    end if;

    begin
      v_skill := (v_item ->> 'skill')::public.skill_level;
    exception when invalid_text_representation then
      raise exception 'Invalid skill level for %', v_name using errcode = 'P0001';
    end;
    if v_skill is null then
      raise exception 'Skill level is required for %', v_name using errcode = 'P0001';
    end if;

    -- Duplicate check (case-insensitive) against active players, including
    -- the ones added earlier in this same list.
    if exists (
      select 1 from public.players
      where queue_id = p_queue_id and removed_at is null and lower(name) = lower(v_name)
    ) then
      if p_skip_duplicates then continue; end if;
      raise exception 'Player already exists' using errcode = 'P0001';
    end if;

    insert into public.players (queue_id, name, skill, queue_position)
    values (p_queue_id, v_name, v_skill, v_next_position)
    returning * into v_player;
    v_next_position := v_next_position + 1;
    v_added := v_added + 1;

    -- Old _record_ledger_entry skipped zero amounts.
    if v_queue.court_fee > 0 then
      insert into public.ledger_entries (queue_id, player_id, player_name, amount, entry_type, note)
      values (p_queue_id, v_player.id, v_player.name, v_queue.court_fee, 'court_fee', 'Initial court fee');
    end if;

    return next v_player;
  end loop;

  if v_added > 0 then
    perform private.touch_queue(p_queue_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- remove_player: soft delete so billing history and debts stay visible
-- ---------------------------------------------------------------------------
create function public.remove_player(p_queue_id uuid, p_player_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.players;
begin
  perform private.lock_owned_queue(p_queue_id);
  v_player := private.get_active_player(p_queue_id, p_player_id);
  perform private.require_player_editable(v_player, 'remove');

  update public.players
  set removed_at = now(), is_paused = false
  where id = p_player_id;

  perform private.reindex_players(p_queue_id);
  perform private.touch_queue(p_queue_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- set_player_paused: "Take Break" (true) / "Mark Ready" (false)
-- ---------------------------------------------------------------------------
-- Like the old app, pausing is blocked for players on court / in a queued match,
-- but resuming is always allowed.
create function public.set_player_paused(p_queue_id uuid, p_player_id bigint, p_paused boolean)
returns public.players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.players;
begin
  perform private.lock_owned_queue(p_queue_id);
  v_player := private.get_active_player(p_queue_id, p_player_id);
  if p_paused then
    perform private.require_player_editable(v_player, 'pause');
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
-- move_player_to_bottom: "Move Later"
-- ---------------------------------------------------------------------------
create function public.move_player_to_bottom(p_queue_id uuid, p_player_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.players;
begin
  perform private.lock_owned_queue(p_queue_id);
  v_player := private.get_active_player(p_queue_id, p_player_id);
  perform private.require_player_editable(v_player, 'move');

  update public.players
  set queue_position = (
    select coalesce(max(queue_position), 0) + 1
    from public.players
    where queue_id = p_queue_id and removed_at is null
  )
  where id = p_player_id;

  perform private.reindex_players(p_queue_id);
  perform private.touch_queue(p_queue_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions: logged-in users only; private helpers for nobody but the owner
-- ---------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.add_players(uuid, jsonb, boolean) from public, anon;
revoke all on function public.remove_player(uuid, bigint) from public, anon;
revoke all on function public.set_player_paused(uuid, bigint, boolean) from public, anon;
revoke all on function public.move_player_to_bottom(uuid, bigint) from public, anon;
grant execute on function public.add_players(uuid, jsonb, boolean) to authenticated;
grant execute on function public.remove_player(uuid, bigint) to authenticated;
grant execute on function public.set_player_paused(uuid, bigint, boolean) to authenticated;
grant execute on function public.move_player_to_bottom(uuid, bigint) to authenticated;
