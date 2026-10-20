-- Matchmaking: remember how many times each pair has been teammates (owner's
-- request, 2026-10-21). Changes the old OrcaRally behavior on purpose.
--
-- Why: the old rule only avoided repeat partners for 3 matches (counted across
-- the whole queue). With ~50 players a player plays about once every 12
-- matches, so that protection had always expired by their next game. Now the
-- app keeps a count for the whole session and the team picker gives every
-- previous time together a big penalty (see web/src/features/matchmaking/engine.ts).
--
-- pair_memory.opponent_count becomes times_together: how many matches this
-- pair has played in that role (pair / partner / opponent), in every game mode.
-- Singles opponent counts mean exactly what they meant before.

alter table public.pair_memory rename column opponent_count to times_together;
alter table public.pair_memory rename constraint pair_memory_opponent_count_check to pair_memory_times_together_check;

-- Rows from before this change were only counted for singles opponents; every
-- existing row means the pair met at least once.
update public.pair_memory set times_together = 1 where times_together = 0;

-- Same as the step 7 version, except every pair-memory row now counts up by 1.
create or replace function private.apply_match_start(p_queue_id uuid, p_match_id uuid)
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
    -- teammates or "opponent" for players on opposite sides. Each row keeps the
    -- last match they met in and how many times they have met in that role.
    insert into public.pair_memory (queue_id, kind, player_a, player_b, last_match_no, times_together)
    select
      p_queue_id,
      kinds.kind,
      a.player_id,
      b.player_id,
      v_match_no,
      1
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
          times_together = public.pair_memory.times_together + 1;

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

revoke all on function private.apply_match_start(uuid, uuid) from public, anon, authenticated;
