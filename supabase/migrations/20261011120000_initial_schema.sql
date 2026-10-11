-- Qminton initial schema (step 2 of the OrcaRally migration).
--
-- Replaces the old "one JSON blob per queue" storage with normal tables.
--
-- Security model:
--   * RLS is enabled on every table.
--   * A logged-in organizer can only READ rows that belong to queues they own.
--   * There are NO insert/update/delete policies on purpose. Every write will go
--     through Postgres functions (RPCs) added in later migrations. Those functions
--     check auth.uid(), lock the queue row, and bump queues.version, so two phones
--     changing the same queue at once can't overwrite each other (old bug #1).
--   * anon (not logged in) gets nothing here. The public display page will read
--     through a dedicated RPC later (step 11).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.game_mode as enum ('singles', 'doubles');

-- "advance" (not "advanced") is the spelling the old app used.
create type public.skill_level as enum ('beginner', 'intermediate', 'advance');

-- queued    = waiting in "Up Next" (old pending_matches)
-- started   = playing on a court right now
-- completed = finished normally
-- cancelled = removed from Up Next, or cleared by Reset Matchmaking
create type public.match_status as enum ('queued', 'started', 'completed', 'cancelled');

-- The four old JSON dicts become one table:
--   pair     = old pair_last_match      (any two players in the same match)
--   partner  = old partner_last_match   (same team)
--   opponent = old opponent_last_match + opponent_pair_count
create type public.pair_kind as enum ('pair', 'partner', 'opponent');

create type public.ledger_entry_type as enum ('court_fee', 'game_rate', 'adjustment', 'payment');

create type public.payment_method as enum ('cash', 'gcash', 'maya', 'bank', 'other');

-- ---------------------------------------------------------------------------
-- queues (old: the blob itself + its "settings")
-- ---------------------------------------------------------------------------

