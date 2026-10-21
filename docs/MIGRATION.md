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

### ✅ New Queue redesign + dialogs don't close on an outside tap + Queues popup (owner's request 2026-10-21; committed)
Owner chose: "clean + Courts" layout; close with ✕ / Cancel / Esc only; same for every dialog with a form.
- `new-queue-modal.tsx`: one title (no "CREATE QUEUE" eyebrow / subtitle); Singles/Doubles as a segmented
  switch; **Courts stepper** (1–6, default 2) next to it; fee fields are real input boxes with ₱, empty
  instead of a pre-filled "0" (empty = 0 as before), labels "Court fee" / "Shuttle rate" with a hint each
  ("Per player, once when they join" / "Per player, every game they play"); "You can change these later."
  in the footer. Phones: fields stack, buttons full width.
- Courts: `create_queue` is unchanged (always 2); `CreateQueueDialog` calls `updateQueueSettings` right
  after when another number is chosen. If that fails the queue still opens (no duplicate on retry) with a
  toast to change the courts on the Courts tab. Schema: `courtCount` + `DEFAULT_COURT_COUNT`/`MIN`/`MAX`.
- No close on a tap outside: New Queue, Add Players, and every `BillingModal` form (billing setup, payments,
  tools). `BillingModal` has `closeOnBackdrop` (default false); only Payment activity (read-only) passes it.
  List overlays (Match Log, View all courts, expanded players) and confirm dialogs unchanged.
- Checked with headless Edge screenshots at 1280×800 and 520 wide (temporary preview page, deleted).
- Navbar queue list popup (owner: search + Latest/A-Z not needed; chose Delete in a "⋯" menu):
  heading "Queues" + "+ New Queue"; no search / sort (always latest first, the open queue pinned on top
  with a blue bar + check, `aria-current`); each row shows mode · players · last update (relative time);
  the ✕ (looked like "close") → `MoreMenu` "⋯" → "Delete queue" (same confirm). `MoreMenu` got
  `placement="left"` so the menu opens beside the button and isn't cut off by the scrolling list.
  Footer link "See all queues →" (landing page, which keeps search + sort from 6 queues).
  Checked with 12 queues (long name truncates, list scrolls past ~4–5). Found + fixed: on a phone held
  sideways (844×390) the popup's header was cut off at the top; the list height now follows the screen
  (`max-h-[max(4.5rem,min(18rem,calc(100dvh-14rem)))]`).
- Tests: 160 passing.

### ✅ More menu redesign (owner's request 2026-10-21; chose "grouped, no Landing"; committed)
- No "MORE / Open another view…" header, no subtitles per row, plain icons (no circles), 44px rows.
- Group **Public display**: "Open display" (new tab) + "Show QR code" (only when a queue is open).
- Divider, then "Signed in as <email>" (from the session) + **Log out**.
- "Landing" removed from More: the Queues popup has "See all queues →" (same page).
- Tests: 161 passing. Screenshot checked (temporary preview, deleted).

### 🧪 Planned sessions with sign-up, part 1 (owner's idea 2026-10-21; new feature; SQL applied via MCP as `planned_sessions`; committed, owner tests on Cloudflare)
- Applied 2026-10-21 with the owner's OK. Verified: all new functions security definer; organizer ones
  authenticated only; get_signup / sign_up / cancel_signup anon too (by design, like check-in);
  `private.code_hash` not callable via the API; `signups` RLS on, anon no select; existing queue stayed
  live. Generated types = hand-written ones (+2 FK relationship entries, added). Security advisor: only the
  known intentional SECURITY DEFINER warnings (3 new anon ones: the public sign-up functions).
