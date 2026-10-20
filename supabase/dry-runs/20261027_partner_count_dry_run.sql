-- DRY RUN for supabase/migrations/20261027120000_partner_count.sql (teammate count for matchmaking).
-- Safe to run in the Supabase SQL Editor: everything happens inside one
-- transaction that ends with an error on purpose, so nothing is saved.
-- The error message lists one line per check.
-- It makes one "old" row first, then runs an exact copy of the migration, then the tests.

begin;

-- Before the migration: an "old" pair-memory row (count 0), like real data from before.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'e-test-a@example.invalid');
create temp table results (n serial, check_name text, value text) on commit drop;
grant all on results to authenticated; grant all on sequence results_n_seq to authenticated;
create temp table ids (name text, q uuid) on commit drop; grant all on ids to authenticated;
insert into public.queues (id, owner_id, name) values ('00000000-0000-0000-0000-00000000e0e0', '00000000-0000-0000-0000-0000000000e1', 'Old data');
insert into public.players (queue_id, name, skill) values
  ('00000000-0000-0000-0000-00000000e0e0', 'Old1', 'beginner'), ('00000000-0000-0000-0000-00000000e0e0', 'Old2', 'beginner');
insert into public.pair_memory (queue_id, kind, player_a, player_b, last_match_no, opponent_count)
select '00000000-0000-0000-0000-00000000e0e0', 'partner', min(id), max(id), 3, 0
from public.players where queue_id = '00000000-0000-0000-0000-00000000e0e0';

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

-- ===================== TESTS =====================
insert into results(check_name, value)
select 'old row backfilled (expect 1)', times_together::text from public.pair_memory where queue_id = '00000000-0000-0000-0000-00000000e0e0';
insert into results(check_name, value)
select 'column renamed', string_agg(column_name, ',') from information_schema.columns
where table_schema = 'public' and table_name = 'pair_memory' and column_name in ('times_together', 'opponent_count');

create function pg_temp.pid(q uuid, n text) returns bigint language sql as $f$ select id from public.players where queue_id = q and name = n $f$;
create function pg_temp.ver(q uuid) returns bigint language sql as $f$ select version from public.queues where id = q $f$;
create function pg_temp.cnt(q uuid, k text, x text, y text) returns text language sql as $f$
  select coalesce((select times_together::text from public.pair_memory
    where queue_id = q and kind = k::public.pair_kind
      and player_a = least(pg_temp.pid(q, x), pg_temp.pid(q, y)) and player_b = greatest(pg_temp.pid(q, x), pg_temp.pid(q, y))), 'none') $f$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

-- Doubles game 1: A+B vs C+D.
insert into ids select 'dbl', public.create_queue('Doubles', 'doubles', 0, 0);
select count(*) from public.add_players((select q from ids where name='dbl'),
  '[{"name":"A","skill":"beginner"},{"name":"B","skill":"beginner"},{"name":"C","skill":"beginner"},{"name":"D","skill":"beginner"},{"name":"E","skill":"beginner"},{"name":"F","skill":"beginner"}]');
do $d$
declare q uuid := (select q from ids where name='dbl'); c int;
begin
  perform public.create_match(q, pg_temp.ver(q), array[pg_temp.pid(q,'A'), pg_temp.pid(q,'B')], array[pg_temp.pid(q,'C'), pg_temp.pid(q,'D')], 'x', 'x');
  insert into results(check_name, value) values ('after game 1: partner A+B / C+D, opponent A-C, pair A-C (expect 1 / 1, 1, 1)',
    pg_temp.cnt(q,'partner','A','B') || ' / ' || pg_temp.cnt(q,'partner','C','D') || ', ' || pg_temp.cnt(q,'opponent','A','C') || ', ' || pg_temp.cnt(q,'pair','A','C'));
  select court_no into c from public.matches where queue_id = q and status = 'started';
  perform public.finish_game(q, c, null);
end $d$;
reset role;
update public.players set rest_games_needed = 0 where queue_id = (select q from ids where name='dbl');  -- test only: skip rest
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

-- Doubles game 2: A+B again, vs E+F.
do $d$
declare q uuid := (select q from ids where name='dbl');
begin
  perform public.create_match(q, pg_temp.ver(q), array[pg_temp.pid(q,'A'), pg_temp.pid(q,'B')], array[pg_temp.pid(q,'E'), pg_temp.pid(q,'F')], 'x', 'x');
  insert into results(check_name, value) values ('after game 2: partner A+B, C+D, E+F (expect 2, 1, 1)',
    pg_temp.cnt(q,'partner','A','B') || ', ' || pg_temp.cnt(q,'partner','C','D') || ', ' || pg_temp.cnt(q,'partner','E','F'));
  insert into results(check_name, value) select 'match number + A games (expect 2 | 2)',
    (select match_no from public.queues where id = q) || ' | ' || (select games_played from public.players where id = pg_temp.pid(q,'A'));
end $d$;

-- Singles: opponent count works like before (old opponent_pair_count).
insert into ids select 'sgl', public.create_queue('Singles', 'singles', 0, 0);
select count(*) from public.add_players((select q from ids where name='sgl'), '[{"name":"S1","skill":"beginner"},{"name":"S2","skill":"beginner"}]');
do $d$
declare q uuid := (select q from ids where name='sgl'); c int;
begin
  perform public.update_queue_settings(q, p_court_count => 1);
  perform public.create_match(q, pg_temp.ver(q), array[pg_temp.pid(q,'S1')], array[pg_temp.pid(q,'S2')], 'x', 'x');
  select court_no into c from public.matches where queue_id = q and status = 'started';
  perform public.finish_game(q, c, null);
end $d$;
reset role;
update public.players set rest_games_needed = 0 where queue_id = (select q from ids where name='sgl');  -- test only: skip rest
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
do $d$
declare q uuid := (select q from ids where name='sgl');
begin
  perform public.create_match(q, pg_temp.ver(q), array[pg_temp.pid(q,'S1')], array[pg_temp.pid(q,'S2')], 'x', 'x');
  insert into results(check_name, value) values ('singles opponent S1-S2 met (expect 2)', pg_temp.cnt(q,'opponent','S1','S2'));
end $d$;

-- The app's snapshot reads pair_memory as the logged-in owner.
insert into results(check_name, value)
select 'owner can read times_together (expect 2 rows)', count(*)::text from public.pair_memory
where queue_id = (select q from ids where name='sgl') and times_together > 0;

-- Reset Matchmaking still clears the memory.
do $d$
declare q uuid := (select q from ids where name='dbl');
begin
  perform public.reset_matchmaking(q, false);
  insert into results(check_name, value) select 'after reset: memory rows (expect 0)', count(*)::text from public.pair_memory where queue_id = q;
end $d$;
reset role;

do $$
declare v_report text;
begin
  select string_agg(n || '. ' || check_name || ' => ' || value, E'\n' order by n) into v_report from results;
  raise exception E'DRY RUN RESULTS (nothing was saved):\n%', v_report;
end $$;
