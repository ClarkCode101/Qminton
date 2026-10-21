-- Players can leave a live queue from the phone they checked in with
-- (owner's request, 2026-10-21).
--
-- Like "Cancel my spot" on a planned session: check_in now returns a secret code
-- the phone keeps (only its sha256 is stored), and leave_queue(code) removes that
-- player. Owner's choices:
--   * The court fee is given back (a negative adjustment) only if they have not
--     played a game yet; after a game everything they owe stays.
--   * Leaving still works after check-in is closed (closing stops new people only).
-- Same rule as the organizer's Remove: not while on a court or in Up Next.
-- get_signup's "mine" now also works for a live queue: which of this phone's codes
-- are still active players (so a player the organizer removed disappears there).

alter table public.players add column leave_code_hash text;
create index players_leave_code_hash_idx on public.players (leave_code_hash) where leave_code_hash is not null;

-- ---------------------------------------------------------------------------
-- check_in: same as before, plus the leave code
-- ---------------------------------------------------------------------------
create or replace function public.check_in(p_token uuid, p_name text, p_skill public.skill_level)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_check_in public.check_ins;
  v_queue public.queues;
  v_name text := btrim(coalesce(p_name, ''));
  v_position integer;
  v_player public.players;
  v_code uuid := gen_random_uuid();
begin
  select * into v_check_in from public.check_ins where token = p_token;
  if not found then
    raise exception 'This check-in code is no longer valid. Please scan the new QR code.' using errcode = 'P0001';
  end if;

  -- Same lock as every other change to this queue (old bug #1).
  select * into v_queue from public.queues where id = v_check_in.queue_id for update;

  -- Planned session: people sign up instead (they become players at Start).
  if v_queue.status = 'planned' then
    raise exception 'This session has not started yet. Please refresh the page to sign up.' using errcode = 'P0001';
  end if;

  -- Re-read under the lock: the organizer may have just closed it.
  select * into v_check_in from public.check_ins where queue_id = v_queue.id;
  if not v_check_in.is_open or v_check_in.token is distinct from p_token then
    raise exception 'Check-in is closed. Please ask the organizer.' using errcode = 'P0001';
  end if;

  if v_name = '' then
    raise exception 'Please enter your name' using errcode = 'P0001';
  end if;
  if char_length(v_name) > 40 then
    raise exception 'Name must be 40 characters or less' using errcode = 'P0001';
  end if;
  if p_skill is null then
    raise exception 'Please pick your skill level' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.players
    where queue_id = v_queue.id and removed_at is null and lower(name) = lower(v_name)
  ) then
    raise exception 'That name is already in the queue. Add your last name or a nickname.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.players where queue_id = v_queue.id and removed_at is null) >= 150 then
    raise exception 'This queue is full. Please ask the organizer.' using errcode = 'P0001';
  end if;

  select coalesce(max(queue_position) + 1, 0) into v_position
  from public.players
  where queue_id = v_queue.id and removed_at is null;

  insert into public.players (queue_id, name, skill, queue_position, leave_code_hash)
  values (v_queue.id, v_name, p_skill, v_position, private.code_hash(v_code))
  returning * into v_player;

  -- Billed like a player the organizer adds (old _record_ledger_entry skipped 0).
  if v_queue.court_fee > 0 then
    insert into public.ledger_entries (queue_id, player_id, player_name, amount, entry_type, note)
    values (v_queue.id, v_player.id, v_player.name, v_queue.court_fee, 'court_fee', 'Initial court fee');
  end if;

  -- Bumps the version, so the organizer's screen updates live.
  perform private.touch_queue(v_queue.id);

  return jsonb_build_object(
    'name', v_player.name,
    'position', v_position + 1,
    'queue_id', v_queue.id,
    'code', v_code
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- leave_queue (public): leave with the code the phone kept
-- ---------------------------------------------------------------------------
-- Returns {name, refunded} (refunded = the court fee given back, 0 if none).
create function public.leave_queue(p_code uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.players;
  v_refund integer := 0;
begin
  select * into v_player
  from public.players
  where leave_code_hash = private.code_hash(p_code) and removed_at is null;
  if not found then
    raise exception 'You are no longer in the queue.' using errcode = 'P0001';
  end if;

  -- Same lock as every other change to this queue, then read the player again.
  perform 1 from public.queues where id = v_player.queue_id for update;
  select * into v_player from public.players where id = v_player.id and removed_at is null;
  if not found then
    raise exception 'You are no longer in the queue.' using errcode = 'P0001';
  end if;

  if v_player.is_playing then
    raise exception 'You are on a court right now. Please tell the organizer.' using errcode = 'P0001';
  end if;
  if v_player.is_waiting_match then
    raise exception 'You are in Up Next. Please tell the organizer.' using errcode = 'P0001';
  end if;

  update public.players
  set removed_at = now(), is_paused = false
  where id = v_player.id;

  -- Owner's rule: give the court fee back only if no game was played.
  if v_player.games_played = 0 then
    select coalesce(sum(amount), 0)::integer into v_refund
    from public.ledger_entries
    where player_id = v_player.id and entry_type = 'court_fee';
    if v_refund > 0 then
      insert into public.ledger_entries (queue_id, player_id, player_name, amount, entry_type, note)
      values (v_player.queue_id, v_player.id, v_player.name, -v_refund, 'adjustment', 'Court fee returned: left before playing');
    else
      v_refund := 0;
    end if;
  end if;

  perform private.reindex_players(v_player.queue_id);
  perform private.touch_queue(v_player.queue_id);
  return jsonb_build_object('name', v_player.name, 'refunded', v_refund);
end;
$$;

-- ---------------------------------------------------------------------------
-- get_signup: "mine" also for a live queue (players checked in from this phone)
-- ---------------------------------------------------------------------------
create or replace function public.get_signup(p_token uuid, p_my_codes uuid[] default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'queue_id', q.id,
    'queue_name', q.name,
    'game_mode', q.game_mode,
    'status', q.status,
    'starts_at', q.starts_at,
    'court_fee', q.court_fee,
    'game_rate', q.game_rate,
    'is_open', c.is_open,
    'going', case when q.status = 'planned' then coalesce((
      select jsonb_agg(s.name order by s.created_at, s.id)
      from public.signups s
      where s.queue_id = q.id and s.status = 'going'
    ), '[]'::jsonb) else '[]'::jsonb end,
    'mine', case when q.status = 'planned' then coalesce((
      select jsonb_agg(jsonb_build_object('code', m.code, 'name', s.name) order by s.created_at, s.id)
      from unnest(coalesce(p_my_codes, '{}')) as m(code)
      join public.signups s
        on s.queue_id = q.id and s.status = 'going' and s.cancel_code_hash = private.code_hash(m.code)
    ), '[]'::jsonb) else coalesce((
      select jsonb_agg(jsonb_build_object('code', m.code, 'name', p.name) order by p.created_at, p.id)
      from unnest(coalesce(p_my_codes, '{}')) as m(code)
      join public.players p
        on p.queue_id = q.id and p.removed_at is null and p.leave_code_hash = private.code_hash(m.code)
    ), '[]'::jsonb) end
  )
  from public.check_ins c
  join public.queues q on q.id = c.queue_id
  where c.token = p_token;
$$;

-- ---------------------------------------------------------------------------
-- Permissions (check_in / get_signup keep theirs: create or replace)
-- ---------------------------------------------------------------------------
revoke all on function public.leave_queue(uuid) from public;
grant execute on function public.leave_queue(uuid) to anon, authenticated;
