-- DRY RUN for supabase/migrations/20261026120000_self_check_in.sql (player self check-in by QR).
-- Safe to run in the Supabase SQL Editor: everything happens inside one
-- transaction that ends with an error on purpose, so nothing is saved.
-- The error message lists one line per check; "ALLOWED (bad)" means a problem.
-- It contains an exact copy of the migration, followed by the tests.

begin;

-- Player self check-in by QR (owner's request, 2026-10-20). New feature.
--
-- The organizer shows a "Check-in QR" (from Add Players). A player scans it,
-- types their name and skill on their own phone (no login) and is added to the
-- queue right away, billed the court fee like any added player.
--
-- Safety:
--   * The QR holds a separate random code (check_ins.token), NOT the queue id,
--     so the public display link can't be used to add players.
--   * Check-in is closed by default; the organizer opens and closes it.
--   * "New code" makes old QR codes stop working.
--   * Same rules as adding a player: name 1–40 characters, no duplicate names
--     (case-insensitive), at most 150 players in the queue.
--   * Anonymous visitors get no table access: only the two functions below.

-- ---------------------------------------------------------------------------
-- check_ins: one row per queue (created the first time the organizer opens it)
-- ---------------------------------------------------------------------------
create table public.check_ins (
  queue_id uuid primary key references public.queues (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  is_open boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.check_ins enable row level security;

create policy "Owners can read check-in of their queues"
  on public.check_ins for select to authenticated
  using (queue_id in (select id from public.queues where owner_id = (select auth.uid())));

revoke all on public.check_ins from anon, authenticated;
grant select on public.check_ins to authenticated;

-- ---------------------------------------------------------------------------
-- set_check_in (organizer): read / open / close / new code
-- ---------------------------------------------------------------------------
-- p_open null = leave as is; p_new_code true = replace the code (old QR stops working).
-- Returns the check-in row (creating it, closed, the first time).
create function public.set_check_in(p_queue_id uuid, p_open boolean default null, p_new_code boolean default false)
returns public.check_ins
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.check_ins;
  v_changed boolean := false;
begin
  perform private.lock_owned_queue(p_queue_id);

  insert into public.check_ins (queue_id) values (p_queue_id)
  on conflict (queue_id) do nothing;

  select * into v_row from public.check_ins where queue_id = p_queue_id;

  if p_open is not null and p_open is distinct from v_row.is_open then
    v_changed := true;
  end if;
  if coalesce(p_new_code, false) then
    v_changed := true;
  end if;

  if v_changed then
    update public.check_ins
    set is_open = coalesce(p_open, is_open),
        token = case when coalesce(p_new_code, false) then gen_random_uuid() else token end,
        updated_at = now()
    where queue_id = p_queue_id
    returning * into v_row;
    perform private.touch_queue(p_queue_id);
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_check_in (public): what the check-in page shows before joining
-- ---------------------------------------------------------------------------
-- Returns null for an unknown (or replaced) code.
create function public.get_check_in(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'queue_id', q.id,
    'queue_name', q.name,
    'game_mode', q.game_mode,
    'is_open', c.is_open
  )
  from public.check_ins c
  join public.queues q on q.id = c.queue_id
  where c.token = p_token;
$$;

-- ---------------------------------------------------------------------------
-- check_in (public): a player adds themselves
-- ---------------------------------------------------------------------------
-- Returns {name, position, queue_id}. position = their spot in line (1-based).
create function public.check_in(p_token uuid, p_name text, p_skill public.skill_level)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_check_in public.check_ins;
  v_queue public.queues;
  v_name text := btrim(coalesce(p_name, ''));
  v_position integer;
  v_player public.players;
begin
  select * into v_check_in from public.check_ins where token = p_token;
  if not found then
    raise exception 'This check-in code is no longer valid. Please scan the new QR code.' using errcode = 'P0001';
  end if;

  -- Same lock as every other change to this queue (old bug #1).
  select * into v_queue from public.queues where id = v_check_in.queue_id for update;

  -- Re-read under the lock: the organizer may have just closed it.
  select * into v_check_in from public.check_ins where queue_id = v_queue.id;
  if not v_check_in.is_open or v_check_in.token is distinct from p_token then
    raise exception 'Check-in is closed. Please ask the organizer.' using errcode = 'P0001';
  end if;

  if v_name = '' then
    raise exception 'Please enter your name' using errcode = 'P0001';
  end if;
  if char_length(v_name) > 40 then
    raise exception 'Name must be 40 characters or less' using errcode = 'P0001';
  end if;
  if p_skill is null then
    raise exception 'Please pick your skill level' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.players
    where queue_id = v_queue.id and removed_at is null and lower(name) = lower(v_name)
  ) then
    raise exception 'That name is already in the queue. Add your last name or a nickname.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.players where queue_id = v_queue.id and removed_at is null) >= 150 then
    raise exception 'This queue is full. Please ask the organizer.' using errcode = 'P0001';
  end if;

  select coalesce(max(queue_position) + 1, 0) into v_position
  from public.players
  where queue_id = v_queue.id and removed_at is null;

  insert into public.players (queue_id, name, skill, queue_position)
  values (v_queue.id, v_name, p_skill, v_position)
  returning * into v_player;

  -- Billed like a player the organizer adds (old _record_ledger_entry skipped 0).
  if v_queue.court_fee > 0 then
    insert into public.ledger_entries (queue_id, player_id, player_name, amount, entry_type, note)
    values (v_queue.id, v_player.id, v_player.name, v_queue.court_fee, 'court_fee', 'Initial court fee');
  end if;

  -- Bumps the version, so the organizer's screen updates live.
  perform private.touch_queue(v_queue.id);

  return jsonb_build_object('name', v_player.name, 'position', v_position + 1, 'queue_id', v_queue.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
revoke all on function public.set_check_in(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_check_in(uuid, boolean, boolean) to authenticated;
revoke all on function public.get_check_in(uuid) from public;
grant execute on function public.get_check_in(uuid) to anon, authenticated;
revoke all on function public.check_in(uuid, text, public.skill_level) from public;
grant execute on function public.check_in(uuid, text, public.skill_level) to anon, authenticated;

-- ===================== TESTS =====================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'c-test-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000000c2', 'c-test-b@example.invalid');
create temp table results (n serial, check_name text, value text) on commit drop;
grant all on results to authenticated, anon; grant all on sequence results_n_seq to authenticated, anon;
create temp table ids (name text, q uuid, t uuid) on commit drop; grant all on ids to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into ids (name, q) select 'cq', public.create_queue('Check-in Test', 'doubles', 50, 20);
select count(*) from public.add_players((select q from ids where name='cq'), '[{"name":"Juan","skill":"beginner"}]');
do $d$
declare q uuid := (select q from ids where name='cq'); r public.check_ins;
begin
  r := public.set_check_in(q);
  insert into results(check_name, value) values ('first read: created closed', 'open=' || r.is_open || ' token set=' || (r.token is not null));
  update ids set t = r.token where name = 'cq';
end $d$;
reset role;

-- A player (no login) scans the QR while check-in is still closed.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $d$
declare t uuid := (select t from ids where name='cq'); i jsonb;
begin
  i := public.get_check_in(t);
  insert into results(check_name, value) values ('anon sees queue name + closed', (i->>'queue_name') || ' | open=' || (i->>'is_open'));
  begin perform public.check_in(t, 'Ana', 'beginner'); insert into results(check_name, value) values ('join while closed', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('join while closed', sqlerrm); end;
end $d$;
reset role;

-- Organizer opens check-in.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select public.set_check_in((select q from ids where name='cq'), p_open => true);
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $d$
declare t uuid := (select t from ids where name='cq'); r jsonb;
begin
  r := public.check_in(t, '  Ana  ', 'intermediate');
  insert into results(check_name, value) values ('Ana joins (expect position 2)', (r->>'name') || ' | #' || (r->>'position'));
  begin perform public.check_in(t, 'ANA', 'beginner'); insert into results(check_name, value) values ('duplicate name', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('duplicate name', sqlerrm); end;
  begin perform public.check_in(t, 'juan', 'beginner'); insert into results(check_name, value) values ('name of organizer-added player', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('name of organizer-added player', sqlerrm); end;
  begin perform public.check_in(t, '   ', 'beginner'); insert into results(check_name, value) values ('blank name', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('blank name', sqlerrm); end;
  begin perform public.check_in(t, repeat('x', 41), 'beginner'); insert into results(check_name, value) values ('long name', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('long name', sqlerrm); end;
  begin perform public.check_in(t, 'Ben', null); insert into results(check_name, value) values ('no skill', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('no skill', sqlerrm); end;
  begin perform public.check_in(gen_random_uuid(), 'Ben', 'beginner'); insert into results(check_name, value) values ('unknown code', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('unknown code', sqlerrm); end;
  begin perform count(*) from public.check_ins; insert into results(check_name, value) values ('anon reads check_ins table', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('anon reads check_ins table', sqlerrm); end;
  begin perform count(*) from public.players; insert into results(check_name, value) values ('anon reads players table', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('anon reads players table', sqlerrm); end;
  begin perform public.set_check_in((select q from ids where name='cq'), true); insert into results(check_name, value) values ('anon opens check-in', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('anon opens check-in', sqlerrm); end;
end $d$;
reset role;

-- What the organizer sees.
insert into results(check_name, value)
select 'Ana in queue', p.name || ' | ' || p.skill || ' | pos ' || p.queue_position from public.players p
where p.queue_id = (select q from ids where name='cq') and p.name = 'Ana';
insert into results(check_name, value)
select 'Ana billed court fee', coalesce(sum(amount), 0)::text from public.ledger_entries
where queue_id = (select q from ids where name='cq') and player_name = 'Ana' and entry_type = 'court_fee';

-- Other organizer can't touch it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
do $d$
begin
  begin perform public.set_check_in((select q from ids where name='cq'), false); insert into results(check_name, value) values ('other owner closes it', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('other owner closes it', sqlerrm); end;
  insert into results(check_name, value) select 'other owner sees check_ins rows (expect 0)', count(*)::text from public.check_ins;
end $d$;

-- Owner makes a new code: the old QR stops working.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $d$
declare q uuid := (select q from ids where name='cq'); old uuid := (select t from ids where name='cq'); r public.check_ins;
begin
  r := public.set_check_in(q, p_new_code => true);
  insert into results(check_name, value) values ('new code', 'changed=' || (r.token <> old) || ' still open=' || r.is_open);
  insert into results(check_name, value) values ('old code lookup (expect null)', coalesce(public.get_check_in(old)::text, 'null'));
  begin perform public.check_in(old, 'Ben', 'beginner'); insert into results(check_name, value) values ('join with old code', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('join with old code', sqlerrm); end;
  r := public.set_check_in(q, p_open => false);
  insert into results(check_name, value) values ('closed again', 'open=' || r.is_open);
end $d$;
reset role;

do $$
declare v_report text;
begin
  select string_agg(n || '. ' || check_name || ' => ' || value, E'\n' order by n) into v_report from results;
  raise exception E'DRY RUN RESULTS (nothing was saved):\n%', v_report;
end $$;
