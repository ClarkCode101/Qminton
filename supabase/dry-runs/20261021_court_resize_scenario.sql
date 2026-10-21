-- SCENARIO TEST (owner's request 2026-10-21): 1 court, 12 players, then add and
-- remove courts while matches are playing / waiting, and check the old rules:
--   * adding a court starts the oldest Up Next match on it,
--   * removing a busy court puts its match at the FRONT of Up Next (same match
--     number, no second game-rate charge), and adding the court back resumes it,
--   * Finish Game starts the next Up Next match on that court.
-- Uses the functions already in the database (no changes). Safe to run in the
-- SQL Editor: it ends with an error on purpose, so nothing is saved.

begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'scenario@example.invalid');
create temp table results (n serial, step text, value text) on commit drop;
grant all on results to authenticated; grant all on sequence results_n_seq to authenticated;
create temp table ids (q uuid) on commit drop; grant all on ids to authenticated;

create function pg_temp.pid(q uuid, n text) returns bigint language sql as $f$
  select id from public.players where queue_id = q and name = n and removed_at is null $f$;
create function pg_temp.ver(q uuid) returns bigint language sql as $f$
  select version from public.queues where id = q $f$;
create function pg_temp.started_on(q uuid, c int) returns uuid language sql as $f$
  select id from public.matches where queue_id = q and status = 'started' and court_no = c $f$;
-- One line with the whole state: courts, Up Next, charges.
create function pg_temp.state(q uuid) returns text language sql as $f$
  select 'courts=' || (select court_count from public.queues where id = q)
    || ' | on court: ' || coalesce((
         select string_agg('C' || m.court_no || '=#' || m.match_no || '(' || (
             select string_agg(mp.player_name, '+' order by mp.team, mp.slot) from public.match_players mp where mp.match_id = m.id) || ')',
           ' ' order by m.court_no)
         from public.matches m where m.queue_id = q and m.status = 'started'), '-')
    || ' | up next: ' || coalesce((
         select string_agg(m.queue_order || '.' || coalesce('#' || m.match_no, 'new') || case when m.resume_existing then '(resume)' else '' end
             || '(' || (select string_agg(mp.player_name, '+' order by mp.team, mp.slot) from public.match_players mp where mp.match_id = m.id) || ')',
           ' ' order by m.queue_order)
         from public.matches m where m.queue_id = q and m.status = 'queued'), '-')
    || ' | game-rate charges=' || (select count(*) from public.ledger_entries l where l.queue_id = q and l.entry_type = 'game_rate')
$f$;
create function pg_temp.flags(q uuid) returns text language sql as $f$
  select 'playing=' || count(*) filter (where is_playing) || ' waiting=' || count(*) filter (where is_waiting_match)
    || ' both=' || count(*) filter (where is_playing and is_waiting_match)
    || ' free=' || count(*) filter (where not is_playing and not is_waiting_match)
  from public.players where queue_id = q and removed_at is null $f$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);

insert into ids select public.create_queue('Scenario', 'doubles', 0, 10);
select public.update_queue_settings((select q from ids), p_court_count => 1);
select count(*) from public.add_players((select q from ids),
 '[{"name":"P01","skill":"beginner"},{"name":"P02","skill":"beginner"},{"name":"P03","skill":"beginner"},{"name":"P04","skill":"beginner"},
   {"name":"P05","skill":"beginner"},{"name":"P06","skill":"beginner"},{"name":"P07","skill":"beginner"},{"name":"P08","skill":"beginner"},
   {"name":"P09","skill":"beginner"},{"name":"P10","skill":"beginner"},{"name":"P11","skill":"beginner"},{"name":"P12","skill":"beginner"}]');