Owner's idea: a queue can be planned before the games; a link / QR goes in the group chat; people sign up,
see who is going and can cancel. Owner chose: **bill only at Start, only those who came**; **cancel only
from the phone that signed up**; **part 1 first** (no slot limit / waitlist yet).
- DB `20261029120000_planned_sessions.sql`: enum `queue_status` (planned/live) + `queues.status` (default
  live, so every existing queue is unchanged) + `queues.starts_at`; table `signups` (name, skill, status
  going/cancelled/arrived/no_show, `cancel_code_hash` = sha256 of the phone's secret code, `player_id` set at
  start; RLS owner-select; anon nothing; unique going name per queue); `queue_summaries` + status, starts_at,
  signup_count. RPCs: `set_queue_plan` (fresh queue → planned + opens sign-ups; or change the date),
  `remove_signup`, `start_session(queue, arrived ids)` (arrived → players in sign-up order, court fee billed
  then; rest → no_show; status live; check-in closed), public `get_signup(token, my codes)` (names only +
  which of this phone's codes are still going), `sign_up` (returns the secret code once), `cancel_signup`.
  `check_in` replaced (md5 of the live version = file checked first): refuses while planned.
  The sign-up link **is** the check-in link (same token): sign-up while planned, check-in once live.
- Dry-run `supabase/dry-runs/20261029_planned_sessions_dry_run.sql` via MCP: 37/37 OK (validation, dup names,
  wrong / reused cancel code, anon can't read the table or call organizer RPCs, other owner can't, no
  charges while planned, start bills only arrivals in sign-up order, no-shows, closed sign-ups, after start:
  sign-up refused, walk-in check-in works, never-planned queues stay live).
- Frontend: `services/signups.ts`, `lib/my-signups.ts` (this phone's codes in localStorage per link),
  `features/signups/` (`use-signups.ts`, `planned-session.tsx` = Courts tab of a planned queue: date +
  Change, share card (sign-ups open/close, link, Copy invite, Share…, QR, New link), live "Going" list with
  Remove, `start-session-dialog.tsx` "Who came?" checklist). New Queue: **When: Start now | Plan for later**
  + date/time (create, then `set_queue_plan`). Public `/join/:token` page: sign-up view (date, fees, form,
  "Going from this phone" + Cancel my spot, "Sign up someone else", numbered Going list, live updates via
  Realtime) or the old check-in view when live. Landing card: PLANNED badge, date, "N going"; Queues popup
  row: "Planned · date · N going". `getCheckIn` removed (replaced by `getSignupPage`).
- `database.ts` edited by hand (regenerate after applying). Tests: 170 passing. Screenshots checked
  (organizer 1280, public page 390 phone frame; temporary preview deleted).

### 🧪 Planned sessions follow-ups (owner, 2026-10-21; SQL applied; committed, owner pushes and tests)
- Layout (owner's screenshot: the share card with QR went under the bottom navbar): from tablet width the
  panel stops above the navbar like the Courts tab; the share card and the Going list scroll inside. QR
  200 → 180. Checked at 1690×918 and 1280×720.
- **Organizer adds people to the list** (owner's request): "+ Add people" on the Going list opens Add
  Players in `target="signups"` mode (title "Add to the list", no QR tab, repeats "Already on the list").
  DB `20261030120000_organizer_add_signups.sql`: `add_signups(queue, jsonb)` (organizer only, planned only,
  same name / skill rules, repeats + blanks skipped, max 100 per call / 150 going, random cancel code nobody
  keeps → only the organizer can remove them, no charges). Dry-run
  `supabase/dry-runs/20261030_organizer_add_signups_dry_run.sql` via MCP: 14/14 OK. Applied via MCP as
  `organizer_add_signups` (owner's OK 2026-10-21); verified: security definer, authenticated only, anon can't.
- Tests: 171 passing.
- **Rename queue** (owner's request): DB `20261031120000_rename_queue.sql` = `rename_queue(queue, name)`
  (organizer only; trimmed, 1–60; no version bump when unchanged). Dry-run
  `supabase/dry-runs/20261031_rename_queue_dry_run.sql` via MCP: 7/7 OK. Applied via MCP as `rename_queue`
  (owner's OK 2026-10-21); verified: security definer, authenticated only, anon can't.
  UI: "Rename queue" in the landing card ⋯, the Queues popup ⋯ and the Courts tab ⋯ menus
  (`rename-queue-dialog.tsx`); planned session "Edit" = name + date and time in one dialog
  (`features/signups/edit-plan-dialog.tsx`). Owner: editing must work from the landing card without opening
  the queue → for a **planned** queue the card / Queues popup ⋯ item is "Edit name, date & time" (same
  dialog; `EditQueueDialog` picks it by status), for a live queue "Rename queue". Tests: 173.
- **Easier date and time** (owner: the browser's date-time box was hard): `components/date-time-picker.tsx`.
  First try (day chips in 2 rows + a time dropdown) the owner didn't like; chose **"day strip + time chips"**:
  a swipeable row of day cards for the next 14 days (weekday / big date / "Today", "Tmrw" or month) + "More
  dates" (date box), time buttons for the usual session times (4, 5, 5:30, 6, 6:30, 7, 8 PM) + "Other…" (every
  30 minutes, 5:00 AM–11:30 PM), and a summary line ("Fri, Oct 23 · 5:30 PM").
  Third version (owner): **5 day cards + a 6th "More dates" card** (no sideways scroll; a later date shows in
  that card) and a **digital clock** for the time: ▲▼ hour, ▲▼ minutes (5-minute steps, wraps), AM/PM, and
  hour / minutes can be typed (checked when leaving the box); quick buttons 4, 5, 5:30, 6, 7, 8 PM under it.
  `date-time-picker.test.tsx` (4 tests). Tests: 177.
  Fourth tweak (owner): "More dates" opens the browser calendar right away (hidden date box under the card,
  `showPicker()`), and the quick time buttons are gone: **digital clock only** (starts from 6:00 PM when
  first used). Tests: 178.
  Fifth tweak (owner: the browser calendar popped up outside the dialog; chose "under the day cards"): our own
  month calendar (`MonthCalendar`) opens right under the day cards inside the dialog (‹ month ›, past days
  disabled, can't go before this month), closes on pick; the digital clock is centered. Tests: 178. Used in New Queue and the Edit session dialog. Same value format as before
  ("YYYY-MM-DDTHH:mm"), so the form rules didn't change. Tests: 172 passing. Screenshots checked (1280, 390).

### ↩️ Planned session redesign: tried and reverted (owner, 2026-10-21; nothing committed)
Owner asked to make organizing "feel exciting". Tried, in order: (1) "courts filling up" (stat boxes:
going / countdown / skill mix, a grid of the queue's courts filling with initials dots, name chips, big
Copy invite); owner: overwhelming → (2) one animated scene (court + bench, players bouncing, a shuttle
flying over the net). Owner then preferred **the first layout** (share card on the left, Going list on the
right) **without animation**, so both were thrown away and the screen stays as committed in `d8f180b`.
- Then (owner: "lively but not overwhelming, no animation"; chose 3 of 4 ideas, not the court-spots progress
  bar): Going rows = **initials circle colored by skill** (light → dark blue: Beginner / Intermediate /
  Advanced), skill only (no "Today, 2:12 PM"), **"New"** tag for the last hour, a small ✕ instead of "Remove",
  a green **"Live"** dot instead of "Updates live as people sign up". Share card → **"Invite players"**: status
  pill, one big **Copy invite**, Share…, the **QR always shown** (faded while closed, "Scan to sign up"), and
  small "Close sign-ups · New link" links; the long link and the explanation are gone. `initials()` helper.
  Tests: 179.
- **Add Players / Add to the list, less text** (owner: people look at the controls, not at instructions):
  no instruction lines (also not the "For people who messaged you…" line); name box "Name" (44px) with a
  **+** button (aria "Add to list") instead of the "Add to list" text button; the skill picker without the
  "Skill:" label; empty list = one muted line "Names you add show up here"; rows and "Set all" use a short
  picker **Beg / Int / Adv** (`SkillSegmented short`, screen readers hear the full word) so each row fits one
  line on phones; "Already in the queue · skipped". Same dialog for live queues and planned sessions.
  Follow-up (owner: the picker under the name box looked unrelated; chose "in the name line" and "colored
  dot"): **[Name] [Beg|Int|Adv] [+]** on one line; the signal-bars icon → a **colored dot** per skill (light /
  mid / dark blue, `SkillDot`), the same colors as the initials circles in the Going list (`SKILL_DOT` /
  `SKILL_AVATAR` in `player-status.ts`). Also used by the public sign-up / check-in page's skill picker.
  Follow-up (owner: the dots were hard on the eyes; wanted a short bulk-add hint): only the **picked** option
  shows its dot (one per row instead of three); one hint line under the name box: "Adding many? Paste a list
  of names, one per line."
  Follow-up (owner: with names already on the list it must not add at all): while any name in the list (or
  in the box) has a problem (already in / on the list, or too long), **"Add N players" is disabled**; a bar
  above the buttons says "2 names are already on the list." with **Remove them**. Rows just say "Already on
  the list" (no "· skipped"). Behavior change vs before: it used to add the others and skip the repeats.
  Follow-up (owner): skills spelled out again everywhere (the short "Beg / Int / Adv" picker removed), and the
  picker for the name being typed is back **under** the name box so the full words fit: [Name] [+] /
  [● Beginner | Intermediate | Advanced]. List rows: one line from 640px, picker under the name on phones.
  Follow-up (owner): the picker is back **beside** the name box with the full words: from 640px
  [Name] [● Beginner | Intermediate | Advanced] [+] on one line; on phones [Name] [+] with the picker
  full-width under them (no room for the full words on one 390px line). Checked at 1280×800 and 390px.
- **QR check-in tab** (owner: same look as the planned session's QR card): `check-in-panel.tsx` is one card,
  "Scan to join" + status pill ("Check-in is open / closed"), the QR (200px, faded while closed) with one
  caption line, and small links "Open/Close check-in" · "Copy link" · "New code". The printed link, the
  explanation lines and the big buttons are gone. Test checks the link through Copy link. Tests: 179.
- **One QR for joining and watching** (owner, 2026-10-21): the join page (`/join/:token`) of a **live**
  session shows the courts under the form (`features/display/live-courts.tsx`: a phone-sized list, Court N
  + teams or "Free", Up next #1–3, "+N more waiting", "Open full display"). Also after joining (the
  "Watch the courts" button is gone; names joined from this phone are bold on the list) and when check-in
  is closed (the "Try again" button is gone: the page updates live). Not on planned sessions (no games yet).
  No SQL: uses the public `get_display`; the page's one live listener reloads both (`useDisplayQuery` =
  the display data without its own Realtime channel). The Display link still can't add players.
  Tests: 180.
  Follow-up (owner): the courts are **not shown right away**: a "View courts" button under the card opens
  the courts view on the same page (`?view=courts`, so the phone's back button returns), with
  "Join the queue" (or "Back" once joined / when check-in is closed) to go back to the form. No link to
  the full display there (it has "Organizer View"; this page is for players). Skill picker on the join
  page is full width on every screen (`SkillSegmented fill="always"`).
  Follow-up (owner: show the court itself): the courts view uses the same court cards as the display
  (`CourtsGrid` readOnly: diagram with Team 1 / Team 2, "Playing for" timer, "Available"), one per row on a
  phone; names joined from this phone are underlined (`CourtsGrid highlight`). Up next stays a list.
  Follow-up (owner: responsive): the courts view is wider on bigger screens (`Screen wide`: phone width,
  `sm` 2xl, `lg` 5xl), so the court cards are 1 / 2 / 3 per row (their container query); Up next = small
  cards in the same columns; "Join the queue" max 20rem wide from `sm`. The form view stays phone width.
  Checked at 390, 820×1180 and 1280×800.
- **Display QR removed** (owner, 2026-10-21): the organizer opens a big screen with "Open display", and
  players scan the join QR (it has "View courts"). Gone: "Show QR code" in More (only "Open display" left in
  Public display), the corner QR on the Display page, `display-qr.tsx` + its test, `getQueueDisplayUrl`.
  The join QR was NOT put on the Display page on purpose: the display link is view-only and can be passed
  around; only the join QR can add players. `qrcode.react` stays (join / sign-up QR). Tests: 178.

### ❓ Waiting on the owner
Owner pushes (navbar labels + never-repeat-teammates), tests on the deployed site. Then: Billing tab review or step 13.

### ✅ Auto-start next match (owner's request 2026-10-21; new feature; + SQL `fill_after_shrink` applied via MCP; committed; owner pushes)
Owner chose: switch remembered **per device** (localStorage `qminton:auto-start:<queueId>`), and switching
it on **fills the free courts right away**.
- Courts toolbar: "Auto-start" switch pill (`role="switch"`, green when on) before Match Log.
- When on, a successful Finish Game runs `useAutoFillCourts` (`use-matchmaking.ts`): per free court, read a
  fresh snapshot, pick with the normal engine, `create_match` with the snapshot version (one retry on a
  conflict). Stops when no court is free, when Up Next has waiting matches (those take the court first,
  as before), or when the engine can't make a match (info toast "Auto-start: a court is free, but …").
  - Follow-up (owner chose "always 1 in Up Next"): after the courts are full it also queues **one** match
    in Up Next when Up Next is empty (Finish Game then starts it on the court, and Auto-start readies the
    next). Not more than 1: more would lock players in early. Can't queue one (e.g. not enough rested
    players) → silent; the "a court is free, but …" toast is only for a free court.
- Follow-up (owner: an added court stayed empty): adding a court with Auto-start on also runs the fill
  (after the database's own rule that a new court first takes a waiting Up Next match). With Auto-start
  off it stays the old behavior: the new court waits for Start Next Match.
- Follow-up (owner's screenshot: "Court is not occupied", screen stuck on "Picking teams..."): NOT a rules
  bug. DB + Supabase logs showed the finished match was gone in the DB, but several browser requests reached
  the server 20–47 s late (server times 2–22 ms; the picker takes 9 ms with the real data), so the screen
  showed old data and a second Finish tap was refused. Fixes (owner chose both):
  - `lib/fetch-with-timeout.ts`: every Supabase request gives up after 15 s (`global.fetch` in
    `services/supabase.ts`); `toUserMessage` shows "The connection is slow…" for it. Safe for writes: a
    retry re-reads and the version check refuses a stale one.
  - `useFinishGame` takes the match off its court in the cache at once (on success and on a P0001 refusal),
    so it can't be tapped twice while the reload is slow.
  - Scenario test `supabase/dry-runs/20261021_court_resize_scenario.sql` (1 court, 12 players, +/- courts,
    finish, billing): every old rule held, except step 9: court 1 free + court 2 playing, going to 1 court
    left court 1 empty with the match waiting in Up Next (old OrcaRally did the same). Migration
    `20261028120000_fill_after_shrink.sql` (only change: fill free courts on ANY court-count change, not only
    more). Dry-run `supabase/dry-runs/20261028_fill_after_shrink_dry_run.sql` via MCP: step 9 now resumes #4
    on court 1 with no new charge; all other steps identical. Live function = file before the change
    (md5 checked). **Applied via MCP as `fill_after_shrink` (owner's OK 2026-10-21)**; verified: new rule
    live, security definer, anon can't execute, authenticated can.
  - Tests: 154 passing.
- `getMatchmakingSnapshot` also returns `startedCount` (free courts = court_count − startedCount).
- Only the device that pressed Finish (and has the switch on) starts the match, so two organizers can't
  both start one; a stale count is refused by the version check anyway.
- Tests: 148 passing (6 new in `queue-page-matches.test.tsx`).

### ✅ Courts tab UI review (owner asked for items 1–7, 2026-10-20; committed `bdd641a`)
Checked with headless Edge screenshots (1280, 1600, and a 390px phone frame) using a temporary
fake-data preview page (deleted afterwards). Same features and rules; layout/look only.
1. Players sidebar: tall flip cards → **compact rows** (name, skill · games, status chip); tap a row to
   show Take Break / Move Later / Remove under it. 1280px shows ~9 players instead of 4. The expanded
   players overlay is unchanged.
2. Court diagram: each team is centered in its half on a light dark backing, so court lines never cross
   the names (also on the public display).
3. Courts grid is 3 per row from 1280px (`xl`), court diagram a bit shorter, Up Next cards more compact:
   3 courts + Up Next fit on a laptop screen without scrolling.
4. Reset Matchmaking moved into a "⋯" menu (`components/more-menu.tsx`, now also used by the landing
   queue card menu); the toolbar fits one row at 1280px.
5. Main button when it can't start (e.g. "Need 1 more player"): neutral slate style with readable text
   instead of 40% opacity blue.
6. Phones: main button and Add Player side by side, tighter rate chips and paddings; the first court
   starts ~100px higher.
7. Small text: "Team 1/2" 8px → 11px, "Playing for" 9–10px → 11px, grays slate-400 → slate-500.
- Follow-up on the Players panel (owner's screenshot, chose "text buttons"):
  A. The look-alike Hide / Expand icon buttons → small text buttons "Hide · Expand" under Add Player
     (`viewActions` prop on `PlayerListPanel`). B. Each player row has a ˅ arrow that turns up when open.
  C. Status filter dropdown → one-tap chips with counts (sidebar: one sideways-scrolling line; expanded
     view: wraps; same chips in both). D. Lighter search box (no shadow, 40px) and a thin scrollbar.
- Second follow-up (owner: hard to use on an iPad, easy to mis-tap, chips looked cut off):
  Add Player / Expand / Hide = one row of 40px buttons; filter chips wrap (36px tall) instead of
  scrolling off the edge; row actions (Take Break, Move Later, ×) 36px. Courts grid uses a **container
  query** (`@container`, `@lg` 2 / `@3xl` 3 per row) so it follows the space the courts get: 1 per row
  on an iPad in portrait, 2 on a tablet in landscape, 3 on a laptop. Queue name wraps instead of "…".
  Checked at 820×1180, 1180×820 and 1280×800.
- Third follow-up (owner chose "A"): the status filter chips are **only in the Expand view** now. The
  sidebar keeps search; its list is already sorted by status and each row shows its status chip.
  (The filter feature still exists, so nothing from the old app is lost.)
- Expand view redesign (owner OK): the 390px-tall cards (status shown 3×, queue spot 2×, boxes in
  boxes) → one **table-like list**: # | Player | Status | Skill | Games | Actions, column headings,
  fixed column widths so rows line up (`EXPANDED_ROW_GRID`), actions always visible (36px buttons;
  "Remove" is a word, not a red ×). Below 1024px the actions sit under the name. The close button is
  the same gray ✕ as other overlays and sits after Add Player (red ✕ looked like "delete").
  ~10 players visible at 1280×800 (was 4). Sidebar rows use the same action buttons.
  The close ✕ has no hover label any more (it was cut off at the panel's right edge); `SidebarButton`
  removed. The navbar tooltips are the only hover labels left (not clipped).
- Close ✕ (owner chose "a"): new shared `components/close-button.tsx` used by every dialog/overlay
  (OverlayPanel, BillingModal, New Queue, expanded players): gray at rest, **red on hover** (no hover
  on touch screens, so gray there). Red at rest was rejected: red means delete/remove in this app.
- Wide screens / players panel hidden (owner asked for all 3):
  1. Tried: Up Next as a column next to the courts on wide screens. **Reverted at the owner's request**
     (looked worse with 4+ courts); Up Next always sits under the courts. Kept: Up Next cards per row
     follow the section's own width (`@container`).
  2. "Show players" → same pill as Match Log, labeled **"Players (N)"**.
  3. Court timer shows hours from one hour on: "2:24:54" instead of "144:54" (also on the display).
  - Follow-up: adding a court auto-starts the waiting match (old rule), which made Up Next vanish and
    the layout jump. Up Next is now **always shown** (empty state "No matches waiting.", no View all).
  - Follow-up (owner: Up Next looked "too long"): no full-width box around Up Next any more; the
    heading line is "UP NEXT · N matches waiting · View all" and the match cards use the **same
    columns as the court cards** (1 / 2 / 3 per row), so they line up. The empty state is one
    card-sized dashed box.
- **Add Players redesign** (owner chose "one list"): no more Single / Bulk tabs. Type a name + Enter
  (or "Add to list"), or paste a list (multi-line paste goes straight into the list, numbering/bullets
  stripped as before); each name gets a row with a worded skill picker (`SkillSegmented`: Beginner /
  Intermediate / Advanced, with the bar icon) and a ✕; "Set all" sets every row and the default for new
  names. Names already in the queue (case-insensitive) or longer than 40 characters are flagged
  ("will be skipped") and left out **before** saving. A name still typed in the box is included when
  pressing "Add N players". One call for 1 or many (`bulkAddPlayers`, toast "Added N players");
  `addPlayer` service + `actions.add` removed. Wider dialog (max-w-xl); on phones the bottom sheet
  puts each row's skill picker under the name. Old `SkillPicker` / `CompactSkillPicker` removed.
  - Follow-up (owner: adding ONE player had no skill choice and "glitched"): a **"Skill:" picker under
    the name box** (skill for the name being typed and the next ones). Pressing "Add N players" with a
    name still in the box saves it directly with that skill (no flash of it entering the list first);
    the button count includes it. "Set all" only shows with 2+ names in the list and only changes the
    rows. Empty-list hint explains one vs. many.

### ✅ Player self check-in by QR (owner's request 2026-10-20; new feature; SQL applied via MCP as `self_check_in`; committed)
- Applied 2026-10-20 with the owner's OK. Verified: `check_in` / `get_check_in` executable by anon (by
  design), `set_check_in` authenticated only, `check_ins` RLS on (anon no select). Performance advisor: clean.
Owner chose: players are added **straight to the queue** (no approval step); the QR lives in **Add Players**.
- DB `20261026120000_self_check_in.sql`: table `check_ins` (queue_id PK → queues, `token` uuid unique,
  `is_open` default false; RLS owner-select only; anon nothing). RPCs: `set_check_in(queue, open?, new_code?)`
  (owner; creates the row closed on first read; touch_queue on change), `get_check_in(token)` (anon:
  queue id/name/mode/is_open, null for unknown code), `check_in(token, name, skill)` (anon: locks the queue,
  re-checks open + token under the lock, name 1–40, skill required, no duplicate active name, max 150
  active players, adds at the end, bills "Initial court fee", touch_queue → organizer screen updates live;
  returns name + 1-based position + queue id). The QR holds the token, not the queue id, so the display
  link can't add players; "New code" invalidates old QRs.
- Dry-run `supabase/dry-runs/20261026_self_check_in_dry_run.sql` via MCP: 21/21 OK.
- Frontend: `services/check-in.ts`, `features/check-in/use-check-in.ts` (key under `["queues", id]`),
  `check-in-qr-dialog.tsx` (Open/Close, QR dimmed while closed, Copy link, New code with confirm),
  public page `/join/:token` (`pages/check-in-page.tsx`: name + skill (must pick) → Join → "Welcome, Ana!
  You're #12", Watch the courts, Add someone else; closed / invalid-code states). Add Players modal has
  "Let players check in with QR". `getCheckInPath/Url` in `lib/routes.ts`. `database.ts` updated by hand.
- Follow-up (owner: the QR button looked out of place inside the typing flow): Add Players now has two
  tabs, **"Type names" | "QR check-in"**; the QR tab shows the check-in panel inside the modal
  (`check-in-panel.tsx`, replaces `check-in-qr-dialog.tsx`) with a Done button. Tests: 136.

### ✅ Never repeat teammates (owner's request 2026-10-21: ~50 players a session; SQL applied via MCP as `partner_count`; committed)
Changes the old OrcaRally matchmaking on purpose. Problem found: the old "recent partner" cooldown is 3
matches counted across the whole queue; with ~50 players and 4 courts a player plays about once every 12
matches, so it had always expired by their next game. Simulation (50 players, 4 courts, 100 games):
old rule repeated teammates 57 / 70 / 64 times (3 seeds), new rule 0; games per player stay 7–9
(almost all 8), same as the old rule.
- DB `20261027120000_partner_count.sql`: `pair_memory.opponent_count` → **`times_together`** (constraint
  renamed too); old rows backfilled to 1; `private.apply_match_start` counts +1 for every pair / partner /
  opponent row (was: singles opponents only). Dry-run `supabase/dry-runs/20261027_partner_count_dry_run.sql`
  (old row + migration + tests) via MCP: 8/8 OK. Verified after applying.
- Engine: `PairMemory.partnerCount`; every earlier time as teammates costs **250** (never wears off) on top
  of the old recent-partner penalty. Skill balance (max 40) still decides among new partners; when every
  split repeats, the pair that met the fewest times wins. Queue order / rest rules unchanged.
- `services/matches.ts` reads `times_together` (partner → partnerCount, opponent → opponentCount).
  `database.ts` column renamed by hand. Tests: 142 (`engine-session.test.ts` = the 50-player simulation).

### ✅ Bottom navbar labels (owner OK 2026-10-21; committed `c43f00b`)
The two icon-only navbar buttons (☰ queue list, ⊞ shortcuts) only named themselves on hover, which
never happens on a tablet/phone. Now: icon + small label under it, **"Queues"** and **"More"** (the
shortcuts icon became "⋯", the app's usual "more options" symbol; popup heading "More"). Hover
tooltips removed. Buttons 48px tall (48px wide on phones, 56px from 640px); tabs a bit narrower on
phones so "Billing" isn't cut off at 390px. `--app-bottom-nav-height` 3.75rem → 4.25rem.
- Tests: 135 passing.

### ✅ Speed fixes (owner request 2026-10-20: "the system feels slow"; committed `bdd641a`)
Review result: the database is fast (reads < 2 ms, RPCs 20–80 ms, indexes fine); the slowness was
round trips (PH ↔ Singapore) and too many reloads (players list fetched 305× for 19 matchmaking runs).
- **A.** Actions show their toast / close their dialog as soon as the RPC saved; reloads run in the
  background (`use-matchmaking.ts`, `use-players.ts`, `use-billing.ts`, `useUpdateQueueSettings` which
  also puts the returned queue in the cache). Pause/Resume puts the returned player in the cache at once.
  `setPlayerPaused` now returns the player. Player actions also reload the queue row (for its version).
- **B.** Ledger + billing players load only while the Billing tab is open; billed totals only on the
  Players tab (`enabled`). Courts tab reloads 4 queries per change instead of 7.
- **C.** Realtime messages carry the queue version; `useQueueLiveUpdates` passes the highest version of a
  burst, and the queue page skips the reload when it already shows that version (the echo of its own
  change). Reconnect / backup refresh / deleted queue always reload.
- Not done (optional, needs SQL): **D** = one RPC for the Start Next Match snapshot (saves 1 round trip).
- Tests: 127 passing (`queue-page-live.test.tsx` new; Realtime mock in `test/setup.ts` is now a plain
  function so `vi.resetAllMocks()` can't break it).

### ✅ Step 11: Display + Realtime + QR (SQL applied via MCP as `display_realtime`; committed `e3b5a03`; owner OK 2026-10-20)
- Committed before the owner's manual test (owner's request, to deploy). Owner then deployed to
  **Cloudflare Pages** (Git integration, auto-deploy on push to `main`) and confirmed the deploy and the
  QR scan on a phone work.
- Also added early (from step 13): `web/public/_redirects` (`/* /index.html 200`, SPA fallback on
  Cloudflare Pages). Cloudflare settings given to the owner: root `web`, build `npm run build`, output
  `dist`, env `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (optional `NODE_VERSION=22`).
- Applied 2026-10-20 with the owner's OK (in Supabase's migration history). End-to-end check: a Node
  listener using only the publishable key joined private channel `queue:e2e-test` and received a
  `realtime.send` message in under a second. Security advisor: new expected WARN "anon can execute
  SECURITY DEFINER get_display" (intentional: the public display) + the known authenticated ones.
- DB `20261025120000_display_realtime.sql`:
  - `get_display(queue)` (security definer, **anon + authenticated**): name, mode, court count, started
    matches (court, started_at, team names), next 3 queued (position + teams), queued count. Null when the
    queue doesn't exist. Nothing else (no owner, fees, billing). Helper `private.display_team`.
  - Live updates: trigger `queues_notify_changed` (after update when `version` changes, and after delete)
    → `realtime.send({version} | {deleted}, 'queue_changed', 'queue:<id>', private => true)`.
  - Policy on `realtime.messages`: anon + authenticated may **listen** to broadcast topics `queue:%`; no
    insert policy, so nobody can send fake updates from the browser.
  - Gotcha: `realtime.messages` has daily partitions created by the Realtime server after a client
    connects. Our project had none until the first connection (2026-10-20, a test connect with the
    publishable key); before that `realtime.send` only warns and nothing is stored.
- Dry-run `supabase/dry-runs/20261025_display_realtime_dry_run.sql` via MCP: all checks OK (anon display
  data, limit 3 of 4, no private fields, unknown queue = null, anon can't read tables / call RPCs or
  private helpers, 7 messages on the topic, anon listens only on `queue:` topics, anon and logged-in
  users can't insert messages, delete sends `{deleted: true}`).
- Frontend: `services/display.ts` (`getDisplay`, bad id = not found), `services/realtime.ts`
  (`subscribeToQueueChanges`: private channel, reload on reconnect), `hooks/use-queue-live-updates.ts`
  (300 ms debounce + 60 s backup refresh), `features/display/use-display.ts`, `display-qr.tsx`
  (`qrcode.react` 4.2.0, ISC), `pages/display-page.tsx` (ported old display + QR card, hidden on phones;
  LoadError with retry instead of redirect = bug #4). Queue page reloads everything under
  `["queues", id]` on live updates. Navbar Shortcuts: new **Display QR** (dialog: big QR, link, Copy
  link, Open display). `getQueueDisplayUrl` in `lib/routes.ts`. Tests mock Realtime in `test/setup.ts`.
- Tests: 125 passing.

### ✅ Step 10: Billing (SQL applied by the owner in the SQL Editor; owner OK 2026-10-20; committed)
- Owner re-ran the dry-run in the SQL Editor (all 33 OK), then applied the migration there (like steps
  4 and 8, not in Supabase's migration history). Verified read-only: 5 public functions (security definer,
  authenticated only, anon blocked) + 6 private helpers (no API access). Generated types = hand-written ones.
- DB `20261024120000_billing.sql` (old backend rules + messages): `record_payment(queue, player, amount?,
  note?, method?, reference?)` (no amount = whole balance, note "Marked as paid" / "Partial payment"; >0 and
  ≤ balance), `record_bulk_payment(queue, ids[], …)` (dedupes ids; any player with nothing due = nothing
  saved, "{name} has no unpaid balance"), `reverse_latest_payment` (stack rule, note "Reversed payment: …"),
  `add_adjustment` (note required, non-zero), `add_shared_fee` (split, leftover to the first players, zero
  shares skipped). New private helpers `get_queue_player` (includes removed players), `player_outstanding`,
  `optional_text`, `check_billing_amount`, `check_billing_note`, `insert_payment`. All lock + touch the queue.
- Dry-run `supabase/dry-runs/20261024_billing_dry_run.sql` (exact copy of the migration + 33 checks) ran via
  MCP `execute_sql` on 2026-10-20: all OK, rolled back.
- `database.ts`: the 5 functions added by hand in the generator's format (regenerate after applying).
- Frontend: `services/billing.ts` (ledger, all players incl. removed, 5 RPCs); `features/billing/`:
  `billing-roster.ts` (rows, stack undo, filters/sorts, totals, split, CSV, share text),
  `billing-form-schema.ts` (Zod amounts/notes/references), `use-billing.ts`, `payment-details-fields.tsx`,
  `payment-dialogs.tsx`, `billing-roster-table.tsx`, `billing-tools.tsx`, `billing-activity.tsx`,
  `billing-tab.tsx` (old Billing workspace layout; Billing setup now opens from the Tools menu like the old app).
- Behavior changes: removed players with a billing record stay in the roster ("Removed" badge) and can pay /
  be undone / be adjusted (bug #2); amounts are text inputs with whole-peso errors (bug #5); adjustment /
  shared fee max ₱100,000, note max 300, reference max 80; CSV escapes text starting with = + - @ (formula
  injection); negative money shows "-₱20" (was "₱-20" in our helper); small labels 10px → 11px and
  slate-400 → slate-500 (same contrast fix as landing).
- Tests: 119 passing.

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
10. ~~Billing: ledger, adjustments, shared fee, full/partial/bulk payment, undo, CSV, share summary~~
11. ~~Display page + Supabase Realtime (replaces 10s polling + BroadcastChannel)~~
    + **owner's addition (2026-10-20): QR code to the display link**, in BOTH places: a "Show QR"
    button in the organizer view (big QR in a dialog, for venues without a big screen) and a small QR
    in a corner of the Display page. Library: `qrcode.react` (ISC). New feature by owner request
    (exception to "no new features"). Phones can only open it once deployed (or via `--host` on LAN).
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
