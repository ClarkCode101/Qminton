# Qminton Migration Plan (from OrcaRally)

Qminton is the new name of **OrcaRally**, a badminton queue management system
(singles/doubles rotation across courts, fair matchmaking, billing, public display).
This repo is a rewrite of OrcaRally onto a new stack. The old code is kept,
untouched, as the reference implementation at:

```
C:\Users\Clarence Zamora\Downloads\OrcaRally\
  backend\main.py      FastAPI, ALL game + billing logic (~1,770 lines)  <- source of truth for behavior
  backend\models.py    Pydantic models
  backend\storage.py   SQLite, one JSON blob per queue
  backend\test_queue_api.py  12 pytest tests (port these as Vitest specs)
  frontend\src\        Next.js 16 client components (UI to port)
  README.md            Long description of queue/matchmaking/billing rules
```

Note: during the earlier session the old app was also changed to run as a single
FastAPI server (static Next export, `/queue/?id=` URLs, `start.bat`,
`frontend/scripts/dev.mjs`). Those changes are uncommitted in the old folder and
are irrelevant to Qminton except as reference.

---

## Decisions (approved by the owner)

| # | Topic | Decision |
|---|---|---|
| 1 | Login | **Supabase Auth, email / magic link.** Each organizer owns their queues. Public display stays viewable by link without login. |
| 2 | Where game logic runs | **Hybrid.** Team selection/scoring = pure TypeScript in the browser (unit-tested). Every state change = **Postgres RPC function** (one transaction, row lock on the queue, `version` check, re-validates eligibility). **No Edge Functions** (no secret key needed). |
| 3 | Bugs found in audit | **Fix them during migration** (list below). Mention each behavior change when done. |
| 4 | Repo | New repo `https://github.com/ClarkCode101/Qminton.git`, local `C:\Users\Clarence Zamora\Downloads\Qminton`. App in `web/`, DB in `supabase/` at repo root. |
| 5 | Android / Capacitor | **Dropped.** Web only for now. |
| 6 | Existing data | **Start with a clean database.** No data migration script needed. |
| 7 | Routes | Clean routes: `/queue/:queueId` and `/queue/:queueId/display` (SPA fallback on Cloudflare). |

Target stack: React + Vite + TypeScript, React Router, Tailwind + shadcn/ui,
TanStack Query, React Hook Form + Zod, Supabase (Postgres, Auth, Realtime),
Cloudflare Pages auto-deploy from GitHub.

---

## Owner's rules for this migration
- Migrate **one feature at a time**; after each, explain what changed and how to test it.
- Keep every existing feature and behavior (except the approved bug fixes). **No new features.**
- Keep the current look and layout (shadcn used as primitives, restyled with the old Tailwind classes).
- DB schema as SQL migration files. **RLS on every table** with policies.
- Generate TS types from Supabase and use them everywhere.
- Never put the service role key in frontend code; env vars + `.env.example`.
- Small components; all Supabase calls in `web/src/services/`.
- Ask when unclear; say plainly if part of the stack is a bad fit.
- Don't delete old code until the new version of that feature works.
- Phase 3: Cloudflare config + SPA fallback, README (setup, env, local run, deploy), feature checklist marked verified / not verified.

---

## Progress

### ✅ Step 1: Repo + scaffold (done, NOT yet committed)
- `web/` = Vite 8, React 19, TS strict, Tailwind 4 (`@tailwindcss/vite`), shadcn (radix-nova preset, `cn` package), React Router 7 (lazy routes), TanStack Query, RHF, Zod, supabase-js, Vitest + jsdom + Testing Library, oxlint.
- `src/index.css`: shadcn tokens + old OrcaRally globals. Tailwind radius scale intentionally NOT overridden (keeps old look). Geist via `@fontsource-variable`.
- `src/app/router.tsx` (routes above + 404), `src/app/providers.tsx` (QueryClient + Toast).
- `src/components/toast.tsx` + `src/hooks/use-toast.ts` (ported, added aria-live) + `toast.test.tsx`.
- `src/services/supabase.ts` (only place the client is created; publishable key only), `src/vite-env.d.ts`, `web/.env.example`.
- Placeholder pages: `src/pages/{home,landing,queue,display}-page.tsx`.
- `shadcn` moved to devDependencies (its npm-audit warnings are CLI-only).
- `engines.node >=22.12.0`, `web/.node-version` = 22.
- `npm run build` ✅, `npm run lint` ✅ (1 warning in generated `ui/button.tsx`), `npm test` ✅ (after the Node upgrade below).

