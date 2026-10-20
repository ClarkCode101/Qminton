-- Step 7: matchmaking (start / queue a match, cancel a queued match).
--
-- Decision #2 (hybrid): the browser runs the scoring engine (a TypeScript port
-- of create_auto_match) and sends the chosen teams here. This function then:
--   * refuses if the queue changed since the browser loaded it (version check),
--   * re-checks that every chosen player is still free,
--   * applies everything in one transaction, exactly like the old backend:
--     court pick, match number, pair memory, games played, game-rate billing,
--     rest counters, player order, match history.
--
-- Also: private.start_next_pending / private.fill_free_courts (old
-- _start_next_pending_match_on_court / _fill_available_courts_from_pending),
-- now used when courts are added (finishes step 6) and by Finish Game (step 8).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Moves the given players to the end of the queue, in the given order
-- (old: q["players"] = remaining + all_in_game; reindex).
create function private.move_players_to_end(p_queue_id uuid, p_player_ids bigint[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.players p
  set queue_position = ordered.new_position
  from (
    select
      id,
      (row_number() over (
        order by
          case when id = any(p_player_ids) then 1 else 0 end,
          array_position(p_player_ids, id),
          queue_position,
          id
      ) - 1)::integer as new_position
    from public.players
    where queue_id = p_queue_id and removed_at is null
  ) ordered
  where p.id = ordered.id and p.queue_position <> ordered.new_position;
$$;

-- Renumbers Up Next as 1..n, keeping the current order.
create function private.renumber_queued_matches(p_queue_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.matches m
  set queue_order = ordered.new_order
  from (
    select id, row_number() over (order by queue_order, created_at, id)::integer as new_order
    from public.matches
    where queue_id = p_queue_id and status = 'queued'
  ) ordered
  where m.id = ordered.id and m.queue_order <> ordered.new_order;
$$;

-- Everything that happens to players when a match goes onto a court
-- (old _start_match_on_court / _resume_match_on_court). The match row must
-- already be 'started' on its court; this fills in the rest.
--   resume_existing = true (court was removed mid-game): players go back on
--     court; no new match number, no second game-rate charge, no rest changes.
--   otherwise: next match number, pair memory, games played, game-rate billing,
--     and every idle off-court player rests one game less.
-- Returns the match number.
create function private.apply_match_start(p_queue_id uuid, p_match_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.queues;
  v_match public.matches;
  v_ids bigint[];
  v_match_no integer;
begin
  select * into v_queue from public.queues where id = p_queue_id;
  select * into v_match from public.matches where id = p_match_id;
  select array_agg(player_id order by team, slot) into v_ids
  from public.match_players where match_id = p_match_id;

  if v_match.resume_existing then
    update public.players
    set is_waiting_match = false, is_playing = true
    where id = any(v_ids);
    v_match_no := v_match.match_no;
  else
    v_match_no := v_queue.match_no + 1;
    update public.queues set match_no = v_match_no where id = p_queue_id;

    -- Pair memory: every two players in the match ("pair"), plus "partner" for
    -- teammates or "opponent" for players on opposite sides. In singles the
    -- opponent pair also counts how many times they have met.
    insert into public.pair_memory (queue_id, kind, player_a, player_b, last_match_no, opponent_count)
    select
      p_queue_id,
      kinds.kind,
      a.player_id,
      b.player_id,
      v_match_no,
      case when kinds.kind = 'opponent' and v_queue.game_mode = 'singles' then 1 else 0 end
    from public.match_players a
    join public.match_players b on b.match_id = a.match_id and a.player_id < b.player_id
    cross join lateral (
      values
        ('pair'::public.pair_kind),
        ((case when a.team = b.team then 'partner' else 'opponent' end)::public.pair_kind)
    ) as kinds(kind)
    where a.match_id = p_match_id
    on conflict (queue_id, kind, player_a, player_b) do update
      set last_match_no = excluded.last_match_no,
          opponent_count = public.pair_memory.opponent_count + excluded.opponent_count;

    update public.players
    set is_waiting_match = false,
        is_playing = true,
        games_played = games_played + 1,
        last_match_no = v_match_no
    where id = any(v_ids);

    if v_queue.game_rate > 0 then
      insert into public.ledger_entries (queue_id, player_id, player_name, amount, entry_type, note, match_no)
      select p_queue_id, p.id, p.name, v_queue.game_rate, 'game_rate', 'Game rate for match #' || v_match_no, v_match_no
      from unnest(v_ids) with ordinality as u(player_id, ord)
      join public.players p on p.id = u.player_id
      order by u.ord;
    end if;

    -- A real game started: truly idle players rest one game less.
    update public.players
    set rest_games_needed = rest_games_needed - 1
    where queue_id = p_queue_id
      and removed_at is null
      and not (id = any(v_ids))
      and not is_playing
      and not is_waiting_match
      and rest_games_needed > 0;

    update public.matches set match_no = v_match_no where id = p_match_id;
  end if;

  perform private.move_players_to_end(p_queue_id, v_ids);
  return v_match_no;
end;
$$;

-- Starts the first valid match in Up Next on a free court. Invalid queued
-- matches are cancelled and skipped, like the old _resolve_pending_players.
-- Returns false when Up Next is empty.
create function private.start_next_pending(p_queue_id uuid, p_court_no integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches;
begin
  loop
    select * into v_match
    from public.matches
    where queue_id = p_queue_id and status = 'queued'
    order by queue_order, created_at, id
    limit 1;

    if not found then
      return false;
    end if;

    if exists (
      select 1 from public.match_players mp
      join public.players p on p.id = mp.player_id
      where mp.match_id = v_match.id and p.removed_at is not null
    ) then
      update public.players
      set is_waiting_match = false
      where removed_at is null
        and id in (select player_id from public.match_players where match_id = v_match.id);
      update public.matches
      set status = 'cancelled', queue_order = null,
          cancel_reason = 'Queued match became invalid after player removal'
      where id = v_match.id;
      perform private.renumber_queued_matches(p_queue_id);
      continue;
    end if;

    if exists (
      select 1 from public.match_players mp
      join public.players p on p.id = mp.player_id
      where mp.match_id = v_match.id and p.is_playing
    ) then
      update public.matches
      set status = 'cancelled', queue_order = null,
          cancel_reason = 'Queued match became invalid because a player was already active'
      where id = v_match.id;
      perform private.renumber_queued_matches(p_queue_id);
      continue;
    end if;

    update public.matches
    set status = 'started',
        court_no = p_court_no,
        started_at = now(),
        completed_at = null,
        queue_order = null,
        queue_length = (
          select count(*) from public.matches
          where queue_id = p_queue_id and status = 'queued' and id <> v_match.id
        )
    where id = v_match.id;
    perform private.renumber_queued_matches(p_queue_id);
    perform private.apply_match_start(p_queue_id, v_match.id);
    return true;
  end loop;
end;
$$;

-- Starts queued matches on every free court, lowest court number first.
create function private.fill_free_courts(p_queue_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_court_count integer;
  v_court integer;
  v_started integer := 0;
begin
  select court_count into v_court_count from public.queues where id = p_queue_id;

  for v_court in 1..v_court_count loop
    if not exists (
      select 1 from public.matches
      where queue_id = p_queue_id and status = 'started' and court_no = v_court
    ) then
      exit when not private.start_next_pending(p_queue_id, v_court);
      v_started := v_started + 1;
    end if;
  end loop;

  return v_started;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_match: start the chosen teams on a free court, or add them to Up Next
-- ---------------------------------------------------------------------------
-- p_expected_version: the queue version the browser used to pick the teams.
-- Returns {status: "assigned"|"queued", court_no, match_no, queue_length}.
create function public.create_match(
  p_queue_id uuid,
  p_expected_version bigint,
  p_team1 bigint[],
  p_team2 bigint[],
  p_balance_text text,
  p_explanation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.queues;
  v_team_size integer;
  v_all_ids bigint[];
  v_court integer;
  v_match_id uuid;
  v_match_no integer;
  v_queue_length integer;
begin
  v_queue := private.lock_owned_queue(p_queue_id, p_expected_version);
  v_team_size := case when v_queue.game_mode = 'singles' then 1 else 2 end;
  v_all_ids := coalesce(p_team1, '{}') || coalesce(p_team2, '{}');

  if coalesce(array_length(p_team1, 1), 0) <> v_team_size
     or coalesce(array_length(p_team2, 1), 0) <> v_team_size
     or (select count(distinct id) from unnest(v_all_ids) as t(id)) <> v_team_size * 2 then
    raise exception 'Invalid team size for this game mode' using errcode = 'P0001';
  end if;

  -- Same eligibility as the old _is_available_for_matchmaking.
  if (
    select count(*) from public.players
    where queue_id = p_queue_id
      and id = any(v_all_ids)
      and removed_at is null
      and not is_playing
      and not is_waiting_match
      and not is_paused
  ) <> v_team_size * 2 then
    raise exception 'Some selected players are no longer available. Please try again.' using errcode = 'P0001';
  end if;

  -- A random free court (old: random.choice(available_courts)).
  select c into v_court
  from generate_series(1, v_queue.court_count) as c
  where not exists (
    select 1 from public.matches
    where queue_id = p_queue_id and status = 'started' and court_no = c
  )
  order by random()
  limit 1;

  if v_court is not null then
    insert into public.matches (queue_id, status, court_no, started_at, balance_text, explanation, queue_length)
    values (
      p_queue_id, 'started', v_court, now(),
      left(coalesce(p_balance_text, ''), 200), left(coalesce(p_explanation, ''), 400),
      (select count(*) from public.matches where queue_id = p_queue_id and status = 'queued')
    )
    returning id into v_match_id;
  else
    v_queue_length := (select count(*) from public.matches where queue_id = p_queue_id and status = 'queued') + 1;
    insert into public.matches (queue_id, status, queue_order, balance_text, explanation, queue_length)
    values (
      p_queue_id, 'queued', v_queue_length,
      left(coalesce(p_balance_text, ''), 200), left(coalesce(p_explanation, ''), 400),
      v_queue_length
    )
    returning id into v_match_id;
  end if;

  insert into public.match_players (match_id, queue_id, player_id, team, slot, player_name, player_skill)
  select v_match_id, p_queue_id, p.id, teams.team, teams.slot, p.name, p.skill
  from (
    select id, 1 as team, ord as slot from unnest(p_team1) with ordinality as t(id, ord)
    union all
    select id, 2 as team, ord as slot from unnest(p_team2) with ordinality as t(id, ord)
  ) teams
  join public.players p on p.id = teams.id;

  if v_court is not null then
    v_match_no := private.apply_match_start(p_queue_id, v_match_id);
  else
    -- All courts busy: reserve these players for the next free court.
    update public.players set is_waiting_match = true where id = any(v_all_ids);

    update public.players
    set rest_games_needed = rest_games_needed - 1
    where queue_id = p_queue_id
      and removed_at is null
      and not (id = any(v_all_ids))
      and not is_playing
      and not is_waiting_match
      and rest_games_needed > 0;

    perform private.move_players_to_end(p_queue_id, v_all_ids);
  end if;

  perform private.touch_queue(p_queue_id);

  return jsonb_build_object(
    'status', case when v_court is not null then 'assigned' else 'queued' end,
    'court_no', v_court,
    'match_no', v_match_no,
    'queue_length', (select count(*) from public.matches where queue_id = p_queue_id and status = 'queued')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_queued_match: "Remove" on an Up Next card
-- ---------------------------------------------------------------------------
create function public.cancel_queued_match(p_queue_id uuid, p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_owned_queue(p_queue_id);

  if not exists (
    select 1 from public.matches
    where id = p_match_id and queue_id = p_queue_id and status = 'queued'
  ) then
    raise exception 'Pending match not found' using errcode = 'P0001';
  end if;

  update public.players
  set is_waiting_match = false
  where not is_playing
    and id in (select player_id from public.match_players where match_id = p_match_id);

  update public.matches
  set status = 'cancelled', queue_order = null, cancel_reason = 'Queued match cancelled by operator'
  where id = p_match_id;

  perform private.renumber_queued_matches(p_queue_id);
  perform private.touch_queue(p_queue_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- update_queue_settings: same as step 6, plus "more courts -> start Up Next"
-- ---------------------------------------------------------------------------
create or replace function public.update_queue_settings(
  p_queue_id uuid,
  p_game_mode public.game_mode default null,
  p_court_fee integer default null,
  p_game_rate integer default null,
  p_court_count integer default null
)
returns public.queues
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.queues;
  v_old_court_count integer;
  v_displaced uuid[];
  v_displaced_count integer;
begin
  v_queue := private.lock_owned_queue(p_queue_id);
  v_old_court_count := v_queue.court_count;

  if p_game_mode is not null and p_game_mode <> v_queue.game_mode then
    if exists (
      select 1 from public.matches
      where queue_id = p_queue_id and status in ('started', 'queued')
    ) then
      raise exception 'Finish or clear active matches before changing the game mode' using errcode = 'P0001';
    end if;
  end if;

  if p_court_fee is not null and p_court_fee < 0 then
    raise exception 'Court fee must be at least 0' using errcode = 'P0001';
  end if;
  if p_game_rate is not null and p_game_rate < 0 then
    raise exception 'Rate must be at least 0' using errcode = 'P0001';
  end if;
  if p_court_count is not null and (p_court_count < 1 or p_court_count > 6) then
    raise exception 'Court count must be 1-6' using errcode = 'P0001';
  end if;

  if p_court_count is not null and p_court_count < v_old_court_count then
    select coalesce(array_agg(id order by court_no), '{}')
    into v_displaced
    from public.matches
    where queue_id = p_queue_id and status = 'started' and court_no > p_court_count;

    v_displaced_count := coalesce(array_length(v_displaced, 1), 0);

    if v_displaced_count > 0 then
      update public.players p
      set queue_position = ordered.new_position
      from (
        select
          pl.id,
          (row_number() over (
            order by
              case
                when d.match_id is not null then 1
                when pl.is_waiting_match then 2
                else 0
              end,
              d.court_order nulls last,
              d.team nulls last,
              d.slot nulls last,
              pl.queue_position,
              pl.id
          ) - 1)::integer as new_position
        from public.players pl
        left join (
          select mp.player_id, mp.team, mp.slot, array_position(v_displaced, mp.match_id) as court_order, mp.match_id
          from public.match_players mp
          where mp.match_id = any(v_displaced)
        ) d on d.player_id = pl.id
        where pl.queue_id = p_queue_id and pl.removed_at is null
      ) ordered
      where p.id = ordered.id;

      update public.players
      set is_playing = false, is_waiting_match = true
      where id in (
        select player_id from public.match_players where match_id = any(v_displaced)
      );

      update public.matches
      set queue_order = queue_order + v_displaced_count
      where queue_id = p_queue_id and status = 'queued';

      update public.matches m
      set status = 'queued',
          queue_order = array_position(v_displaced, m.id),
          queue_length = array_position(v_displaced, m.id),
          court_no = null,
          started_at = null,
          completed_at = null,
          resume_existing = true
      where m.id = any(v_displaced);
    end if;
  end if;

  update public.queues
  set game_mode = coalesce(p_game_mode, game_mode),
      court_fee = coalesce(p_court_fee, court_fee),
      game_rate = coalesce(p_game_rate, game_rate),
      court_count = coalesce(p_court_count, court_count)
  where id = p_queue_id;

  -- More courts: start queued matches on the new free courts (old behavior).
  if p_court_count is not null and p_court_count > v_old_court_count then
    perform private.fill_free_courts(p_queue_id);
  end if;

  perform private.touch_queue(p_queue_id);
  select * into v_queue from public.queues where id = p_queue_id;
  return v_queue;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.create_match(uuid, bigint, bigint[], bigint[], text, text) from public, anon;
revoke all on function public.cancel_queued_match(uuid, uuid) from public, anon;
grant execute on function public.create_match(uuid, bigint, bigint[], bigint[], text, text) to authenticated;
grant execute on function public.cancel_queued_match(uuid, uuid) to authenticated;
