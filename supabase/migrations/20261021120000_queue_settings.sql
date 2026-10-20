-- Step 6: queue settings (billing setup, game mode rule, court count resize).
--
-- Port of the old PATCH /settings + _resize_courts (OrcaRally backend/main.py).
-- Pass only what changes; null means "leave as is".
--
-- Court resize rules (same as the old app):
--   * Fewer courts: a match running on a removed court goes back to the FRONT of
--     Up Next (in court order) with resume_existing = true, so when it restarts it
--     keeps its match number and is not billed again. Its players become
--     "Up Next" and move behind the other free players.
--   * More courts: the old app immediately started queued matches on the new
--     courts. That needs the "start match" logic from step 7, so it is wired in
--     there (private.fill_free_courts). Until then nothing can be queued anyway.

create function public.update_queue_settings(
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
  v_displaced uuid[];
  v_displaced_count integer;
begin
  v_queue := private.lock_owned_queue(p_queue_id);

  -- Game mode: only when no match is running or waiting (old rule).
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

  -- Shrinking: send matches on removed courts back to the front of Up Next.
  if p_court_count is not null and p_court_count < v_queue.court_count then
    select coalesce(array_agg(id order by court_no), '{}')
    into v_displaced
    from public.matches
    where queue_id = p_queue_id and status = 'started' and court_no > p_court_count;

    v_displaced_count := coalesce(array_length(v_displaced, 1), 0);

    if v_displaced_count > 0 then
      -- New player order (old: non-waiting + displaced + already-waiting).
      -- Displaced players keep court order, then team, then slot.
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

      -- Make room at the front of Up Next, then put the displaced matches there.
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
      court_count = coalesce(p_court_count, court_count),
      version = version + 1,
      updated_at = now()
  where id = p_queue_id
  returning * into v_queue;

  return v_queue;
end;
$$;

revoke all on function public.update_queue_settings(uuid, public.game_mode, integer, integer, integer) from public, anon;
grant execute on function public.update_queue_settings(uuid, public.game_mode, integer, integer, integer) to authenticated;
