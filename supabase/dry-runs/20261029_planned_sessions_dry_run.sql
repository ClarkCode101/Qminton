-- DRY RUN for supabase/migrations/20261029120000_planned_sessions.sql (planned sessions + sign-up).
-- Safe to run in the SQL Editor: ends with an error on purpose, so nothing is saved.

begin;

-- Planned sessions with sign-up (owner's request 2026-10-21). New feature, part 1.
--
-- A queue can be "planned" before the games start. The organizer shares one
-- link / QR (the same code as QR check-in) in the group chat. People sign up
-- with their name and skill, see who else is going, and can cancel their own
-- spot. On the day, "Start session" asks who came: only they become players
-- (in sign-up order) and only they are billed the court fee. Then the queue is
-- "live" and works exactly as before.
--
-- Owner's choices:
--   * No charge while planned; the court fee is billed at Start, only for those who came.
--   * Cancel only from the phone that signed up: sign-up returns a secret code
--     that the phone keeps. Only a hash of it is stored here.
--   * Part 1 only (no slot limit / waitlist yet).
--
-- Safety: anonymous visitors get no table access, only the functions below.
-- The public list shows names only (no skill, no money).

-- ---------------------------------------------------------------------------
-- queues: status + planned date/time
-- ---------------------------------------------------------------------------
create type public.queue_status as enum ('planned', 'live');

alter table public.queues
  add column status public.queue_status not null default 'live',
  add column starts_at timestamptz;

-- ---------------------------------------------------------------------------
-- signups
-- ---------------------------------------------------------------------------
create type public.signup_status as enum ('going', 'cancelled', 'arrived', 'no_show');

create table public.signups (
  id bigint generated always as identity primary key,
  queue_id uuid not null references public.queues (id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 40),
  skill public.skill_level not null,
  status public.signup_status not null default 'going',
  -- sha256 (hex) of the secret code kept on the phone that signed up.
  cancel_code_hash text not null,
  -- Set at Start session for those who came.
  player_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Players are only soft-deleted; deleting the queue removes both tables.
  foreign key (queue_id, player_id) references public.players (queue_id, id)
);

-- One "Ana" per planned session (case-insensitive), among those still going.
create unique index signups_going_name_key
  on public.signups (queue_id, lower(name))
  where status = 'going';

create index signups_queue_order_idx on public.signups (queue_id, created_at, id);

alter table public.signups enable row level security;

create policy "Owners can read sign-ups of their queues"
  on public.signups for select to authenticated
  using (queue_id in (select id from public.queues where owner_id = (select auth.uid())));

revoke all on public.signups from anon, authenticated;
grant select on public.signups to authenticated;

-- Landing page / navbar: status, date and how many are going.
create or replace view public.queue_summaries
with (security_invoker = true) as
select
  q.id,
  q.name,
  q.game_mode,
  q.court_fee,
  q.game_rate,
  q.court_count,
  q.created_at,
  q.updated_at,
  (
    select count(*) from public.players p
    where p.queue_id = q.id and p.removed_at is null
  )::integer as player_count,
  (
    select coalesce(sum(l.amount), 0) from public.ledger_entries l
    where l.queue_id = q.id and l.entry_type <> 'payment'
  )::integer as total_billed,
  (
    select coalesce(sum(l.amount), 0) from public.ledger_entries l
    where l.queue_id = q.id and l.entry_type = 'payment'
  )::integer as total_collected,
  q.status,
  q.starts_at,
  (
    select count(*) from public.signups s
    where s.queue_id = q.id and s.status = 'going'
  )::integer as signup_count
from public.queues q;

create function private.code_hash(p_code uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_code::text, 'UTF8')), 'hex');
$$;

