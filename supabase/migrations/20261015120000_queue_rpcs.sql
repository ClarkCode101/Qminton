-- Step 4: create / delete queue.
--
-- Tables have no write policies, so the app changes data only through
-- functions like these. They run as the table owner (security definer) but
-- check auth.uid() themselves, so an organizer can only touch their own queues.
--
-- Errors meant for the organizer are raised with errcode 'P0001' and a plain
-- English message; the app shows that message as-is (see services/errors.ts).

create function public.create_queue(
  p_name text,
  p_game_mode public.game_mode,
  p_court_fee integer,
  p_game_rate integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_queue_id uuid;
begin
  if v_owner is null then
    raise exception 'Please log in again.' using errcode = 'P0001';
  end if;
  if v_name = '' then
    raise exception 'Queue name is required' using errcode = 'P0001';
  end if;
  if char_length(v_name) > 60 then
    raise exception 'Queue name must be 60 characters or less' using errcode = 'P0001';
  end if;
  -- Old bug #6: negative fees used to be accepted on create.
  if coalesce(p_court_fee, 0) < 0 or coalesce(p_game_rate, 0) < 0 then
    raise exception 'Billing values cannot be negative' using errcode = 'P0001';
  end if;

  -- court_count defaults to 2, like the old app.
  insert into public.queues (owner_id, name, game_mode, court_fee, game_rate)
  values (
    v_owner,
    v_name,
    coalesce(p_game_mode, 'doubles'),
    coalesce(p_court_fee, 0),
    coalesce(p_game_rate, 0)
  )
  returning id into v_queue_id;

  return v_queue_id;
end;
$$;

create function public.delete_queue(p_queue_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Please log in again.' using errcode = 'P0001';
  end if;

  -- Players, matches, ledger, etc. are removed by "on delete cascade".
  delete from public.queues
  where id = p_queue_id and owner_id = auth.uid();

  -- Same message whether it never existed or belongs to someone else, so
  -- nobody can probe other organizers' queue ids.
  if not found then
    raise exception 'Queue not found' using errcode = 'P0001';
  end if;
end;
$$;

-- Only logged-in users may call these (not anon, not "public").
revoke all on function public.create_queue(text, public.game_mode, integer, integer) from public, anon;
revoke all on function public.delete_queue(uuid) from public, anon;
grant execute on function public.create_queue(text, public.game_mode, integer, integer) to authenticated;
grant execute on function public.delete_queue(uuid) to authenticated;