do $d$
declare q uuid := (select q from ids); r jsonb;
begin
  -- 1 court: A plays, B and C wait.
  perform public.create_match(q, pg_temp.ver(q), array[pg_temp.pid(q,'P01'), pg_temp.pid(q,'P02')], array[pg_temp.pid(q,'P03'), pg_temp.pid(q,'P04')], 'x', 'x');
  perform public.create_match(q, pg_temp.ver(q), array[pg_temp.pid(q,'P05'), pg_temp.pid(q,'P06')], array[pg_temp.pid(q,'P07'), pg_temp.pid(q,'P08')], 'x', 'x');
  perform public.create_match(q, pg_temp.ver(q), array[pg_temp.pid(q,'P09'), pg_temp.pid(q,'P10')], array[pg_temp.pid(q,'P11'), pg_temp.pid(q,'P12')], 'x', 'x');
  insert into results(step, value) values ('1. 1 court, 3 matches (expect #1 on C1, 2 waiting, 1 charge x4)', pg_temp.state(q) || ' | ' || pg_temp.flags(q));

  perform public.update_queue_settings(q, p_court_count => 2);
  insert into results(step, value) values ('2. + court -> 2 (expect waiting match starts on C2)', pg_temp.state(q) || ' | ' || pg_temp.flags(q));

  perform public.update_queue_settings(q, p_court_count => 3);
  insert into results(step, value) values ('3. + court -> 3 (expect last waiting match on C3, Up Next empty)', pg_temp.state(q) || ' | ' || pg_temp.flags(q));

  perform public.update_queue_settings(q, p_court_count => 1);
  insert into results(step, value) values ('4. - courts -> 1 (expect C2 + C3 matches at FRONT of Up Next, same #, no new charges)', pg_temp.state(q) || ' | ' || pg_temp.flags(q));

  perform public.update_queue_settings(q, p_court_count => 2);
  insert into results(step, value) values ('5. + court -> 2 (expect first resumed on C2, same #, no new charge)', pg_temp.state(q) || ' | ' || pg_temp.flags(q));

  r := public.finish_game(q, 1, pg_temp.started_on(q, 1));
  insert into results(step, value) values ('6. finish C1 (expect next Up Next match resumes on C1)', (r->>'message') || ' | ' || pg_temp.state(q) || ' | ' || pg_temp.flags(q));
  insert into results(step, value) select '   rest of finished players', string_agg(name || ':rest' || rest_games_needed, ' ' order by name) from public.players where queue_id = q and name in ('P01','P02','P03','P04');

  r := public.finish_game(q, 2, pg_temp.started_on(q, 2));
  insert into results(step, value) values ('7. finish C2 (expect C2 free, nothing waiting)', (r->>'message') || ' | ' || pg_temp.state(q) || ' | ' || pg_temp.flags(q));

  -- New match on the free court 2, then finish court 1 and remove court 2.
  perform public.create_match(q, pg_temp.ver(q), array[pg_temp.pid(q,'P01'), pg_temp.pid(q,'P05')], array[pg_temp.pid(q,'P02'), pg_temp.pid(q,'P06')], 'x', 'x');
  insert into results(step, value) values ('8. new match (expect it on C2, the free court)', pg_temp.state(q) || ' | ' || pg_temp.flags(q));
  r := public.finish_game(q, 1, pg_temp.started_on(q, 1));
  perform public.update_queue_settings(q, p_court_count => 1);
  insert into results(step, value) values ('9. finish C1, then - court -> 1 while C2 plays (old rule: C2 match to Up Next)', pg_temp.state(q) || ' | ' || pg_temp.flags(q));

  begin perform public.update_queue_settings(q, p_court_count => 0); insert into results(step, value) values ('10. 0 courts', 'ALLOWED (bad)');
  exception when others then insert into results(step, value) values ('10. 0 courts (expect refused)', sqlerrm); end;
  begin perform public.update_queue_settings(q, p_court_count => 7); insert into results(step, value) values ('11. 7 courts', 'ALLOWED (bad)');
  exception when others then insert into results(step, value) values ('11. 7 courts (expect refused)', sqlerrm); end;
  begin
    perform public.create_match(q, pg_temp.ver(q) - 1, array[pg_temp.pid(q,'P09'), pg_temp.pid(q,'P10')], array[pg_temp.pid(q,'P11'), pg_temp.pid(q,'P12')], 'x', 'x');
    insert into results(step, value) values ('12. stale version', 'ALLOWED (bad)');
  exception when others then insert into results(step, value) values ('12. stale version (expect refused)', sqlerrm); end;
  insert into results(step, value) select '13. every match ever', string_agg(coalesce('#' || match_no, 'new') || ':' || status, ' ' order by created_at) from public.matches where queue_id = q;
  insert into results(step, value) select '14. games played', string_agg(name || '=' || games_played, ' ' order by name) from public.players where queue_id = q;
end $d$;

reset role;

do $$
declare v_report text;
begin
  select string_agg(step || E'\n     ' || value, E'\n' order by n) into v_report from results;
  raise exception E'SCENARIO RESULTS (nothing was saved):\n%', v_report;
end $$;