### ✅ Node version (resolved 2026-10-11)
Upgraded `OpenJS.NodeJS.22` 22.11.0 → **22.23.2** via winget. `npm install`, `npm test` (1/1),
`npm run build`, `npm run lint` all pass. `npm audit --omit=dev` = 0 vulnerabilities
(the 7 "high" are dev-only, from the shadcn CLI).

### ❓ Waiting on the owner
1. OK to **create a new free Supabase project "Qminton"** (region Singapore `ap-southeast-1`) via the Supabase MCP connection? The account's org is "TinapayCorner" and already has one project, **TinapayCorner-Qatar — a different app, never touch it**. Free tier allows 2 active projects. Owner sets the DB password in the dashboard.
2. OK to **commit step 1 and push to `main`** of the Qminton repo?

---

## Remaining order of work
1. ~~Repo + scaffold~~
2. Schema migrations + RLS + generated types (`supabase/migrations/*.sql`, `web/src/types/database.ts`)
3. Auth (email / magic link) + login page + route guard
4. Queues: list, create, delete, navbar switcher, landing page, home redirect to latest queue
5. Players: add, bulk add, remove, pause/resume, move to bottom, Players tab
6. Settings: billing setup, game-mode change rule, **court resize** (tricky)
7. Matchmaking: TS scorer + tests ported from pytest (seeded RNG), start/queue match RPC, Up Next, cancel queued match
8. Finish game + rest logic + auto-start next pending; reset matchmaking
9. Match log
10. Billing: ledger, adjustments, shared fee, full/partial/bulk payment, undo, CSV, share summary
11. Display page + Supabase Realtime (replaces 10s polling + BroadcastChannel)
12. (Skipped: data migration, clean DB chosen)
13. Cloudflare config, README, feature checklist

---

## Target structure
```
Qminton/
  web/src/
    app/            router, providers, layout
    pages/          one file per route
    features/       queues/ courts/ players/ matchmaking/ billing/ display/
    components/     shared UI; components/ui = shadcn primitives
    services/       ALL Supabase calls (supabase.ts, queues.ts, players.ts, matches.ts, billing.ts, realtime.ts)
    lib/            pure helpers, Zod schemas
    types/database.ts   generated
  supabase/migrations/  numbered .sql files
  docs/MIGRATION.md     this file
```

## Planned schema (normalized from the old JSON blob)
| Table | Columns |
|---|---|
| `queues` | id uuid, owner_id → auth.users, name, game_mode enum, court_fee int ≥0, game_rate int ≥0, court_count int 1–6, match_no, **version**, created_at/updated_at timestamptz |
| `players` | id bigint, queue_id, name (length limit), skill enum (beginner/intermediate/advance), games_played, billed_total (old `total_paid`), queue_position, is_playing, is_waiting_match, is_paused, rest_games_needed, last_match_no; unique (queue_id, lower(name)) |
| `courts` | PK (queue_id, court_no 1–6), status, active_match_id, **started_at timestamptz** |
| `matches` | history + pending merged: id, queue_id, match_no, status (queued/started/completed/cancelled), queue_order, court_no, created/started/completed_at, balance_text, explanation, queue_length, cancel_reason, resume_existing |
| `match_players` | match_id, player_id, team 1/2, slot, snapshot of name + skill |
| `pair_memory` | queue_id, kind (pair/partner/opponent), player_a, player_b, last_match_no, opponent_count (replaces 4 JSON dicts) |
| `ledger_entries` | id, queue_id, player_id, player_name snapshot, amount int, entry_type (court_fee/game_rate/adjustment/payment), note, payment_method enum (cash/gcash/maya/bank/other), payment_reference, match_no, created_at |