-- ---------------------------------------------------------------------------
-- set_queue_plan (organizer): make a fresh queue "planned", or change its date
-- ---------------------------------------------------------------------------
-- Sign-ups open automatically when a queue becomes planned.
create function public.set_queue_plan(p_queue_id uuid, p_starts_at timestamptz)
returns public.queues
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue public.queues;
begin
  v_queue := private.lock_owned_queue(p_queue_id);

  if p_starts_at is null then
    raise exception 'Please pick the date and time' using errcode = 'P0001';
  end if;

  if v_queue.status = 'live' then
    if exists (select 1 from public.players where queue_id = p_queue_id)
       or exists (select 1 from public.matches where queue_id = p_queue_id) then
      raise exception 'This session already started' using errcode = 'P0001';
    end if;

    insert into public.check_ins (queue_id, is_open) values (p_queue_id, true)
    on conflict (queue_id) do update set is_open = true, updated_at = now();
  end if;

  update public.queues
  set status = 'planned', starts_at = p_starts_at
  where id = p_queue_id;

  perform private.touch_queue(p_queue_id);
  select * into v_queue from public.queues where id = p_queue_id;
  return v_queue;
end;
$$;

-- ---------------------------------------------------------------------------
-- remove_signup (organizer): take someone off the list
-- ---------------------------------------------------------------------------
create function public.remove_signup(p_queue_id uuid, p_signup_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_owned_queue(p_queue_id);

  update public.signups
  set status = 'cancelled', updated_at = now()
  where id = p_signup_id and queue_id = p_queue_id and status = 'going';
  if not found then
    raise exception 'That sign-up is no longer on the list' using errcode = 'P0001';
  end if;

  perform private.touch_queue(p_queue_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- start_session (organizer): those who came become players; the queue goes live
-- ---------------------------------------------------------------------------
-- p_arrived = ids of the sign-ups who came. Everyone else still "going" becomes
-- "no_show". Players are added in sign-up order and billed the court fee
-- (same note as adding a player). Check-in is closed afterwards; the organizer
-- can open it again for walk-ins.
create function public.start_session(p_queue_id uuid, p_arrived bigint[])
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
  v_no_show integer;
begin
  v_queue := private.lock_owned_queue(p_queue_id);
  if v_queue.status <> 'planned' then
    raise exception 'This session already started' using errcode = 'P0001';
  end if;

  select coalesce(max(queue_position) + 1, 0) into v_position
  from public.players
  where queue_id = p_queue_id and removed_at is null;

  for v_signup in
    select * from public.signups
    where queue_id = p_queue_id and status = 'going' and id = any(coalesce(p_arrived, '{}'))
    order by created_at, id
  loop
    v_player_id := null;
    insert into public.players (queue_id, name, skill, queue_position)
    values (p_queue_id, v_signup.name, v_signup.skill, v_position)
    on conflict (queue_id, lower(name)) where removed_at is null do nothing
    returning id into v_player_id;

    if v_player_id is null then
      -- Already a player with that name: link to them, don't bill twice.
      select id into v_player_id from public.players
      where queue_id = p_queue_id and removed_at is null and lower(name) = lower(v_signup.name);
    else
      v_position := v_position + 1;
      v_added := v_added + 1;
      if v_queue.court_fee > 0 then
        insert into public.ledger_entries (queue_id, player_id, player_name, amount, entry_type, note)
        values (p_queue_id, v_player_id, v_signup.name, v_queue.court_fee, 'court_fee', 'Initial court fee');
      end if;
    end if;

    update public.signups
    set status = 'arrived', player_id = v_player_id, updated_at = now()
    where id = v_signup.id;
  end loop;

  update public.signups
  set status = 'no_show', updated_at = now()
  where queue_id = p_queue_id and status = 'going';
  get diagnostics v_no_show = row_count;

  update public.queues set status = 'live' where id = p_queue_id;
  update public.check_ins set is_open = false, updated_at = now() where queue_id = p_queue_id;

  perform private.touch_queue(p_queue_id);
  return jsonb_build_object('added', v_added, 'no_show', v_no_show);
end;
$$;

-- ---------------------------------------------------------------------------
-- get_signup (public): what the shared link shows
-- ---------------------------------------------------------------------------
-- Null for an unknown (or replaced) code. p_my_codes = the secret codes this
-- phone kept; "mine" lists which of those are still going (for "Cancel my spot").
create function public.get_signup(p_token uuid, p_my_codes uuid[] default null)
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
    'status', q.status,
    'starts_at', q.starts_at,
    'court_fee', q.court_fee,
    'game_rate', q.game_rate,
    'is_open', c.is_open,
    'going', case when q.status = 'planned' then coalesce((
      select jsonb_agg(s.name order by s.created_at, s.id)
      from public.signups s
      where s.queue_id = q.id and s.status = 'going'
    ), '[]'::jsonb) else '[]'::jsonb end,
    'mine', coalesce((
      select jsonb_agg(jsonb_build_object('code', m.code, 'name', s.name) order by s.created_at, s.id)
      from unnest(coalesce(p_my_codes, '{}')) as m(code)
      join public.signups s
        on s.queue_id = q.id and s.status = 'going' and s.cancel_code_hash = private.code_hash(m.code)
    ), '[]'::jsonb)
  )
  from public.check_ins c
  join public.queues q on q.id = c.queue_id
  where c.token = p_token;
$$;

-- ---------------------------------------------------------------------------
-- sign_up (public): add yourself to a planned session
-- ---------------------------------------------------------------------------
-- Returns {name, position, code}. The phone keeps "code" to cancel later.
create function public.sign_up(p_token uuid, p_name text, p_skill public.skill_level)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_check_in public.check_ins;
  v_queue public.queues;
  v_name text := btrim(coalesce(p_name, ''));
  v_code uuid := gen_random_uuid();
  v_signup public.signups;
begin
  select * into v_check_in from public.check_ins where token = p_token;
  if not found then
    raise exception 'This link is no longer valid. Please ask the organizer for the new one.' using errcode = 'P0001';
  end if;

  select * into v_queue from public.queues where id = v_check_in.queue_id for update;

  select * into v_check_in from public.check_ins where queue_id = v_queue.id;
  if v_check_in.token is distinct from p_token then
    raise exception 'This link is no longer valid. Please ask the organizer for the new one.' using errcode = 'P0001';
  end if;
  if v_queue.status <> 'planned' then
    raise exception 'The session already started. Please refresh the page.' using errcode = 'P0001';
  end if;
  if not v_check_in.is_open then
    raise exception 'Sign-ups are closed. Please ask the organizer.' using errcode = 'P0001';
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
    select 1 from public.signups
    where queue_id = v_queue.id and status = 'going' and lower(name) = lower(v_name)
  ) then
    raise exception 'That name is already on the list. Add your last name or a nickname.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.signups where queue_id = v_queue.id and status = 'going') >= 150 then
    raise exception 'The list is full. Please ask the organizer.' using errcode = 'P0001';
  end if;

  insert into public.signups (queue_id, name, skill, cancel_code_hash)
  values (v_queue.id, v_name, p_skill, private.code_hash(v_code))
  returning * into v_signup;

  -- Bumps the version, so the organizer's screen (and the shared page) update live.
  perform private.touch_queue(v_queue.id);

  return jsonb_build_object(
    'name', v_signup.name,
    'position', (select count(*) from public.signups where queue_id = v_queue.id and status = 'going'),
    'code', v_code
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_signup (public): cancel your own spot, with the code your phone kept
-- ---------------------------------------------------------------------------
create function public.cancel_signup(p_token uuid, p_code uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_check_in public.check_ins;
  v_queue public.queues;
  v_signup public.signups;
begin
  select * into v_check_in from public.check_ins where token = p_token;
  if not found then
    raise exception 'This link is no longer valid. Please ask the organizer.' using errcode = 'P0001';
  end if;

  select * into v_queue from public.queues where id = v_check_in.queue_id for update;
  if v_queue.status <> 'planned' then
    raise exception 'The session already started. Please tell the organizer.' using errcode = 'P0001';
  end if;

  update public.signups
  set status = 'cancelled', updated_at = now()
  where queue_id = v_queue.id and status = 'going' and cancel_code_hash = private.code_hash(p_code)
  returning * into v_signup;
  if not found then
    raise exception 'Your spot is no longer on the list.' using errcode = 'P0001';
  end if;

  perform private.touch_queue(v_queue.id);
  return jsonb_build_object('name', v_signup.name);
end;
$$;

-- ---------------------------------------------------------------------------
-- check_in: same as before, plus "not while planned" (sign-up is used then)
-- ---------------------------------------------------------------------------
create or replace function public.check_in(p_token uuid, p_name text, p_skill public.skill_level)
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

  -- Planned session: people sign up instead (they become players at Start).
  if v_queue.status = 'planned' then
    raise exception 'This session has not started yet. Please refresh the page to sign up.' using errcode = 'P0001';
  end if;

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
revoke all on function private.code_hash(uuid) from public, anon, authenticated;

revoke all on function public.set_queue_plan(uuid, timestamptz) from public, anon;
grant execute on function public.set_queue_plan(uuid, timestamptz) to authenticated;
revoke all on function public.remove_signup(uuid, bigint) from public, anon;
grant execute on function public.remove_signup(uuid, bigint) to authenticated;
revoke all on function public.start_session(uuid, bigint[]) from public, anon;
grant execute on function public.start_session(uuid, bigint[]) to authenticated;

revoke all on function public.get_signup(uuid, uuid[]) from public;
grant execute on function public.get_signup(uuid, uuid[]) to anon, authenticated;
revoke all on function public.sign_up(uuid, text, public.skill_level) from public;
grant execute on function public.sign_up(uuid, text, public.skill_level) to anon, authenticated;
revoke all on function public.cancel_signup(uuid, uuid) from public;
grant execute on function public.cancel_signup(uuid, uuid) to anon, authenticated;

-- ===================== TESTS =====================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'plan-a@example.invalid'),
  ('00000000-0000-0000-0000-0000000000b1', 'plan-b@example.invalid');
create temp table results (n serial, check_name text, value text) on commit drop;
grant all on results to anon, authenticated; grant all on sequence results_n_seq to anon, authenticated;
create temp table ids (name text, q uuid, t uuid, code uuid) on commit drop;
grant all on ids to anon, authenticated;

create function pg_temp.as_owner(who text) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', case who when 'a' then '00000000-0000-0000-0000-0000000000a1' else '00000000-0000-0000-0000-0000000000b1' end, 'role', 'authenticated')::text, true);
$f$;
grant execute on function pg_temp.as_owner(text) to anon, authenticated;

set local role authenticated;
select pg_temp.as_owner('a');
insert into ids (name, q) select 'plan', public.create_queue('Sat Open Play', 'doubles', 50, 20);
insert into ids (name, q) select 'empty', public.create_queue('Never planned', 'doubles', 0, 0);

do $d$
declare q uuid := (select ids.q from ids where name = 'plan'); r public.queues;
begin
  begin perform public.set_queue_plan(q, null); insert into results(check_name, value) values ('plan without date', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('plan without date (expect refused)', sqlerrm); end;
  r := public.set_queue_plan(q, '2026-10-25 19:00+08');
  insert into results(check_name, value) values ('planned', r.status || ' ' || to_char(r.starts_at at time zone 'Asia/Manila', 'Mon DD HH24:MI') || ' | sign-ups open=' || (select is_open from public.check_ins where queue_id = q));
  update ids set t = (select c.token from public.check_ins c where c.queue_id = ids.q) where ids.name = 'plan';
end $d$;

-- Anonymous visitors (the group chat link).
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $d$
declare t uuid := (select ids.t from ids where name = 'plan'); r jsonb; ben uuid;
begin
  r := public.get_signup(t);
  insert into results(check_name, value) values ('anon sees', (r->>'queue_name') || ' | ' || (r->>'status') || ' | fee ' || (r->>'court_fee') || ' | going ' || (r->'going')::text);

  perform public.sign_up(t, '  Ana ', 'beginner');
  r := public.sign_up(t, 'Ben', 'intermediate'); ben := (r->>'code')::uuid;
  update ids set code = ben where name = 'plan';
  insert into results(check_name, value) values ('Ben signs up', (r->>'name') || ' #' || (r->>'position') || ' code given=' || (r->>'code' is not null));
  perform public.sign_up(t, 'Cy', 'advance');
  perform public.sign_up(t, 'Di', 'beginner');

  begin perform public.sign_up(t, 'ana', 'beginner'); insert into results(check_name, value) values ('dup name', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('dup name (expect refused)', sqlerrm); end;
  begin perform public.sign_up(t, '   ', 'beginner'); insert into results(check_name, value) values ('blank name', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('blank name (expect refused)', sqlerrm); end;
  begin perform public.sign_up(t, repeat('x', 41), 'beginner'); insert into results(check_name, value) values ('long name', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('long name (expect refused)', sqlerrm); end;
  begin perform public.sign_up(t, 'Eve', null); insert into results(check_name, value) values ('no skill', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('no skill (expect refused)', sqlerrm); end;
  begin perform public.check_in(t, 'Walk In', 'beginner'); insert into results(check_name, value) values ('check-in while planned', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('check-in while planned (expect refused)', sqlerrm); end;

  r := public.get_signup(t, array[ben, gen_random_uuid()]);
  insert into results(check_name, value) values ('list + mine (expect mine = Ben only)', (r->'going')::text || ' | mine ' || (select string_agg(x->>'name', ',') from jsonb_array_elements(r->'mine') x));

  begin perform public.cancel_signup(t, gen_random_uuid()); insert into results(check_name, value) values ('cancel with wrong code', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('cancel with wrong code (expect refused)', sqlerrm); end;
  r := public.cancel_signup(t, ben);
  insert into results(check_name, value) values ('Ben cancels', r->>'name');
  begin perform public.cancel_signup(t, ben); insert into results(check_name, value) values ('cancel twice', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('cancel twice (expect refused)', sqlerrm); end;
  r := public.sign_up(t, 'Ben', 'intermediate');
  insert into results(check_name, value) values ('Ben signs up again (allowed)', (r->>'name') || ' #' || (r->>'position'));

  insert into results(check_name, value) values ('unknown link (expect null)', coalesce(public.get_signup(gen_random_uuid())::text, 'null'));

  begin perform count(*) from public.signups; insert into results(check_name, value) values ('anon reads signups table', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('anon reads signups table (expect refused)', sqlerrm); end;
  begin perform public.start_session((select ids.q from ids where name = 'plan'), '{}'); insert into results(check_name, value) values ('anon start_session', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('anon start_session (expect refused)', sqlerrm); end;
  begin perform public.remove_signup((select ids.q from ids where name = 'plan'), 1); insert into results(check_name, value) values ('anon remove_signup', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('anon remove_signup (expect refused)', sqlerrm); end;
end $d$;

-- Another organizer can't see or touch it.
reset role;
set local role authenticated;
select pg_temp.as_owner('b');
do $d$
declare q uuid := (select ids.q from ids where name = 'plan');
begin
  insert into results(check_name, value) values ('other owner sees sign-ups (expect 0)', (select count(*) from public.signups)::text);
  begin perform public.start_session(q, '{}'); insert into results(check_name, value) values ('other owner start', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('other owner start (expect refused)', sqlerrm); end;
end $d$;

-- The organizer.
select pg_temp.as_owner('a');
do $d$
declare q uuid := (select ids.q from ids where name = 'plan'); e uuid := (select ids.q from ids where name = 'empty'); t uuid := (select ids.t from ids where name = 'plan'); r jsonb; ana bigint; cy bigint; di bigint;
begin
  insert into results(check_name, value) select 'owner list', string_agg(name || ':' || status || ':' || skill, ', ' order by id) from public.signups where queue_id = q;
  insert into results(check_name, value) select 'summary', status || ' going=' || signup_count || ' players=' || player_count from public.queue_summaries where id = q;
  insert into results(check_name, value) values ('no charges while planned (expect 0)', (select count(*) from public.ledger_entries where queue_id = q)::text);

  select id into di from public.signups where queue_id = q and name = 'Di' and status = 'going';
  perform public.remove_signup(q, di);
  insert into results(check_name, value) values ('organizer removed Di', (select status::text from public.signups where id = di));

  perform public.set_check_in(q, false);
  reset role; set local role anon;
  begin perform public.sign_up(t, 'Late', 'beginner'); insert into results(check_name, value) values ('sign-up while closed', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('sign-up while closed (expect refused)', sqlerrm); end;
  reset role; set local role authenticated; perform pg_temp.as_owner('a');

  perform public.set_queue_plan(q, '2026-10-25 20:00+08');
  insert into results(check_name, value) values ('date changed, still closed', to_char((select starts_at from public.queues where id = q) at time zone 'Asia/Manila', 'HH24:MI') || ' open=' || (select is_open from public.check_ins where queue_id = q));

  select id into ana from public.signups where queue_id = q and name = 'Ana' and status = 'going';
  select id into cy from public.signups where queue_id = q and name = 'Cy' and status = 'going';
  r := public.start_session(q, array[cy, ana, 999999]);
  insert into results(check_name, value) values ('start (Ana + Cy came)', r::text);
  insert into results(check_name, value) select 'players in sign-up order', string_agg(name || '@' || queue_position || ':' || skill, ', ' order by queue_position) from public.players where queue_id = q;
  insert into results(check_name, value) select 'court fee only for those who came', string_agg(player_name || ' ' || amount, ', ' order by id) from public.ledger_entries where queue_id = q;
  insert into results(check_name, value) select 'sign-ups after start', string_agg(name || ':' || status || coalesce(':player=' || (player_id is not null), ''), ', ' order by id) from public.signups where queue_id = q;
  insert into results(check_name, value) select 'queue after start', status || ' | check-in open=' || (select is_open from public.check_ins where queue_id = q) from public.queues where id = q;

  begin perform public.start_session(q, '{}'); insert into results(check_name, value) values ('start twice', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('start twice (expect refused)', sqlerrm); end;
  begin perform public.set_queue_plan(q, now()); insert into results(check_name, value) values ('plan a live session with players', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('plan a live session with players (expect refused)', sqlerrm); end;

  perform public.set_check_in(q, true);
  reset role; set local role anon;
  begin perform public.sign_up(t, 'Late', 'beginner'); insert into results(check_name, value) values ('sign-up after start', 'ALLOWED (bad)');
  exception when others then insert into results(check_name, value) values ('sign-up after start (expect refused)', sqlerrm); end;
  r := public.check_in(t, 'Walk In', 'beginner');
  insert into results(check_name, value) values ('walk-in check-in after start (allowed)', (r->>'name') || ' #' || (r->>'position'));
  r := public.get_signup(t);
  insert into results(check_name, value) values ('link after start', (r->>'status') || ' going ' || (r->'going')::text);
  reset role; set local role authenticated; perform pg_temp.as_owner('a');

  insert into results(check_name, value) select 'never-planned queue stays live', status::text from public.queues where id = e;
end $d$;

reset role;

do $$
declare v_report text;
begin
  select string_agg(n || '. ' || check_name || ' => ' || value, E'\n' order by n) into v_report from results;
  raise exception E'DRY RUN RESULTS (nothing was saved):\n%', v_report;
end $$;
