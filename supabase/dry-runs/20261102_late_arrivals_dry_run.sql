-- DRY RUN for supabase/migrations/20261102120000_late_arrivals.sql.
-- Safe in the SQL Editor: ends with an error on purpose, so nothing is saved.

begin;
-- Late arrivals at Start session (owner's request, 2026-10-21).
--
-- In "Who came?", the people marked "Not here" no longer stay out: they join
-- the queue ON BREAK (people often just arrive late). Owner's choices:
--   * They are billed the court fee only when they arrive: the first time the
--     organizer marks them Ready. If they never come and are removed, nothing
--     was billed.
--   * No separate "won't come" state: someone who never shows is removed.
-- players.court_fee_pending marks "joined on break from Start, fee not billed
-- yet". Every way a player gets out of the break bills it first:
-- set_player_paused(false) and reset_matchmaking(include players on break).
-- Their sign-up is marked "arrived" (linked to the player) like the others.

alter table public.players add column court_fee_pending boolean not null default false;

-- Bills the waiting court fee of one player (if any) and clears the flag.
create function private.bill_pending_court_fee(p_player public.players, p_court_fee integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not p_player.court_fee_pending then
    return;
  end if;
  if p_court_fee > 0 then
    insert into public.ledger_entries (queue_id, player_id, player_name, amount, entry_type, note)
    values (p_player.queue_id, p_player.id, p_player.name, p_court_fee, 'court_fee', 'Initial court fee');
  end if;
  update public.players set court_fee_pending = false where id = p_player.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- start_session: those who came as before; the rest join on break, not billed
-- ---------------------------------------------------------------------------
create or replace function public.start_session(p_queue_id uuid, p_arrived bigint[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.queues;
  v_signup public.signups;
  v_player_id bigint;
  v_position integer;
  v_added integer := 0;
  v_late integer := 0;
  v_here boolean;
begin
  v_queue := private.lock_owned_queue(p_queue_id);
  if v_queue.status <> 'planned' then
    raise exception 'This session already started' using errcode = 'P0001';
  end if;

  select coalesce(max(queue_position) + 1, 0) into v_position
  from public.players
  where queue_id = p_queue_id and removed_at is null;

  -- Those who came first (in sign-up order), then the late ones at the end of
  -- the line (they play once they arrive and are marked Ready).
  for v_signup in
    select * from public.signups
    where queue_id = p_queue_id and status = 'going'
    order by (id = any(coalesce(p_arrived, '{}'))) desc, created_at, id
  loop
    v_here := v_signup.id = any(coalesce(p_arrived, '{}'));
    v_player_id := null;
    insert into public.players (queue_id, name, skill, queue_position, is_paused, court_fee_pending)
    values (p_queue_id, v_signup.name, v_signup.skill, v_position, not v_here, not v_here and v_queue.court_fee > 0)
    on conflict (queue_id, lower(name)) where removed_at is null do nothing
    returning id into v_player_id;

    if v_player_id is null then
      -- Already a player with that name: link to them, don't bill twice.
      select id into v_player_id from public.players
      where queue_id = p_queue_id and removed_at is null and lower(name) = lower(v_signup.name);
    else
      v_position := v_position + 1;
      if v_here then
        v_added := v_added + 1;
        if v_queue.court_fee > 0 then
          insert into public.ledger_entries (queue_id, player_id, player_name, amount, entry_type, note)
          values (p_queue_id, v_player_id, v_signup.name, v_queue.court_fee, 'court_fee', 'Initial court fee');
        end if;
      else
        v_late := v_late + 1;
      end if;
    end if;

    update public.signups
    set status = 'arrived', player_id = v_player_id, updated_at = now()
    where id = v_signup.id;
  end loop;

  update public.queues set status = 'live' where id = p_queue_id;
  update public.check_ins set is_open = false, updated_at = now() where queue_id = p_queue_id;

  perform private.touch_queue(p_queue_id);
  return jsonb_build_object('added', v_added, 'late', v_late);
end;
$$;

-- ---------------------------------------------------------------------------
-- set_player_paused: same as before; marking a late arrival Ready bills them
-- ---------------------------------------------------------------------------
create or replace function public.set_player_paused(p_queue_id uuid, p_player_id bigint, p_paused boolean)
returns public.players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.queues;
  v_player public.players;
begin
  v_queue := private.lock_owned_queue(p_queue_id);
  v_player := private.get_active_player(p_queue_id, p_player_id);
  if p_paused then
    perform private.require_player_editable(v_player, 'pause');
  else
    perform private.bill_pending_court_fee(v_player, v_queue.court_fee);
  end if;

  update public.players
  set is_paused = p_paused
  where id = p_player_id
  returning * into v_player;

  perform private.touch_queue(p_queue_id);
  return v_player;
end;
$$;

-- ---------------------------------------------------------------------------
-- reset_matchmaking: same as before; returning players on break to Ready bills
-- any late arrival's waiting court fee first
-- ---------------------------------------------------------------------------
create or replace function public.reset_matchmaking(p_queue_id uuid, p_include_players_on_break boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.queues;
  v_player public.players;
begin
  v_queue := private.lock_owned_queue(p_queue_id);

  update public.matches
  set status = 'cancelled', queue_order = null,
      cancel_reason = 'Matchmaking reset before queued match started'
  where queue_id = p_queue_id and status = 'queued';

  delete from public.pair_memory where queue_id = p_queue_id;

  if p_include_players_on_break then
    for v_player in
      select * from public.players
      where queue_id = p_queue_id and removed_at is null and is_paused and court_fee_pending
    loop
      perform private.bill_pending_court_fee(v_player, v_queue.court_fee);
    end loop;
  end if;

  update public.players
  set is_playing = false,
      is_waiting_match = false,
      is_paused = case when p_include_players_on_break then false else is_paused end,
      rest_games_needed = 0
  where queue_id = p_queue_id and removed_at is null;

  update public.matches
  set status = 'cancelled',
      cancel_reason = 'Matchmaking reset while court was active',
      completed_at = now()
  where queue_id = p_queue_id and status = 'started';

  perform private.reindex_players(p_queue_id);
  perform private.touch_queue(p_queue_id);

  return jsonb_build_object(
    'message',
    'Matchmaking reset; courts cleared, queue returned, and history preserved'
      || case when p_include_players_on_break then '; players on break were returned to ready' else '' end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions (the public functions keep theirs: create or replace)
-- ---------------------------------------------------------------------------
revoke all on function private.bill_pending_court_fee(public.players, integer) from public, anon, authenticated;

-- ===================== TESTS (15 checks) =====================
-- Steps that fake a situation ("Dan is late again") change the table directly,
-- which only the database admin may do (a logged-in user gets "permission
-- denied": direct table changes are blocked on purpose). So those run after
-- "reset role"; everything the app does runs as the logged-in organizer.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a4', 'late-a@example.invalid');
create temp table results (n serial, check_name text, value text) on commit drop;
grant all on results to anon, authenticated; grant all on sequence results_n_seq to anon, authenticated;
create temp table ids (name text, q uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}', true);
insert into ids (name, q) select 'paid', public.create_queue('Paid', 'doubles', 50, 20);
insert into ids (name, q) select 'free', public.create_queue('Free', 'doubles', 0, 0);

do $d$
declare v_q uuid := (select ids.q from ids where ids.name = 'paid'); r jsonb;
  v_ana bigint; v_ben bigint; v_cy bigint;
begin
  perform public.set_queue_plan(v_q, '2026-10-25 19:00+08');
  perform public.add_signups(v_q, '[{"name":"Ana","skill":"beginner"},{"name":"Ben","skill":"beginner"},{"name":"Cy","skill":"beginner"},{"name":"Dan","skill":"beginner"},{"name":"Eve","skill":"beginner"}]');
  -- Ana, Dan and Eve came; Ben and Cy are late.
  r := public.start_session(v_q, array(select id from public.signups where queue_id = v_q and name in ('Ana', 'Dan', 'Eve')));
  insert into results(check_name, value) values ('start (expect added 3, late 2)', r::text);
  insert into results(check_name, value) values ('order: came first, late last; late on break + pending',
    (select string_agg(name || ':' || queue_position || (case when is_paused then ' break' else '' end) || (case when court_fee_pending then ' pending' else '' end), ', ' order by queue_position)
     from public.players where queue_id = v_q and removed_at is null));
  insert into results(check_name, value) values ('billed at start (expect Ana, Dan, Eve only)',
    (select string_agg(player_name || ' ' || amount, ', ' order by player_name) from public.ledger_entries where queue_id = v_q));
  insert into results(check_name, value) values ('sign-ups all arrived + linked (expect 5/5)',
    (select count(*) filter (where status = 'arrived' and player_id is not null) || '/' || count(*) from public.signups where queue_id = v_q));

  v_ben := (select id from public.players where queue_id = v_q and name = 'Ben');
  v_cy := (select id from public.players where queue_id = v_q and name = 'Cy');
  v_ana := (select id from public.players where queue_id = v_q and name = 'Ana');

  -- Ben arrives: Mark Ready bills him.
  perform public.set_player_paused(v_q, v_ben, false);
  insert into results(check_name, value) values ('Ben marked Ready (expect billed 50, not paused, not pending)',
    (select string_agg(amount || ' "' || note || '"', ', ') from public.ledger_entries where player_id = v_ben)
    || ' | ' || (select is_paused || ' ' || court_fee_pending from public.players where id = v_ben));
  -- Break + back again: no second charge.
  perform public.set_player_paused(v_q, v_ben, true);
  perform public.set_player_paused(v_q, v_ben, false);
  insert into results(check_name, value) values ('Ben break + Ready again (expect 1 charge)', (select count(*) from public.ledger_entries where player_id = v_ben)::text);
  -- Ana (came on time) takes a break and comes back: never billed twice.
  perform public.set_player_paused(v_q, v_ana, true);
  perform public.set_player_paused(v_q, v_ana, false);
  insert into results(check_name, value) values ('Ana break + Ready (expect 1 charge)', (select count(*) from public.ledger_entries where player_id = v_ana)::text);

  -- Cy never comes: removed, nothing billed.
  perform public.remove_player(v_q, v_cy);
  insert into results(check_name, value) values ('Cy removed without coming (expect 0 charges, balance 0)',
    (select count(*) from public.ledger_entries where player_id = v_cy) || ' / ' || (select balance from public.player_balances where player_id = v_cy));
end $d$;

-- Fake: Dan is late (on break, fee waiting). Admin only.
reset role;
update public.players set is_paused = true, court_fee_pending = true
where queue_id = (select q from ids where name = 'paid') and name = 'Dan';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}', true);
do $d$
declare v_q uuid := (select ids.q from ids where ids.name = 'paid');
  v_dan bigint := (select id from public.players where queue_id = (select ids.q from ids where ids.name = 'paid') and name = 'Dan');
begin
  -- Reset matchmaking keeps a late arrival on break when not asked; bills when returned to Ready.
  perform public.reset_matchmaking(v_q, false);
  insert into results(check_name, value) values ('reset without "on break" (expect still break + pending, 1 charge)',
    (select is_paused || ' ' || court_fee_pending from public.players where id = v_dan) || ' | ' || (select count(*) from public.ledger_entries where player_id = v_dan));
  perform public.reset_matchmaking(v_q, true);
  insert into results(check_name, value) values ('reset with "on break" (expect false false, billed: 2 charges)',
    (select is_paused || ' ' || court_fee_pending from public.players where id = v_dan) || ' | ' || (select count(*) from public.ledger_entries where player_id = v_dan));
end $d$;

-- Fake: Eve is late. Admin only.
reset role;
update public.players set is_paused = true, court_fee_pending = true
where queue_id = (select q from ids where name = 'paid') and name = 'Eve';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}', true);
do $d$
declare v_q uuid := (select ids.q from ids where ids.name = 'paid'); v_f uuid := (select ids.q from ids where ids.name = 'free'); r jsonb;
begin
  -- Fee changed before a late one arrives: billed the fee at arrival.
  perform public.update_queue_settings(v_q, null, 70, null, null);
  perform public.set_player_paused(v_q, (select id from public.players where queue_id = v_q and name = 'Eve'), false);
  insert into results(check_name, value) values ('fee changed to 70 before arriving (expect 50, 70)',
    (select string_agg(amount::text, ', ' order by id) from public.ledger_entries where player_name = 'Eve' and queue_id = v_q));

  -- Free queue: late one is not pending; Ready bills nothing.
  perform public.set_queue_plan(v_f, '2026-10-25 19:00+08');
  perform public.add_signups(v_f, '[{"name":"Gil","skill":"beginner"}]');
  r := public.start_session(v_f, '{}');
  insert into results(check_name, value) values ('free queue start (expect late 1, not pending)',
    r::text || ' | ' || (select is_paused || ' ' || court_fee_pending from public.players where queue_id = v_f and name = 'Gil'));
  perform public.set_player_paused(v_f, (select id from public.players where queue_id = v_f and name = 'Gil'), false);
  insert into results(check_name, value) values ('free queue Ready (expect 0 rows)', (select count(*) from public.ledger_entries where queue_id = v_f)::text);
end $d$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $d$
begin
  begin perform private.bill_pending_court_fee(null::public.players, 50); insert into results(check_name, value) values ('anon calls private helper', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('anon calls private helper (expect refused)', sqlerrm); end;
  begin perform public.start_session((select ids.q from ids where ids.name = 'paid'), '{}'); insert into results(check_name, value) values ('anon start_session', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('anon start_session (expect refused)', sqlerrm); end;
end $d$;

reset role;
do $$
declare v_report text;
begin
  select string_agg(n || '. ' || check_name || ' => ' || value, E'\n' order by n) into v_report from results;
  raise exception E'DRY RUN RESULTS (nothing was saved):\n%', v_report;
end $$;