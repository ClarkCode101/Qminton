-- DRY RUN for supabase/migrations/20261024120000_billing.sql (step 10).
-- Safe to run in the Supabase SQL Editor: everything happens inside one
-- transaction that ends with an error on purpose, so nothing is saved (fake
-- users, queues, players and the new functions all disappear afterwards).
-- The error message lists one line per check; "ALLOWED (bad)" means a problem.
-- It contains an exact copy of the migration, followed by the tests.

begin;

-- Step 10: billing (payments, bulk payment, undo payment, adjustments, shared fees).
--
-- Same rules and messages as the old backend (OrcaRally backend/main.py), with these fixes:
--   * Every change locks the queue row first (old bug #1).
--   * Removed players can still pay, be undone or adjusted, so an old debt can be
--     settled (old bug #2: the old app had no way to reach them).
--   * Amounts are whole pesos up to 100,000 (one entry or one shared fee); notes are
--     max 300 characters, references max 80, with readable errors.

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

-- Any player of this queue, including removed ones (billing must still reach them).
create function private.get_queue_player(p_queue_id uuid, p_player_id bigint)
returns public.players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.players;
begin
  select * into v_player
  from public.players
  where queue_id = p_queue_id and id = p_player_id;

  if not found then
    raise exception 'Player not found' using errcode = 'P0001';
  end if;

  return v_player;
end;
$$;

-- Old _outstanding_balance_for_player: billed minus paid.
create function private.player_outstanding(p_queue_id uuid, p_player_id bigint)
returns integer
language sql
security definer
set search_path = ''
as $$
  select (
    coalesce(sum(amount) filter (where entry_type <> 'payment'), 0)
    - coalesce(sum(amount) filter (where entry_type = 'payment'), 0)
  )::integer
  from public.ledger_entries
  where queue_id = p_queue_id and player_id = p_player_id;
$$;

-- Old _normalize_optional_text: trimmed, or null when blank.
create function private.optional_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(p_value), '');
$$;

create function private.check_billing_amount(p_amount integer)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_amount is not null and abs(p_amount) > 100000 then
    raise exception 'Amount must be 100,000 or less' using errcode = 'P0001';
  end if;
end;
$$;

create function private.check_billing_note(p_note text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if char_length(p_note) > 300 then
    raise exception 'Note must be 300 characters or less' using errcode = 'P0001';
  end if;
end;
$$;

-- Old _create_payment_entry. p_amount null = pay the whole outstanding balance.
-- The queue must already be locked by the caller.
create function private.insert_payment(
  p_queue_id uuid,
  p_player public.players,
  p_amount integer,
  p_note text,
  p_payment_method public.payment_method,
  p_payment_reference text
)
returns public.ledger_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outstanding integer;
  v_amount integer;
  v_reference text := private.optional_text(p_payment_reference);
  v_entry public.ledger_entries;
begin
  v_outstanding := private.player_outstanding(p_queue_id, p_player.id);
  if v_outstanding <= 0 then
    raise exception 'Player has no unpaid balance' using errcode = 'P0001';
  end if;

  v_amount := coalesce(p_amount, v_outstanding);
  if v_amount <= 0 then
    raise exception 'Payment amount must be greater than zero' using errcode = 'P0001';
  end if;
  if v_amount > v_outstanding then
    raise exception 'Payment amount exceeds remaining balance' using errcode = 'P0001';
  end if;

  perform private.check_billing_note(private.optional_text(p_note));
  if char_length(v_reference) > 80 then
    raise exception 'Reference must be 80 characters or less' using errcode = 'P0001';
  end if;

  insert into public.ledger_entries (
    queue_id, player_id, player_name, amount, entry_type, note, payment_method, payment_reference
  )
  values (
    p_queue_id, p_player.id, p_player.name, v_amount, 'payment',
    coalesce(
      private.optional_text(p_note),
      case when v_amount = v_outstanding then 'Marked as paid' else 'Partial payment' end
    ),
    p_payment_method, v_reference
  )
  returning * into v_entry;

  return v_entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_payment: "Mark paid" (no amount) and "Partial payment" (amount)
-- ---------------------------------------------------------------------------
create function public.record_payment(
  p_queue_id uuid,
  p_player_id bigint,
  p_amount integer default null,
  p_note text default null,
  p_payment_method public.payment_method default null,
  p_payment_reference text default null
)
returns public.ledger_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.ledger_entries;
begin
  perform private.lock_owned_queue(p_queue_id);
  v_entry := private.insert_payment(
    p_queue_id, private.get_queue_player(p_queue_id, p_player_id),
    p_amount, p_note, p_payment_method, p_payment_reference
  );
  perform private.touch_queue(p_queue_id);
  return v_entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_bulk_payment: "Mark selected paid" (each player pays in full)
-- ---------------------------------------------------------------------------
-- All players are checked first, so one bad player means nothing is saved.
create function public.record_bulk_payment(
  p_queue_id uuid,
  p_player_ids bigint[],
  p_note text default null,
  p_payment_method public.payment_method default null,
  p_payment_reference text default null
)
returns setof public.ledger_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_ids bigint[];
  v_player_id bigint;
  v_player public.players;
begin
  perform private.lock_owned_queue(p_queue_id);

  -- Old dict.fromkeys: drop repeats, keep the first-seen order.
  select coalesce(array_agg(id order by first_index), '{}') into v_player_ids
  from (
    select id, min(pos) as first_index
    from unnest(coalesce(p_player_ids, '{}')) with ordinality as t(id, pos)
    where id is not null
    group by id
  ) unique_ids;

  if cardinality(v_player_ids) = 0 then
    raise exception 'Select at least one player' using errcode = 'P0001';
  end if;

  foreach v_player_id in array v_player_ids loop
    v_player := private.get_queue_player(p_queue_id, v_player_id);
    if private.player_outstanding(p_queue_id, v_player_id) <= 0 then
      raise exception '% has no unpaid balance', v_player.name using errcode = 'P0001';
    end if;
  end loop;

  foreach v_player_id in array v_player_ids loop
    return next private.insert_payment(
      p_queue_id, private.get_queue_player(p_queue_id, v_player_id),
      null, p_note, p_payment_method, p_payment_reference
    );
  end loop;

  perform private.touch_queue(p_queue_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- reverse_latest_payment: "Undo"
-- ---------------------------------------------------------------------------
-- Old _latest_reversible_payment_entry: walk payments oldest first; a positive
-- payment is pushed, a negative one (an earlier undo) pops the last. The top of
-- the stack is undone by adding the same amount as a negative payment.
create function public.reverse_latest_payment(p_queue_id uuid, p_player_id bigint)
returns public.ledger_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.players;
  v_open bigint[] := '{}';
  v_payment public.ledger_entries;
  v_latest public.ledger_entries;
  v_entry public.ledger_entries;
begin
  perform private.lock_owned_queue(p_queue_id);
  v_player := private.get_queue_player(p_queue_id, p_player_id);

  for v_payment in
    select * from public.ledger_entries
    where queue_id = p_queue_id and player_id = p_player_id and entry_type = 'payment'
    order by id
  loop
    if v_payment.amount > 0 then
      v_open := v_open || v_payment.id;
    elsif cardinality(v_open) > 0 then
      v_open := v_open[1:cardinality(v_open) - 1];
    end if;
  end loop;

  if cardinality(v_open) = 0 then
    raise exception 'Player has no payment to reverse' using errcode = 'P0001';
  end if;

  select * into v_latest from public.ledger_entries where id = v_open[cardinality(v_open)];

  insert into public.ledger_entries (queue_id, player_id, player_name, amount, entry_type, note)
  values (
    p_queue_id, v_player.id, v_player.name, -v_latest.amount, 'payment',
    left('Reversed payment: ' || v_latest.note, 300)
  )
  returning * into v_entry;

  perform private.touch_queue(p_queue_id);
  return v_entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- add_adjustment: one-player charge (+) or refund/correction (-)
-- ---------------------------------------------------------------------------
create function public.add_adjustment(p_queue_id uuid, p_player_id bigint, p_amount integer, p_note text)
returns public.ledger_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.players;
  v_note text := btrim(coalesce(p_note, ''));
  v_entry public.ledger_entries;
begin
  perform private.lock_owned_queue(p_queue_id);
  v_player := private.get_queue_player(p_queue_id, p_player_id);

  if v_note = '' then
    raise exception 'Adjustment note is required' using errcode = 'P0001';
  end if;
  perform private.check_billing_note(v_note);
  if coalesce(p_amount, 0) = 0 then
    raise exception 'Adjustment amount must not be zero' using errcode = 'P0001';
  end if;
  perform private.check_billing_amount(p_amount);

  insert into public.ledger_entries (queue_id, player_id, player_name, amount, entry_type, note)
  values (p_queue_id, v_player.id, v_player.name, p_amount, 'adjustment', v_note)
  returning * into v_entry;

  perform private.touch_queue(p_queue_id);
  return v_entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- add_shared_fee: split one amount evenly; leftover pesos go to the first players
-- ---------------------------------------------------------------------------
-- Old _split_amount_evenly: 100 over 3 players = 34, 33, 33. Shares of 0 are
-- skipped (old _record_ledger_entry skipped zero amounts).
create function public.add_shared_fee(p_queue_id uuid, p_player_ids bigint[], p_total_amount integer, p_note text)
returns setof public.ledger_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_ids bigint[];
  v_note text := btrim(coalesce(p_note, ''));
  v_player public.players;
  v_parts integer;
  v_sign integer;
  v_base integer;
  v_remainder integer;
  v_share integer;
  v_added integer := 0;
  v_entry public.ledger_entries;
begin
  perform private.lock_owned_queue(p_queue_id);

  select coalesce(array_agg(id order by first_index), '{}') into v_player_ids
  from (
    select id, min(pos) as first_index
    from unnest(coalesce(p_player_ids, '{}')) with ordinality as t(id, pos)
    where id is not null
    group by id
  ) unique_ids;

  if cardinality(v_player_ids) = 0 then
    raise exception 'Select at least one player' using errcode = 'P0001';
  end if;
  if v_note = '' then
    raise exception 'Shared fee note is required' using errcode = 'P0001';
  end if;
  perform private.check_billing_note(v_note);
  if coalesce(p_total_amount, 0) = 0 then
    raise exception 'Shared fee amount must not be zero' using errcode = 'P0001';
  end if;
  perform private.check_billing_amount(p_total_amount);

  -- Check every player before writing anything.
  for v_index in 1..cardinality(v_player_ids) loop
    perform private.get_queue_player(p_queue_id, v_player_ids[v_index]);
  end loop;

  v_parts := cardinality(v_player_ids);
  v_sign := case when p_total_amount >= 0 then 1 else -1 end;
  v_base := abs(p_total_amount) / v_parts;
  v_remainder := abs(p_total_amount) % v_parts;

  for v_index in 1..v_parts loop
    v_share := v_sign * (v_base + case when v_index <= v_remainder then 1 else 0 end);
    continue when v_share = 0;

    v_player := private.get_queue_player(p_queue_id, v_player_ids[v_index]);
    insert into public.ledger_entries (queue_id, player_id, player_name, amount, entry_type, note)
    values (p_queue_id, v_player.id, v_player.name, v_share, 'adjustment', v_note)
    returning * into v_entry;
    v_added := v_added + 1;
    return next v_entry;
  end loop;

  if v_added = 0 then
    raise exception 'Shared fee amount is too small to split across selected players' using errcode = 'P0001';
  end if;

  perform private.touch_queue(p_queue_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.record_payment(uuid, bigint, integer, text, public.payment_method, text) from public, anon;
revoke all on function public.record_bulk_payment(uuid, bigint[], text, public.payment_method, text) from public, anon;
revoke all on function public.reverse_latest_payment(uuid, bigint) from public, anon;
revoke all on function public.add_adjustment(uuid, bigint, integer, text) from public, anon;
revoke all on function public.add_shared_fee(uuid, bigint[], integer, text) from public, anon;
grant execute on function public.record_payment(uuid, bigint, integer, text, public.payment_method, text) to authenticated;
grant execute on function public.record_bulk_payment(uuid, bigint[], text, public.payment_method, text) to authenticated;
grant execute on function public.reverse_latest_payment(uuid, bigint) to authenticated;
grant execute on function public.add_adjustment(uuid, bigint, integer, text) to authenticated;
grant execute on function public.add_shared_fee(uuid, bigint[], integer, text) to authenticated;

-- ===================== TESTS =====================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'b-test-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000000b2', 'b-test-b@example.invalid');
create temp table results (n serial, check_name text, value text) on commit drop;
grant all on results to authenticated, anon; grant all on sequence results_n_seq to authenticated, anon;
create temp table ids (name text, q uuid) on commit drop; grant all on ids to authenticated;
create function pg_temp.pid(q uuid, n text) returns bigint language sql as $f$ select id from public.players where queue_id = q and name = n $f$;
create function pg_temp.bal(q uuid, n text) returns text language sql as $f$
  select 'billed ' || billed_total || ' paid ' || paid_total || ' due ' || balance from public.player_balances where queue_id = q and name = n $f$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

-- Court fee 100, so each player starts owing 100.
insert into ids select 'bill', public.create_queue('Bill', 'doubles', 100, 30);
select count(*) from public.add_players((select q from ids where name='bill'),
 '[{"name":"Ava","skill":"beginner"},{"name":"Bea","skill":"beginner"},{"name":"Cara","skill":"beginner"},{"name":"Dana","skill":"beginner"}]');

do $d$
declare q uuid := (select q from ids where name='bill'); e public.ledger_entries; v0 bigint; c int;
begin
  -- Partial then full payment, with method + reference.
  e := public.record_payment(q, pg_temp.pid(q,'Ava'), 40, 'Partial payment', 'gcash', '  REF-1  ');
  insert into results(check_name, value) values ('partial', e.amount || ' | ' || e.note || ' | ' || e.payment_method || ' | "' || e.payment_reference || '"');
  begin perform public.record_payment(q, pg_temp.pid(q,'Ava'), 61); insert into results(check_name, value) values ('overpay', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('overpay', sqlerrm); end;
  begin perform public.record_payment(q, pg_temp.pid(q,'Ava'), 0); insert into results(check_name, value) values ('zero pay', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('zero pay', sqlerrm); end;
  e := public.record_payment(q, pg_temp.pid(q,'Ava'), null, null, 'cash', '');
  insert into results(check_name, value) values ('mark paid (expect 60, Marked as paid, no ref)', e.amount || ' | ' || e.note || ' | ref null=' || (e.payment_reference is null));
  insert into results(check_name, value) values ('Ava balance', pg_temp.bal(q,'Ava'));
  begin perform public.record_payment(q, pg_temp.pid(q,'Ava')); insert into results(check_name, value) values ('pay when cleared', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('pay when cleared', sqlerrm); end;

  -- Undo = stack: undo the 60, then the 40, then nothing left.
  e := public.reverse_latest_payment(q, pg_temp.pid(q,'Ava'));
  insert into results(check_name, value) values ('undo 1', e.amount || ' | ' || e.note);
  e := public.reverse_latest_payment(q, pg_temp.pid(q,'Ava'));
  insert into results(check_name, value) values ('undo 2', e.amount || ' | ' || e.note);
  begin perform public.reverse_latest_payment(q, pg_temp.pid(q,'Ava')); insert into results(check_name, value) values ('undo 3', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('undo 3', sqlerrm); end;
  insert into results(check_name, value) values ('Ava after undos', pg_temp.bal(q,'Ava'));

  -- Bulk payment: one cleared player stops everything.
  perform public.record_payment(q, pg_temp.pid(q,'Dana'));
  v0 := (select version from public.queues where id = q);
  begin perform public.record_bulk_payment(q, array[pg_temp.pid(q,'Bea'), pg_temp.pid(q,'Dana')]); insert into results(check_name, value) values ('bulk with cleared', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('bulk with cleared', sqlerrm); end;
  insert into results(check_name, value) values ('Bea untouched after failed bulk', pg_temp.bal(q,'Bea'));
  select count(*) into c from public.record_bulk_payment(q, array[pg_temp.pid(q,'Bea'), pg_temp.pid(q,'Cara'), pg_temp.pid(q,'Bea')], null, 'maya', 'B-9');
  insert into results(check_name, value) values ('bulk Bea+Cara (+dup) entries (expect 2)', c::text);
  insert into results(check_name, value) select 'bulk notes', string_agg(player_name || ':' || amount || ':' || note || ':' || payment_method || ':' || payment_reference, ', ' order by id)
    from public.ledger_entries where queue_id = q and entry_type = 'payment' and payment_reference = 'B-9';
  begin perform public.record_bulk_payment(q, '{}'); insert into results(check_name, value) values ('bulk empty', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('bulk empty', sqlerrm); end;
  insert into results(check_name, value) values ('version bumped', ((select version from public.queues where id = q) > v0)::text);

  -- Adjustments.
  e := public.add_adjustment(q, pg_temp.pid(q,'Bea'), -20, '  Refund  ');
  insert into results(check_name, value) values ('adjustment', e.amount || ' | "' || e.note || '" | ' || pg_temp.bal(q,'Bea'));
  begin perform public.add_adjustment(q, pg_temp.pid(q,'Bea'), 10, '  '); insert into results(check_name, value) values ('adj no note', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('adj no note', sqlerrm); end;
  begin perform public.add_adjustment(q, pg_temp.pid(q,'Bea'), 0, 'x'); insert into results(check_name, value) values ('adj zero', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('adj zero', sqlerrm); end;
  begin perform public.add_adjustment(q, pg_temp.pid(q,'Bea'), 100001, 'x'); insert into results(check_name, value) values ('adj too big', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('adj too big', sqlerrm); end;
  begin perform public.add_adjustment(q, pg_temp.pid(q,'Bea'), 5, repeat('x', 301)); insert into results(check_name, value) values ('adj long note', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('adj long note', sqlerrm); end;
  begin perform public.record_payment(q, pg_temp.pid(q,'Ava'), 10, null, 'cash', repeat('r', 81)); insert into results(check_name, value) values ('long reference', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('long reference', sqlerrm); end;

  -- Shared fee: 100 over 3 = 34, 33, 33 (leftover to the first); -10 over 3 = -4, -3, -3.
  select count(*) into c from public.add_shared_fee(q, array[pg_temp.pid(q,'Ava'), pg_temp.pid(q,'Bea'), pg_temp.pid(q,'Cara')], 100, 'Shuttle tube');
  insert into results(check_name, value) select 'shared 100/3', string_agg(player_name || ':' || amount, ', ' order by id) from public.ledger_entries where queue_id = q and note = 'Shuttle tube';
  perform public.add_shared_fee(q, array[pg_temp.pid(q,'Ava'), pg_temp.pid(q,'Bea'), pg_temp.pid(q,'Cara')], -10, 'Discount');
  insert into results(check_name, value) select 'shared -10/3', string_agg(player_name || ':' || amount, ', ' order by id) from public.ledger_entries where queue_id = q and note = 'Discount';
  select count(*) into c from public.add_shared_fee(q, array[pg_temp.pid(q,'Ava'), pg_temp.pid(q,'Bea'), pg_temp.pid(q,'Cara')], 2, 'Tiny');
  insert into results(check_name, value) values ('shared 2/3 entries (expect 2)', c::text);
  begin perform public.add_shared_fee(q, '{}', 100, 'x'); insert into results(check_name, value) values ('shared none', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('shared none', sqlerrm); end;
  begin perform public.add_shared_fee(q, array[pg_temp.pid(q,'Ava')], 100, ' '); insert into results(check_name, value) values ('shared no note', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('shared no note', sqlerrm); end;
  begin perform public.add_shared_fee(q, array[pg_temp.pid(q,'Ava')], 0, 'x'); insert into results(check_name, value) values ('shared zero', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('shared zero', sqlerrm); end;
  begin perform public.add_shared_fee(q, array[pg_temp.pid(q,'Ava'), 999999999], 100, 'x'); insert into results(check_name, value) values ('shared unknown player', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('shared unknown player', sqlerrm); end;

  -- Removed player can still settle the debt (old bug #2).
  perform public.remove_player(q, pg_temp.pid(q,'Cara'));
  perform public.add_adjustment(q, pg_temp.pid(q,'Cara'), 15, 'Late fee');
  e := public.record_payment(q, pg_temp.pid(q,'Cara'));
  insert into results(check_name, value) values ('removed player pays', e.amount || ' | ' || pg_temp.bal(q,'Cara'));
end $d$;

-- Another organizer can't touch this queue.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
do $d$
declare q uuid := (select q from ids where name='bill');
begin
  begin perform public.record_payment(q, pg_temp.pid(q,'Bea'), 1); insert into results(check_name, value) values ('other owner pays', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('other owner pays', sqlerrm); end;
  begin perform public.add_adjustment(q, pg_temp.pid(q,'Bea'), 1, 'x'); insert into results(check_name, value) values ('other owner adjusts', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('other owner adjusts', sqlerrm); end;
end $d$;

-- Not logged in at all.
reset role;
set local role anon;
do $d$
begin
  begin perform public.reverse_latest_payment(gen_random_uuid(), 1); insert into results(check_name, value) values ('anon undo', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('anon undo', sqlerrm); end;
end $d$;
reset role;

-- Show the results as an error message. The error also undoes the whole
-- transaction, so nothing above is saved.
do $$
declare v_report text;
begin
  select string_agg(n || '. ' || check_name || ' => ' || value, E'\n' order by n) into v_report from results;
  raise exception E'DRY RUN RESULTS (nothing was saved):\n%', v_report;
end $$;
