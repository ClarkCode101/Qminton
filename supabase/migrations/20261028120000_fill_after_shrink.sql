-- Fewer courts -> also fill free courts (owner's OK 2026-10-21).
-- Found by the 1-court / 12-player scenario test
-- (supabase/dry-runs/20261021_court_resize_scenario.sql, step 9): with court 1
-- free and court 2 playing, going to 1 court moved the court-2 match to Up
-- Next but left court 1 empty (same as old OrcaRally). Now the match continues
-- on court 1 right away (same match number, no second game-rate charge).
-- Only change vs 20261022120000_matchmaking.sql: the fill condition.

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

  -- Any court change: start Up Next matches on free courts. More courts = old
  -- behavior. Fewer courts (new, owner's OK 2026-10-21): a match moved off a
  -- removed court used to wait in Up Next while a remaining court sat empty.
  if p_court_count is not null and p_court_count <> v_old_court_count then
    perform private.fill_free_courts(p_queue_id);
  end if;

  perform private.touch_queue(p_queue_id);
  select * into v_queue from public.queues where id = p_queue_id;
  return v_queue;
end;
$$;

revoke all on function public.update_queue_settings(uuid, public.game_mode, integer, integer, integer) from public, anon;
grant execute on function public.update_queue_settings(uuid, public.game_mode, integer, integer, integer) to authenticated;
