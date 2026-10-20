-- Step 11: public display + live updates (Realtime).
--
-- 1. get_display(queue): the ONLY way a visitor without a login can read a
--    queue. Returns just what the old display showed (queue name, mode, courts
--    with player names and start time, the next 3 matches). No billing, no
--    owner, no table access for anon (RLS still blocks them).
-- 2. Live updates: every change to a queue already bumps queues.version
--    (private.touch_queue). A trigger on that row sends a tiny "queue_changed"
--    message (just the new version, no data) on the Realtime channel
--    "queue:<id>". Screens listening on that channel then reload.
--    Replaces the old 10-second polling + BroadcastChannel (same browser only).
--    The channel is private: anyone may LISTEN to "queue:..." topics (the queue
--    id is the secret, same as the display link), but no policy allows
--    SENDING, so a visitor can't fake updates.

-- ---------------------------------------------------------------------------
-- get_display
-- ---------------------------------------------------------------------------
-- One team of a match, in slot order: [{"id": 12, "name": "Ana"}, ...]
create function private.display_team(p_match_id uuid, p_team integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('id', mp.player_id, 'name', mp.player_name) order by mp.slot),
    '[]'::jsonb
  )
  from public.match_players mp
  where mp.match_id = p_match_id and mp.team = p_team;
$$;

-- Returns null when the queue doesn't exist (or was deleted).
create function public.get_display(p_queue_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', q.name,
    'game_mode', q.game_mode,
    'court_count', q.court_count,
    'courts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'court_no', m.court_no,
          'started_at', m.started_at,
          'team1', private.display_team(m.id, 1),
          'team2', private.display_team(m.id, 2)
        )
        order by m.court_no
      )
      from public.matches m
      where m.queue_id = q.id and m.status = 'started'
    ), '[]'::jsonb),
    'up_next', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'position', next.queue_order,
          'team1', private.display_team(next.id, 1),
          'team2', private.display_team(next.id, 2)
        )
        order by next.queue_order
      )
      from (
        select m.id, m.queue_order
        from public.matches m
        where m.queue_id = q.id and m.status = 'queued'
        order by m.queue_order
        limit 3
      ) next
    ), '[]'::jsonb),
    'queued_count', (
      select count(*) from public.matches m where m.queue_id = q.id and m.status = 'queued'
    )
  )
  from public.queues q
  where q.id = p_queue_id;
$$;

-- ---------------------------------------------------------------------------
-- Live updates: "queue_changed" on channel "queue:<id>"
-- ---------------------------------------------------------------------------
create function private.notify_queue_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform realtime.send(jsonb_build_object('deleted', true), 'queue_changed', 'queue:' || old.id::text, true);
  elsif new.version is distinct from old.version then
    perform realtime.send(jsonb_build_object('version', new.version), 'queue_changed', 'queue:' || new.id::text, true);
  end if;
  return null;
end;
$$;

create trigger queues_notify_changed
after update or delete on public.queues
for each row execute function private.notify_queue_changed();

-- Listening (not sending) is allowed on "queue:..." broadcast topics.
create policy "Anyone with the link can listen to queue changes"
  on realtime.messages for select to anon, authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) like 'queue:%'
  );

-- ---------------------------------------------------------------------------
-- Permissions: the display is public, so anon may call get_display.
-- ---------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.get_display(uuid) from public;
grant execute on function public.get_display(uuid) to anon, authenticated;
