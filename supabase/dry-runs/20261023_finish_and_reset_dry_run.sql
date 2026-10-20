-- DRY RUN for supabase/migrations/20261023120000_finish_and_reset.sql (step 8).
-- Safe to run in the Supabase SQL Editor: everything happens inside one
-- transaction that ends with an error on purpose, so nothing is saved (fake
-- users, queues, players and the new functions all disappear afterwards).
-- The error message lists one line per check; "ALLOWED (bad)" means a problem.

begin;

create function public.finish_game(p_queue_id uuid, p_court_no integer, p_match_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_queue public.queues; v_match public.matches; v_game_ids bigint[]; v_players_per_game integer; v_non_freed_available integer; v_rest integer; v_started_next boolean;
begin
  v_queue := private.lock_owned_queue(p_queue_id);
  if p_court_no is null or p_court_no < 1 or p_court_no > v_queue.court_count then raise exception 'Court not found' using errcode = 'P0001'; end if;
  select * into v_match from public.matches where queue_id = p_queue_id and status = 'started' and court_no = p_court_no;
  if not found then raise exception 'Court is not occupied' using errcode = 'P0001'; end if;
  if p_match_id is not null and v_match.id <> p_match_id then raise exception 'This court already changed. Please check the courts again.' using errcode = 'P0001'; end if;
  select array_agg(player_id) into v_game_ids from public.match_players where match_id = v_match.id;
  v_players_per_game := case when v_queue.game_mode = 'singles' then 2 else 4 end;
  select count(*) into v_non_freed_available from public.players where queue_id = p_queue_id and removed_at is null and not (id = any(v_game_ids)) and not is_playing;
  v_rest := v_non_freed_available / v_players_per_game;
  if v_rest < 1 and (exists (select 1 from public.matches where queue_id = p_queue_id and status = 'started' and court_no <> p_court_no)
     or exists (select 1 from public.matches where queue_id = p_queue_id and status = 'queued')) then v_rest := 1; end if;
  update public.matches set status = 'completed', completed_at = now() where id = v_match.id;
  update public.players set is_playing = false, rest_games_needed = v_rest where id = any(v_game_ids);
  v_started_next := private.start_next_pending(p_queue_id, p_court_no);
  perform private.touch_queue(p_queue_id);
  if v_started_next then
    return jsonb_build_object('message', 'Court finished; next queued match started', 'rest_games_needed', v_rest,
      'queued_remaining', (select count(*) from public.matches where queue_id = p_queue_id and status = 'queued'));
  end if;
  return jsonb_build_object('message', 'Court is now available', 'rest_games_needed', v_rest, 'queued_remaining', 0);
end; $$;

create function public.reset_matchmaking(p_queue_id uuid, p_include_players_on_break boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_owned_queue(p_queue_id);
  update public.matches set status = 'cancelled', queue_order = null, cancel_reason = 'Matchmaking reset before queued match started' where queue_id = p_queue_id and status = 'queued';
  delete from public.pair_memory where queue_id = p_queue_id;
  update public.players set is_playing = false, is_waiting_match = false,
    is_paused = case when p_include_players_on_break then false else is_paused end, rest_games_needed = 0
  where queue_id = p_queue_id and removed_at is null;
  update public.matches set status = 'cancelled', cancel_reason = 'Matchmaking reset while court was active', completed_at = now() where queue_id = p_queue_id and status = 'started';
  perform private.reindex_players(p_queue_id);
  perform private.touch_queue(p_queue_id);
  return jsonb_build_object('message', 'Matchmaking reset; courts cleared, queue returned, and history preserved'
    || case when p_include_players_on_break then '; players on break were returned to ready' else '' end);
end; $$;

-- ===================== TESTS =====================
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'f-test-a@example.invalid');
create temp table results (n serial, check_name text, value text) on commit drop;
grant all on results to authenticated; grant all on sequence results_n_seq to authenticated;
create temp table ids (name text, q uuid) on commit drop; grant all on ids to authenticated;
create function pg_temp.pid(q uuid, n text) returns bigint language sql as $f$ select id from public.players where queue_id = q and name = n and removed_at is null $f$;
create function pg_temp.ver(q uuid) returns bigint language sql as $f$ select version from public.queues where id = q $f$;
create function pg_temp.started_on(q uuid, c int) returns uuid language sql as $f$ select id from public.matches where queue_id = q and status = 'started' and court_no = c $f$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- 1 court, 8 players: match 1 on court, match 2 queued; finishing starts the queued one.
insert into ids select 'one', public.create_queue('One', 'doubles', 0, 50);
select public.update_queue_settings((select q from ids where name='one'), p_court_count => 1);
select count(*) from public.add_players((select q from ids where name='one'),
 '[{"name":"Ava","skill":"intermediate"},{"name":"Bea","skill":"intermediate"},{"name":"Cara","skill":"intermediate"},{"name":"Dana","skill":"intermediate"},
   {"name":"Ella","skill":"intermediate"},{"name":"Faye","skill":"intermediate"},{"name":"Gina","skill":"intermediate"},{"name":"Hana","skill":"intermediate"}]');
do $d$
declare q uuid := (select q from ids where name='one'); r jsonb; m1 uuid;
begin
  perform public.create_match(q, pg_temp.ver(q), array[pg_temp.pid(q,'Ava'), pg_temp.pid(q,'Bea')], array[pg_temp.pid(q,'Cara'), pg_temp.pid(q,'Dana')], 'x', 'x');
  perform public.create_match(q, pg_temp.ver(q), array[pg_temp.pid(q,'Ella'), pg_temp.pid(q,'Faye')], array[pg_temp.pid(q,'Gina'), pg_temp.pid(q,'Hana')], 'x', 'x');
  m1 := pg_temp.started_on(q, 1);
  begin perform public.finish_game(q, 1, gen_random_uuid()); insert into results(check_name, value) values ('wrong match id', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('wrong match id', sqlerrm); end;
  r := public.finish_game(q, 1, m1);
  insert into results(check_name, value) values ('finish 1', (r->>'message') || ' | rest ' || (r->>'rest_games_needed') || ' | left ' || (r->>'queued_remaining'));
  insert into results(check_name, value) select 'match 1', status || ' completed_at set=' || (completed_at is not null) from public.matches where id = m1;
  insert into results(check_name, value) select 'court 1 now', string_agg(mp.player_name, '+' order by mp.team, mp.slot) || ' #' || min(m.match_no) from public.matches m join public.match_players mp on mp.match_id = m.id where m.id = pg_temp.started_on(q, 1);
  insert into results(check_name, value) select 'freed players', string_agg(name || ':rest' || rest_games_needed || ':playing=' || is_playing, ', ' order by name) from public.players where queue_id = q and name in ('Ava','Bea','Cara','Dana');
  insert into results(check_name, value) select 'game-rate charges (expect 8)', count(*)::text from public.ledger_entries l where l.queue_id = q and l.entry_type = 'game_rate';
  begin perform public.finish_game(q, 1, m1); insert into results(check_name, value) values ('double finish', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('double finish', sqlerrm); end;
  r := public.finish_game(q, 1, pg_temp.started_on(q, 1));
  insert into results(check_name, value) values ('finish 2', (r->>'message') || ' | rest ' || (r->>'rest_games_needed'));
  begin perform public.finish_game(q, 1, null); insert into results(check_name, value) values ('finish empty', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('finish empty', sqlerrm); end;
  begin perform public.finish_game(q, 3, null); insert into results(check_name, value) values ('bad court', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('bad court', sqlerrm); end;
end $d$;

-- Rest rule on 2 courts with 10 players.
insert into ids select 'two', public.create_queue('Two', 'doubles', 0, 0);
select count(*) from public.add_players((select q from ids where name='two'),
 '[{"name":"A1","skill":"beginner"},{"name":"A2","skill":"beginner"},{"name":"A3","skill":"beginner"},{"name":"A4","skill":"beginner"},
   {"name":"B1","skill":"beginner"},{"name":"B2","skill":"beginner"},{"name":"B3","skill":"beginner"},{"name":"B4","skill":"beginner"},
   {"name":"F1","skill":"beginner"},{"name":"F2","skill":"beginner"}]');
do $d$
declare q uuid := (select q from ids where name='two'); r jsonb; c int;
begin
  perform public.create_match(q, pg_temp.ver(q), array[pg_temp.pid(q,'A1'), pg_temp.pid(q,'A2')], array[pg_temp.pid(q,'A3'), pg_temp.pid(q,'A4')], 'x', 'x');
  perform public.create_match(q, pg_temp.ver(q), array[pg_temp.pid(q,'B1'), pg_temp.pid(q,'B2')], array[pg_temp.pid(q,'B3'), pg_temp.pid(q,'B4')], 'x', 'x');
  select m.court_no into c from public.matches m join public.match_players mp on mp.match_id = m.id where m.queue_id = q and m.status='started' and mp.player_name='A1';
  r := public.finish_game(q, c, pg_temp.started_on(q, c));
  insert into results(check_name, value) values ('2 free + other court busy (expect rest 1)', (r->>'message') || ' | rest ' || (r->>'rest_games_needed'));
  select court_no into c from public.matches where queue_id = q and status='started';
  r := public.finish_game(q, c, pg_temp.started_on(q, c));
  insert into results(check_name, value) values ('6 free, nothing busy (expect rest 1)', 'rest ' || (r->>'rest_games_needed'));
end $d$;

-- Reset Matchmaking.
insert into ids select 'reset', public.create_queue('Reset', 'singles', 0, 0);
select public.update_queue_settings((select q from ids where name='reset'), p_court_count => 1);
select count(*) from public.add_players((select q from ids where name='reset'),
 '[{"name":"Ava","skill":"beginner"},{"name":"Bea","skill":"beginner"},{"name":"Cara","skill":"beginner"},{"name":"Dana","skill":"beginner"},{"name":"Ella","skill":"beginner"}]');
do $d$
declare q uuid := (select q from ids where name='reset'); r jsonb;
begin
  perform public.set_player_paused(q, pg_temp.pid(q,'Ella'), true);
  perform public.create_match(q, pg_temp.ver(q), array[pg_temp.pid(q,'Ava')], array[pg_temp.pid(q,'Bea')], 'x', 'x');
  perform public.create_match(q, pg_temp.ver(q), array[pg_temp.pid(q,'Cara')], array[pg_temp.pid(q,'Dana')], 'x', 'x');
  r := public.reset_matchmaking(q, false);
  insert into results(check_name, value) values ('reset msg', r->>'message');
  insert into results(check_name, value) select 'reset players', string_agg(name || ':' || is_playing || '/' || is_waiting_match || '/paused=' || is_paused || '/rest' || rest_games_needed, ', ' order by name) from public.players where queue_id = q;
  insert into results(check_name, value) select 'reset matches', string_agg(status || ':' || cancel_reason, ' | ' order by cancel_reason) from public.matches where queue_id = q;
  insert into results(check_name, value) select 'pair memory left (expect 0)', count(*)::text from public.pair_memory where queue_id = q;
  insert into results(check_name, value) select 'match counter kept (expect 1)', match_no::text from public.queues where id = q;
  r := public.reset_matchmaking(q, true);
  insert into results(check_name, value) values ('reset incl. break', (r->>'message') || ' | Ella paused=' || (select is_paused from public.players where id = pg_temp.pid(q,'Ella')));
end $d$;

reset role;

-- Show the results as an error message. The error also undoes the whole
-- transaction, so nothing above is saved. (The SQL Editor only shows the
-- output of the last statement, so a plain SELECT before ROLLBACK would be hidden.)
do $$
declare v_report text;
begin
  select string_agg(n || '. ' || check_name || ' => ' || value, E'\n' order by n) into v_report from results;
  raise exception E'DRY RUN RESULTS (nothing was saved):\n%', v_report;
end $$;