Plus: `queue_summaries` view; `get_display(queue_id)` SECURITY DEFINER RPC for the public display
(no anon table access). RLS: owner-only select; writes go through RPCs that check `auth.uid()`.

---

## Feature inventory (must all survive the migration)
**Pages:** `/` (redirect to latest queue, else empty workspace with Courts/Players/Billing preview tabs), `/landing` (queue deck), organizer view (tabs Courts / Players / Billing), public display. (`/download/android` dropped with Android.)

**Queues:** create (name, singles/doubles, court fee, game rate; default 2 courts); list with search + sort (Latest / A–Z) on landing and in navbar popup; switch; delete with confirm; auto-open latest; summary cards.

**Courts tab:** court diagram with team names, elapsed timer, Finish Game; court count +/- (1–6) with resize rules (shrinking re-queues active matches at the FRONT; growing auto-starts pending); dynamic main button (Need N more / Start Next Match / Queue Next Match / Finish a court first) + rest hint; Up Next (3 shown + View all overlay, remove queued match); Match Log overlay (last 12); Reset Matchmaking (option to include players on break); expanded courts overlay; collapse/expand players sidebar.

**Players:** sidebar with search, status filter + counts (All/Ready/On Break/Resting/Up Next), status-priority sort, flip-card actions (pause/resume, move to bottom, remove w/ confirm). Add Player modal: single or bulk paste (strips numbering/bullets), per-player skill + "Set all", mobile bottom sheet. Duplicate names rejected case-insensitively. Players tab = stats table.

**Matchmaking engine** (port exactly from `backend/main.py`): rest-first pool with tight-pool buffer; refuse when not enough rested and pending exists; penalties (partner cooldown 3 ×300, opponent cooldown 2 ×60, opponent count ×35, pair cooldown 2 ×100, skill diff ×10, queue position ×0.01, rest mix ×5); singles = random pick among top 3 (excluding immediate rematch); doubles = best score with tiny jitter; random side/order; pending when courts full; rest counters decrement per started/queued match; `rest_games_needed` computed on finish; finished court auto-starts next pending; explanation + balance text.

**Billing:** court fee on join, game rate on match start, all as ledger entries. Summary cards (Open Balance, Collected, Players Due); roster grouped Unpaid / Partial / Paid with filters, search, 4 sorts; mark paid (method + reference); partial payment; bulk payment; undo latest payment (stack semantics); billing setup; advanced tools: single +/- adjustment, shared fee split evenly with remainder; activity log with search; CSV export; share/copy summary.

**Display:** read-only courts + next 3 matches, link back to organizer view.

**Cross-cutting:** toasts, confirm modals, floating bottom nav, live refresh (to be Realtime).

## Bugs to FIX during migration
1. Lost updates / race: whole-state load→modify→save without a request-wide lock → fixed by RPC transactions + row lock + version.
2. Removing a player with an unpaid balance makes their debt disappear from the billing roster (roster built from current players only) → keep removed players' balances visible.
3. Timer/timezone: `start_time` stored as "03:15 PM" server-local, minute precision → `started_at timestamptz`.
4. Any error during the 10s poll redirects the organizer to `/` → don't kick out on transient errors.
5. Decimal billing input → 422 shown as "[object Object]" → validate integers with Zod, readable errors.
6. `create_queue` doesn't reject negative court fee / game rate.
7. Unhandled errors: court count change, create queue (home/landing/navbar), delete queue (landing).
8. Landing "Collected" shows total billed, not collected.
Also: GET pending-matches writes (side effect); duplicate names in bulk paste → duplicate React keys; no input length limits; CSV formula injection (names starting with = + - @); no auth (solved by Supabase Auth + RLS).

## Dead code NOT to port
`OverviewCard`, `PlayerDisplayQueue`, `/fairness` endpoint + Fairness models + `api.getFairness`, unused Navbar props (queueName/gameMode/gameRate), duplicate `_pair_repeat_penalty`, Android shell, `/download/android`, Next boilerplate SVGs.

## Known open details
- Rest counter is decremented both when a match is queued AND when it starts (possible double count). Port exactly unless owner says it's a bug.
- Old player IDs were random 53-bit numbers; new DB can use normal identity bigint (clean DB).
