-- DRY RUN for supabase/migrations/20261025120000_display_realtime.sql (step 11).
-- Safe to run in the Supabase SQL Editor: everything happens inside one
-- transaction that ends with an error on purpose, so nothing is saved (fake
-- user, queue, players, realtime messages and the new functions all disappear).
-- The error message lists one line per check; "ALLOWED (bad)" means a problem.
-- It contains an exact copy of the migration, followed by the tests.
-- Note: realtime.messages has daily partitions that the Realtime server creates
-- once any client has connected. On a project nobody has connected to yet, the
-- message checks show 0 (realtime.send only warns); open the app once, then rerun.

begin;

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

-- ===================== TESTS =====================
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'd-test-a@example.invalid');
create temp table results (n serial, check_name text, value text) on commit drop;
grant all on results to authenticated, anon; grant all on sequence results_n_seq to authenticated, anon;
create temp table ids (name text, q uuid) on commit drop; grant all on ids to authenticated, anon;
create function pg_temp.pid(q uuid, n text) returns bigint language sql as $f$ select id from public.players where queue_id = q and name = n $f$;
create function pg_temp.ver(q uuid) returns bigint language sql as $f$ select version from public.queues where id = q $f$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

-- 1 court, 20 players: 1 match on court + 4 queued.
insert into ids select 'disp', public.create_queue('Display Test', 'doubles', 0, 0);
select public.update_queue_settings((select q from ids where name='disp'), p_court_count => 1);
select count(*) from public.add_players((select q from ids where name='disp'),
  (select jsonb_agg(jsonb_build_object('name', 'P' || i, 'skill', 'beginner')) from generate_series(1, 20) i));
do $d$
declare q uuid := (select q from ids where name='disp'); g int;
begin
  for g in 0..4 loop
    perform public.create_match(q, pg_temp.ver(q),
      array[pg_temp.pid(q, 'P' || (g*4+1)), pg_temp.pid(q, 'P' || (g*4+2))],
      array[pg_temp.pid(q, 'P' || (g*4+3)), pg_temp.pid(q, 'P' || (g*4+4))], 'x', 'x');
  end loop;
end $d$;
reset role;

-- The trigger queued "queue_changed" messages on the queue's topic.
insert into results(check_name, value)
select 'realtime messages for this queue (expect > 0, private)', count(*) || ' | private=' || coalesce(bool_and(private)::text, '-') || ' | event=' || coalesce(min(event), '-')
from realtime.messages where topic = 'queue:' || (select q from ids where name='disp');
insert into results(check_name, value)
select 'latest payload', payload::text from realtime.messages
where topic = 'queue:' || (select q from ids where name='disp') order by inserted_at desc, id desc limit 1;

-- A visitor (anon) reads the display.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $d$
declare q uuid := (select q from ids where name='disp'); d jsonb;
begin
  d := public.get_display(q);
  insert into results(check_name, value) values ('anon display name/mode/courts', (d->>'name') || ' | ' || (d->>'game_mode') || ' | court_count ' || (d->>'court_count'));
  insert into results(check_name, value) values ('courts playing (expect 1, court 1, P1+P2 vs P3+P4)',
    jsonb_array_length(d->'courts') || ' | court ' || (d->'courts'->0->>'court_no') || ' | '
    || (select string_agg(x->>'name', '+') from jsonb_array_elements(d->'courts'->0->'team1') x) || ' vs '
    || (select string_agg(x->>'name', '+') from jsonb_array_elements(d->'courts'->0->'team2') x)
    || ' | started_at set=' || ((d->'courts'->0->>'started_at') is not null));
  insert into results(check_name, value) values ('up next (expect 3 shown of 4, positions 1,2,3)',
    jsonb_array_length(d->'up_next') || ' of ' || (d->>'queued_count') || ' | positions '
    || (select string_agg(x->>'position', ',') from jsonb_array_elements(d->'up_next') x)
    || ' | first: ' || (select string_agg(x->>'name', '+') from jsonb_array_elements(d->'up_next'->0->'team1') x));
  insert into results(check_name, value) values ('no private fields (expect false)', (d ? 'owner_id' or d ? 'version' or d ? 'court_fee')::text);
  insert into results(check_name, value) values ('unknown queue (expect null)', coalesce(public.get_display(gen_random_uuid())::text, 'null'));
  begin perform count(*) from public.queues; insert into results(check_name, value) values ('anon reads queues table', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('anon reads queues table', sqlerrm); end;
  begin perform public.finish_game(q, 1, null); insert into results(check_name, value) values ('anon finishes a game', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('anon finishes a game', sqlerrm); end;
  begin perform private.display_team(gen_random_uuid(), 1); insert into results(check_name, value) values ('anon calls private helper', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('anon calls private helper', sqlerrm); end;

  -- Realtime policy: may listen on queue:... topics, not others; may not send.
  perform set_config('realtime.topic', 'queue:' || q::text, true);
  insert into results(check_name, value) select 'anon can listen on its queue topic (expect > 0)', count(*)::text from realtime.messages;
  perform set_config('realtime.topic', 'other-topic', true);
  insert into results(check_name, value) select 'anon listens on another topic (expect 0)', count(*)::text from realtime.messages;
  begin
    insert into realtime.messages (topic, extension, payload, event, private) values ('queue:' || q::text, 'broadcast', '{}', 'queue_changed', true);
    insert into results(check_name, value) values ('anon sends a fake update', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('anon sends a fake update', sqlerrm); end;
end $d$;
reset role;

-- Deleting the queue tells listeners too.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
do $d$
begin
  perform set_config('realtime.topic', 'queue:' || (select q from ids where name='disp')::text, true);
  begin
    insert into realtime.messages (topic, extension, payload, event, private) values ('queue:' || (select q from ids where name='disp')::text, 'broadcast', '{}', 'queue_changed', true);
    insert into results(check_name, value) values ('logged-in user sends a fake update', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('logged-in user sends a fake update', sqlerrm); end;
end $d$;
select public.delete_queue((select q from ids where name='disp'));
reset role;
insert into results(check_name, value)
select 'delete message', coalesce(string_agg(payload::text, ' '), 'none') from realtime.messages
where topic = 'queue:' || (select q from ids where name='disp') and payload ? 'deleted';

do $$
declare v_report text;
begin
  select string_agg(n || '. ' || check_name || ' => ' || value, E'\n' order by n) into v_report from results;
  raise exception E'DRY RUN RESULTS (nothing was saved):\n%', v_report;
end $$;
