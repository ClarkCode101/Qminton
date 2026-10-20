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
