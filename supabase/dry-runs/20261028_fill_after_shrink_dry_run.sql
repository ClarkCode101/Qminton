-- DRY RUN for supabase/migrations/20261028120000_fill_after_shrink.sql:
-- the migration + the 1-court / 12-player scenario test. Ends with an error on
-- purpose, so nothing is saved.

begin;

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

-- ===================== SCENARIO =====================

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
  insert into results(step, value) values ('9. finish C1, then - court -> 1 while C2 plays (NEW: #4 continues on C1, no new charge)', pg_temp.state(q) || ' | ' || pg_temp.flags(q));

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
