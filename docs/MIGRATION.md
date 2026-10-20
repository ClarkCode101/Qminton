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
| 1 | Login | **Supabase Auth, email + password, invite-only** (changed from magic link on 2026-10-12). Sign-ups are OFF; the owner creates each account in the Supabase dashboard. Each organizer owns their queues. Public display stays viewable by link without login. |
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

### ✅ Step 1: Repo + scaffold (done, committed `45cd734`, pushed to `main`)
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

### ✅ Step 2: Schema + RLS + types (done, committed; owner pushes it themselves)
- `supabase/migrations/20261011120000_initial_schema.sql` **applied** to project Qminton
  (migration name `initial_schema`).
- Supabase security advisor: 0 issues. Performance advisor: only "unused index" INFO (empty DB, expected).
- RLS verified with a rolled-back SQL test (2 fake users): each owner sees only their own queue/players/
  summary; direct INSERT by a logged-in user is blocked; anon SELECT is blocked; duplicate name
  (case-insensitive) and negative court fee are rejected.
- `web/src/types/database.ts` generated; `services/supabase.ts` now uses `createClient<Database>`.
- build ✅, test ✅, lint ✅ (same 1 shadcn warning).
- `web/.env.local` created (URL + publishable key; gitignored).
- Changes vs the planned schema table below (my own refinements, explained to the owner):
  - **No `courts` table.** Courts are `1..queues.court_count`; a court is occupied when a match with
    `status='started'` has that `court_no` (unique per court). Timer uses `matches.started_at`.
  - **No stored `billed_total`.** Totals come from the ledger via the `player_balances` view.
  - **Players are soft-deleted** (`removed_at`) so removed players' debts stay visible (bug #2).
    Name uniqueness only applies to active players.
  - `match_players` carries `queue_id`; composite FKs `(queue_id, player_id)` / `(queue_id, match_id)`
    stop cross-queue references.
  - `queue_summaries` has both `total_billed` and `total_collected` (bug #8).
  - Length limits: queue name 60, player name 40, note 300, payment reference 80.

### ✅ Step 3: Auth (done, owner tested OK on 2026-10-15, committed; owner pushes)
- First version used magic links; owner tested it OK, then asked for **limited users** → switched to
  **email + password, invite-only** (owner chose: add users in dashboard, password login).
- `services/auth.ts` (signInWithPassword / getSession / onSessionChange / signOut), the only place using `supabase.auth`.
  No sign-up and no "forgot password" in the app: the owner manages accounts in the dashboard.
- `features/auth/`: `auth-context.ts` (`useAuth`), `auth-provider.tsx`, `require-auth.tsx` (route guard),
  `sign-out-button.tsx` (temporarily on the placeholder Home page; moves to the navbar in step 4).
- `pages/login-page.tsx`: email + password (RHF + Zod), readable errors (wrong credentials, rate limit).
- `lib/auth-redirect.ts`: `?next=` handling (only same-app paths, no open redirect) + login Zod schema.
- Router: `/login` and `/queue/:id/display` public; `/`, `/landing`, `/queue/:id` behind `RequireAuth`.
- `test/setup.ts` now runs RTL `cleanup()` after each test. Tests: 15 passing.
- Build warns main chunk > 500 kB (supabase-js now in the main bundle). Not an error; revisit in step 13.
- **Owner's dashboard settings (no MCP tool for these):**
  - Authentication → Sign In / Providers → **"Allow new users to sign up" = OFF** (required: otherwise
    anyone could call the sign-up API directly with the public key).
  - Authentication → Users → **Add user → Create new user** (email + password, **Auto Confirm User** on)
    for each organizer.
  - URL Configuration (Site URL `http://localhost:5173`) was set for magic links; harmless to keep.

### ✅ Step 4: Queues (done, owner tested OK on 2026-10-19, committed; owner pushes)
- DB: `supabase/migrations/20261015120000_queue_rpcs.sql` → `create_queue`, `delete_queue`
  (security definer, `search_path=''`, check `auth.uid()`, P0001 errors with readable messages,
  EXECUTE only for `authenticated`). **Applied by the owner in the SQL Editor** (the MCP
  `apply_migration` call was auto-declined twice), so it is NOT in Supabase's migration history
  (`list_migrations` shows only `initial_schema`). Verified with a rolled-back test: create trims name,
  defaults to 2 courts, rejects blank name / negative fee; another user's delete → "Queue not found";
  anon blocked. Types regenerated.
- Advisor WARN "authenticated can execute SECURITY DEFINER function": intentional (decision #2).
  Advisor WARN "leaked password protection": Auth setting, owner's choice.
- `services/queues.ts` (listQueues from `queue_summaries`, getQueue, createQueue, deleteQueue) +
  `services/errors.ts` (`toUserMessage`: show P0001 messages, otherwise a friendly fallback).
- `features/queues/`: `use-queues.ts` (TanStack Query), `queue-form-schema.ts` (Zod: whole pesos,
  0–100,000, empty = 0), `queue-list.ts` (sort/filter/latest/busiest), `new-queue-modal.tsx`,
  `queue-dialogs.tsx` (CreateQueueDialog / DeleteQueueDialog: toast on error, form stays open),
  `queue-switcher-panel.tsx`, `queue-deck-card.tsx`, `empty-workspace.tsx`.
- `features/courts/`: `court-view.ts` (CourtView, `formatElapsed` from timestamptz), `courts-grid.tsx` (ported).
- `app/navbar.tsx` + `app/nav-tabs.ts`: queue list popup, tabs, shortcuts (Landing, Display, **Log out**).
  Escape / outside click closes popups. `features/auth/sign-out-button.tsx` replaced by `use-sign-out.ts`.
- `components/confirm-action-modal.tsx` (ported, + Escape, role=alertdialog), `components/load-error.tsx`.
- Pages: `/` (redirect to latest queue or empty workspace), `/landing` (ported), `/queue/:id`
  (navbar + queue name placeholder; "Queue not found" when missing / not yours; retry on errors).
- Behavior changes: billing inputs are text + `inputMode=numeric` (was `type=number`) so decimals
  are caught; errors shown under fields instead of a toast; logo text "Qminton" instead of "OrcaRally".
- Tests: 39 passing (schema, list helpers, elapsed timer, errors, page flows with mocked services).

### ❓ Waiting on the owner
Step 10 in progress.

### ✅ Step 9: Match Log (frontend only, no SQL; owner OK 2026-10-20; committed)
- No migration needed: RLS already lets the owner read `matches` + `match_players`.
- `listMatchHistory(queue, 12)`: newest 12 (match_no desc nulls last, created_at desc = old sort) + exact
  total; `useMatchHistory` (key under `["queues", id]`, so every queue change refreshes it).
- `match-log.tsx` (old MatchHistoryPanel: Finished / On Court / Up Next / Cancelled badges + colors,
  "Court N" or "Coming up #N", time, teams, cancel reason); Courts tab "Match Log (N)" button + overlay
  "Recent results" (last 12, like the old overlay).
- Tests: 97 passing.

### ✅ Step 8: Finish Game + rest rule + Reset Matchmaking (SQL applied by the owner in the SQL Editor; owner OK 2026-10-20; committed)
- MCP `execute_sql` (dry-run) and `apply_migration` were declined (looks like a permission setting).
  The owner ran `supabase/dry-runs/20261023_finish_and_reset_dry_run.sql` in the SQL Editor (it ends with a
  deliberate error that prints the results and undoes everything): **all 18 checks passed**. Then the owner
  applied the migration in the SQL Editor ("Run without RLS" on the editor's generic warning; the only
  tables created are temp tables in the dry-run). Like step 4, it is **not in Supabase's migration history**.
  Verified read-only afterwards: both functions exist, security definer, anon can't execute.
- Note seen in the dry-run (same as the old app): freed players get rest 1, but if the next queued match
  starts on that court right away, that start lowers their rest to 0.
- DB `20261023120000_finish_and_reset.sql`:
  - `finish_game(queue, court_no, match_id?)`: old rest rule exactly (rest = (free + Up Next players not in
    this game, incl. on break) ÷ players per game; at least 1 if another court is playing or matches
    wait), match → completed, freed players rest, then `start_next_pending` on that court. Returns the old
    messages. **New guard:** `p_match_id` = the match the organizer saw; if the court now holds a
    different match → "This court already changed…" (stops a double tap finishing the next match).
  - `reset_matchmaking(queue, include_on_break)`: queued → cancelled ("…before queued match started"),
    started → cancelled ("…while court was active", completed_at), pair memory deleted, players not
    playing/waiting, rest 0, optional un-pause, reindex; match counter kept (old behavior).
- Frontend: `finishGame` / `resetMatchmaking` services, `useFinishGame` (refreshes on error too) /
  `useResetMatchmaking`, `reset-matchmaking-dialog.tsx` (old text + checkbox), Finish Game on court cards
  (main grid + expanded view), Reset Matchmaking button. `database.ts` functions added by hand
  (regenerate after applying). Tests: 96 passing.

### ✅ Step 7: Matchmaking (SQL applied via MCP as `matchmaking`; owner OK 2026-10-20; committed; owner pushes)
Generated types identical to the hand-written ones; security advisor = only the known intentional warnings.
- DB `20261022120000_matchmaking.sql`:
  - private helpers: `move_players_to_end`, `renumber_queued_matches`, `apply_match_start`
    (new match: match_no+1, pair memory upsert pair/partner/opponent + singles opponent_count,
    games_played+1, last_match_no, game-rate ledger "Game rate for match #N", idle off-court rest−1;
    resume_existing: only back on court), `start_next_pending` (skips/cancels invalid queued matches
    with the old cancel reasons), `fill_free_courts`.
  - `create_match(queue, expected_version, team1[], team2[], balance_text, explanation)`: version check,
    team size + availability re-check, random free court (old `random.choice`) → start, else queue
    (players waiting, idle rest−1, moved to end). Returns {status, court_no, match_no, queue_length}.
  - `cancel_queued_match` ("Queued match cancelled by operator"; players not on court → not waiting).
  - `update_queue_settings` replaced: **growing courts now auto-starts Up Next** (`fill_free_courts`),
    finishing step 6.
  - Dry-run ports of the pytest scenarios passed: shrink re-queues court 3 at the front with no double
    game-rate charge; growing back resumes it with the same match no; adding a court starts the oldest
    queued match and bills it; rest counters drop on start and on queue; stale version / busy player /
    wrong team size rejected; cancel frees players.
- `lib/random.ts` (seeded mulberry32 for tests, `pickOne`, `shuffled`), `features/matchmaking/engine.ts`
  (**line-by-line port of create_auto_match**: rested-first pool + tight-pool buffer, refusal message,
  all penalties/weights, singles top-3 random excluding immediate rematch, doubles best score + jitter,
  random sides, balance text, explanation text) + 15 tests.
- `services/matches.ts` (snapshot read queue-first, createMatch, cancelQueuedMatch, listActiveMatches),
  `features/matchmaking/match-view.ts` (court views, Up Next order, main button state, old toast text),
  `use-matchmaking.ts` (pick in browser → create_match; **one automatic retry on a version conflict**),
  `up-next.tsx`, `components/overlay-panel.tsx`; Courts tab: main button + rest hint, live courts with
  names and timer, "X of N courts in use", "View all courts" overlay, Up Next (3) + overlay with Remove.
- Behavior changes: main button doesn't count players on break as available (old did, then the API
  refused); Up Next "View all" is always shown (old only with 4+ queued, so 1–3 couldn't be removed);
  button says "Picking teams..." while saving.
- Not yet: Finish Game, rest_games_needed on finish, Reset Matchmaking (step 8), Match Log (step 9).
- Tests: 94 passing.

### ✅ Step 6: Settings (SQL applied via MCP as `queue_settings`; owner OK 2026-10-20; committed; owner pushes)
- DB `update_queue_settings(queue, game_mode?, court_fee?, game_rate?, court_count?)` (null = unchanged):
  game mode change refused while any match is started/queued (old rule; the old UI never exposed it,
  so no new button); fee/rate ≥ 0; courts 1–6; **shrink** moves started matches on removed courts to
  the FRONT of Up Next (court order, `resume_existing`, keeps match_no, players → Up Next, player order =
  free + displaced + already-waiting); bumps version. Dry-run with simulated matches matched the old
  behavior exactly.
- Grow → auto-start queued matches: done in step 7 (`private.fill_free_courts`).
- Frontend: `updateQueueSettings` service + `useUpdateQueueSettings`; Courts tab court count +/-
  ("Courts updated" toast, readable error = old bug #7); Billing tab (temporary) with the ported
  **Billing setup** dialog (`billing-modal.tsx`, `billing-setup-form.tsx`, whole pesos via Zod).
  Formula text says "Total billed" (was "Total paid", same rename as the Players tab).
- Tests: 67 passing.

### ✅ Step 5: Players (SQL applied via MCP as `player_rpcs`; owner OK 2026-10-20; committed; owner pushes)
- DB `20261020120000_player_rpcs.sql`: `private` schema (no API access) with helpers
  `lock_owned_queue` (row lock + owner check + optional `p_expected_version`), `touch_queue`
  (version+1, updated_at), `reindex_players`, `get_active_player`, `require_player_editable`.
  Public RPCs: `add_players(queue, jsonb, skip_duplicates)` (single = errors, bulk = skips blanks/dups;
  bills court fee "Initial court fee" when > 0; max 100 per call; 40-char names),
  `remove_player` (soft delete + reindex), `set_player_paused`, `move_player_to_bottom`.
  Dry-run (begin…rollback) on the real project: all checks passed (dup/blank/bad skill/long name
  rejected, bulk skips dups incl. case and within the list, court fees billed, move/reindex order,
  playing player can't be removed, removed player's balance still in `player_balances`, re-adding a
  removed name works, other owner → "Queue not found", anon blocked).
- `services/players.ts`; `features/players/`: `player-status.ts` (status, filters, sort, counts,
  skill labels), `bulk-names.ts` (strip numbering/bullets + **dedupe case-insensitively**),
  `use-players.ts` (queries + mutations with old toasts), `skill-picker.tsx`, `add-player-modal.tsx`
  (one markup: modal on desktop, bottom sheet on phones), `player-card.tsx` (flip card / expanded),
  `player-list-panel.tsx` (old QueueCard), `player-stats-table.tsx`.
- `features/courts/courts-tab.tsx`: Courts tab layout with live players sidebar (hide / expand overlay);
  courts shown as available; court count is display-only until step 6.
- `database.ts`: regenerated after applying. Security advisor: only the known intentional
  "authenticated can execute SECURITY DEFINER" warnings (now 6 functions) + leaked-password setting.
- Behavior changes: skill label "Advanced" everywhere (old mixed "Advance"/"Advanced"); Players tab
  column "Total Paid" → **"Total Billed"** (it always showed the billed amount); its Remove button is
  disabled for players on court / up next (old showed an error after clicking); bulk toast also says how
  many were skipped; name errors shown under the field.
- Tests: 63 passing.

### ✅ Logo + login redesign (owner request 2026-10-19; approved, committed; owner pushes)
Owner chose: login = **card over a badminton court**; logo also as **favicon** and in the **landing header**.
Logo: tried "Q with shuttle tail", "shuttle only", "Q with shuttle inside", and a "Q with a flying
shuttle" (owner's AI-generated concept, dark tile), then "a Q with a shuttle feel but no shuttle".
After comparing all of them the owner went back to the **first design: white Q ring whose tail is a
shuttlecock, on the blue gradient tile** (the enlarged-shuttle version) (2026-10-19). Login shows it at 56px.
- `public/favicon.svg` (replaces Vite's default) and `components/qminton-logo.tsx`
  (`QmintonMark`, `QmintonLogo` = mark + "Qminton" with a blue Q). Same drawing in both; keep in sync.
  Gradient id made unique per copy (useId, letters/digits only).
- `features/auth/court-backdrop.tsx`: full court (real 13.4 × 6.1 shape, same green/lines as court cards),
  fits the screen; rotated upright on portrait screens.
- Login card: centered logo, "Organizer Login", same form/logic/labels (tests unchanged).
- Checked with headless Edge screenshots at 1280×800 and 520×1000.

### ✅ Landing UX review fixes (owner asked for all 8, 2026-10-19; approved, committed; owner pushes)
Constraint from owner: must not look AI-made, must stay consistent (no new gradients/emoji; reuse
existing colors, radii, popup style).
1. Whole card is the click target (link `::after` covers the card); solid blue "Open" buttons removed,
   so "+ New Queue" is the only primary button.
2. Card money line: "Collected ₱X" + status: "₱Y unpaid" (amber) / "All paid" (green) / "No charges yet".
3. Contrast: card/search/loading grays slate-400 → slate-500; chip labels 10px → 11px.
4. Relative dates: `formatRelativeDate` ("Just now", "5 min ago", "Today, 3:30 PM", "Yesterday, …",
   "Mon, …", "Oct 19", "Oct 19, 2025"); full date in the `title` tooltip.
5. Delete moved into a "⋯" menu (`queue-card-menu.tsx`, same popup style as the navbar panels).
6. Navbar "All Queues" is now plain text, not a tab-looking pill.
7. Stat chips: Queues / Collected / **Unpaid** (amber when > 0); "Players" removed (double-counts people).
8. Search + sort only appear with 6+ queues (`SHOW_SEARCH_FROM`).
- Tests: 48 passing (new `lib/format.test.ts`, landing card/menu/search tests updated).

### ✅ Login UX review fixes (owner asked for all 3, 2026-10-19; approved, committed; owner pushes)
1. Show/hide password (eye button inside the field, `aria-label` Show/Hide password) + test. Placeholder slate-500.
2. Court lines on the login backdrop made fainter (outer 70%→45%, inner ~55%→30%, net 70%→35%).
3. Favicon: tried a simplified small-size version (thicker ring, bigger shuttle, no thin lines) and
   compared at 16/24/32/64px on light and dark tabs. It did NOT fix the "magnifying glass" look (that
   comes from the ring + 45° tail shape itself) and lost the shuttle detail, so **the favicon is unchanged**.
- Tests: 49 passing. Screenshot checked at 1280×800.

### ✅ Landing redesign (owner request 2026-10-19; owner approved, committed; owner pushes)
Owner kept `/landing` but asked for a redesign (exception to "keep the old look", landing only).
Chosen: **card grid**; complaints fixed: too much text, too spacious, didn't match other pages, no navbar.
- One white panel like the Courts screen: "Your Queues" header, stat chips (Queues / Players /
  Collected), "+ New Queue"; search + Latest/A-Z bar; 1/2/3-column grid of compact cards
  (mode badge, last update, name, players, ₱ collected, Open + trash icon).
- Removed: hero text, "Session Overview" panel, "Latest Queue" / "Most Players" stats,
  "Continue …" button (Home already opens the latest queue). `getBusiestQueue` deleted.
- Navbar now on landing; `activeTab` / `onTabChange` are optional and an "All Queues" pill shows
  when there are no tabs.
- After the owner's screenshot (big empty gap under a short panel): the panel now fills the screen
  height down to the navbar, like the Courts screen; only the card grid scrolls inside it.
- Tests: 40 passing.

### ✅ Git identity
Repo-local config: `user.name ClarkCode101`, `user.email zclarence123@gmail.com` (global config is
still DonClarko for other repos). Step 1 commit was re-authored and force-pushed with the owner's OK.
**Commits must NOT have a `Co-Authored-By: Claude` trailer** (owner's rule): author is ClarkCode101 only.

### ✅ Supabase project
New account/org **ClarkCode101** (`imvhgzvjrgkuldajvzyn`), connector reconnected to it.
Project **Qminton**, ref `ubiznutypxivkcvhzdxk`, region `ap-southeast-1`, created 2026-10-11.
(The old TinapayCorner org / TinapayCorner-Qatar project is a different app — never touch it.)

---

## Remaining order of work
1. ~~Repo + scaffold~~
2. ~~Schema migrations + RLS + generated types (`supabase/migrations/*.sql`, `web/src/types/database.ts`)~~
3. ~~Auth (email + password, invite-only) + login page + route guard~~
4. ~~Queues: list, create, delete, navbar switcher, landing page, home redirect to latest queue~~
5. ~~Players: add, bulk add, remove, pause/resume, move to bottom, Players tab~~
6. ~~Settings: billing setup, game-mode change rule, **court resize** (tricky)~~ (grow → auto-start finished in step 7)
7. ~~Matchmaking: TS scorer + tests ported from pytest (seeded RNG), start/queue match RPC, Up Next, cancel queued match~~
8. ~~Finish game + rest logic + auto-start next pending; reset matchmaking~~
9. ~~Match log~~
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