create table public.queues (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 60),
  game_mode public.game_mode not null default 'doubles',
  -- Negative fees are rejected here too (old bug #6).
  court_fee integer not null default 0 check (court_fee >= 0),
  game_rate integer not null default 0 check (game_rate >= 0),
  -- Courts are numbered 1..court_count. There is no separate courts table:
  -- a court is "occupied" when a match with status 'started' has that court_no.
  court_count integer not null default 2 check (court_count between 1 and 6),
  -- Last match number handed out (old q["match_no"]).
  match_no integer not null default 0 check (match_no >= 0),
  -- Bumped by every write RPC. The app sends the version it last saw; if it no
  -- longer matches, the RPC refuses instead of overwriting newer changes.
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index queues_owner_updated_idx on public.queues (owner_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- players
-- ---------------------------------------------------------------------------

create table public.players (
  id bigint generated always as identity primary key,
  queue_id uuid not null references public.queues (id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 40),
  skill public.skill_level not null,
  games_played integer not null default 0 check (games_played >= 0),
  -- 0-based order in the queue (old "reindex" keeps this 0..n-1 for active players).
  queue_position integer not null default 0,
  is_playing boolean not null default false,
  is_waiting_match boolean not null default false,
  is_paused boolean not null default false,
  rest_games_needed integer not null default 0 check (rest_games_needed >= 0),
  last_match_no integer not null default 0,
  created_at timestamptz not null default now(),
  -- "Remove player" sets this instead of deleting the row, so an unpaid balance
  -- stays visible in Billing after the player leaves (old bug #2).
  removed_at timestamptz,
  -- Lets other tables use (queue_id, player_id) foreign keys, which guarantees a
  -- match or ledger entry can never point at a player from a different queue.
  unique (queue_id, id)
);

-- Duplicate names are rejected case-insensitively, but only among players still
-- in the queue (a removed "Juan" doesn't block adding "juan" again, like before).
create unique index players_active_name_key
  on public.players (queue_id, lower(name))
  where removed_at is null;

create index players_queue_position_idx
  on public.players (queue_id, queue_position)
  where removed_at is null;

-- ---------------------------------------------------------------------------
-- matches (old match_history + pending_matches merged into one table)
-- ---------------------------------------------------------------------------

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.queues (id) on delete cascade,
  -- Assigned when the match starts on a court; null while only queued.
  match_no integer,
  status public.match_status not null,
  -- Position in "Up Next" (1 = next). Only set while status = 'queued'.
  queue_order integer,
  court_no integer check (court_no between 1 and 6),
  balance_text text not null default '',
  explanation text not null default '',
  queue_length integer not null default 0,
  cancel_reason text,
  -- True when a court shrink pushed a running match back to the front of Up Next;
  -- it resumes without a new match number or a second game-rate charge.
  resume_existing boolean not null default false,
  created_at timestamptz not null default now(),
  -- Real timestamps with timezone instead of "03:15 PM" (old bug #3).
  started_at timestamptz,
  completed_at timestamptz,
  unique (queue_id, id),
  check ((status = 'queued') = (queue_order is not null)),
  check (status <> 'queued' or court_no is null),
  check (status <> 'started' or (court_no is not null and started_at is not null))
);

-- At most one running match per court.
create unique index matches_one_started_per_court
  on public.matches (queue_id, court_no)
  where status = 'started';

-- Up Next, in order.
create index matches_queued_order_idx
  on public.matches (queue_id, queue_order)
  where status = 'queued';

-- Match log, newest first (old sort: match_no desc, then created_at desc).
create index matches_history_idx
  on public.matches (queue_id, match_no desc nulls last, created_at desc);

-- ---------------------------------------------------------------------------
-- match_players (who played in each match, with a snapshot of name + skill)
-- ---------------------------------------------------------------------------

create table public.match_players (
  match_id uuid not null,
  queue_id uuid not null,
  player_id bigint not null,
  team smallint not null check (team in (1, 2)),
  -- Position inside the team: singles uses slot 1 only, doubles uses 1 and 2.
  slot smallint not null check (slot in (1, 2)),
  -- Snapshot so the match log still shows the name/skill used at the time.
  player_name text not null,
  player_skill public.skill_level not null,
  primary key (match_id, team, slot),
  unique (match_id, player_id),
  foreign key (queue_id, match_id) references public.matches (queue_id, id) on delete cascade,
  foreign key (queue_id, player_id) references public.players (queue_id, id) on delete cascade
);

create index match_players_queue_match_idx on public.match_players (queue_id, match_id);
create index match_players_queue_player_idx on public.match_players (queue_id, player_id);

-- ---------------------------------------------------------------------------
-- pair_memory (matchmaking cooldowns; replaces the 4 JSON dicts)
-- ---------------------------------------------------------------------------

create table public.pair_memory (
  queue_id uuid not null references public.queues (id) on delete cascade,
  kind public.pair_kind not null,
  -- Always stored with the smaller id first (old _pair_key sorted the two ids).
  player_a bigint not null,
  player_b bigint not null,
  last_match_no integer not null,
  -- Only used for kind = 'opponent' in singles (old opponent_pair_count).
  opponent_count integer not null default 0 check (opponent_count >= 0),
  primary key (queue_id, kind, player_a, player_b),
  check (player_a < player_b),
  foreign key (queue_id, player_a) references public.players (queue_id, id) on delete cascade,
  foreign key (queue_id, player_b) references public.players (queue_id, id) on delete cascade
);

create index pair_memory_player_a_idx on public.pair_memory (queue_id, player_a);
create index pair_memory_player_b_idx on public.pair_memory (queue_id, player_b);

-- ---------------------------------------------------------------------------
-- ledger_entries (all billing: charges, adjustments, payments, reversals)
-- ---------------------------------------------------------------------------

create table public.ledger_entries (
  -- Increasing id = insertion order. "Undo latest payment" relies on this order.
  id bigint generated always as identity primary key,
  queue_id uuid not null,
  player_id bigint not null,
  player_name text not null,
  -- Whole pesos only. Payments are positive; an undone payment is a negative payment.
  amount integer not null check (amount <> 0),
  entry_type public.ledger_entry_type not null,
  note text not null check (char_length(note) <= 300),
  payment_method public.payment_method,
  payment_reference text check (char_length(payment_reference) <= 80),
  match_no integer,
  created_at timestamptz not null default now(),
  check (entry_type = 'payment' or (payment_method is null and payment_reference is null)),
  foreign key (queue_id, player_id) references public.players (queue_id, id) on delete cascade
);

create index ledger_entries_queue_player_idx on public.ledger_entries (queue_id, player_id, id);

-- ---------------------------------------------------------------------------
-- Views (security_invoker = the caller's RLS applies, so owners see only theirs)
-- ---------------------------------------------------------------------------

-- Billing totals per player, computed from the ledger (no stored total to drift).
-- Includes removed players so their unpaid balance stays visible (old bug #2).
create view public.player_balances
with (security_invoker = true) as
select
  p.queue_id,
  p.id as player_id,
  p.name,
  p.removed_at,
  coalesce(sum(l.amount) filter (where l.entry_type <> 'payment'), 0)::integer as billed_total,
  coalesce(sum(l.amount) filter (where l.entry_type = 'payment'), 0)::integer as paid_total,
  (
    coalesce(sum(l.amount) filter (where l.entry_type <> 'payment'), 0)
    - coalesce(sum(l.amount) filter (where l.entry_type = 'payment'), 0)
  )::integer as balance
from public.players p
left join public.ledger_entries l
  on l.queue_id = p.queue_id and l.player_id = p.id
group by p.id;

-- One row per queue for the landing page and navbar switcher.
-- total_collected is the real "Collected" figure (old bug #8 showed total billed).
create view public.queue_summaries
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
  )::integer as total_collected
from public.queues q;

-- ---------------------------------------------------------------------------
-- Row Level Security: owners can read their own data, nothing else
-- ---------------------------------------------------------------------------

alter table public.queues enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.pair_memory enable row level security;
alter table public.ledger_entries enable row level security;

create policy "Owners can read their queues"
  on public.queues for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "Owners can read players of their queues"
  on public.players for select to authenticated
  using (queue_id in (select id from public.queues where owner_id = (select auth.uid())));

create policy "Owners can read matches of their queues"
  on public.matches for select to authenticated
  using (queue_id in (select id from public.queues where owner_id = (select auth.uid())));

create policy "Owners can read match players of their queues"
  on public.match_players for select to authenticated
  using (queue_id in (select id from public.queues where owner_id = (select auth.uid())));

create policy "Owners can read pair memory of their queues"
  on public.pair_memory for select to authenticated
  using (queue_id in (select id from public.queues where owner_id = (select auth.uid())));

create policy "Owners can read ledger of their queues"
  on public.ledger_entries for select to authenticated
  using (queue_id in (select id from public.queues where owner_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Table privileges (second lock behind RLS)
-- Logged-in users may only SELECT; anon gets nothing. Writes = RPCs only.
-- ---------------------------------------------------------------------------

revoke all on
  public.queues, public.players, public.matches, public.match_players,
  public.pair_memory, public.ledger_entries,
  public.player_balances, public.queue_summaries
from anon, authenticated;

grant select on
  public.queues, public.players, public.matches, public.match_players,
  public.pair_memory, public.ledger_entries,
  public.player_balances, public.queue_summaries
to authenticated;
