# Qminton

Badminton queue management system (formerly **OrcaRally**), being rewritten onto a
new stack. **Read `docs/MIGRATION.md` first**: it has the approved decisions, the
progress so far, what is blocked, the remaining steps, the schema plan, the full
feature list, and the bugs to fix.

@docs/MIGRATION.md

## Working with the owner
- The owner is learning while building. Explain what you did in simple terms
  (Taglish is fine) and list what they should test manually.
- Work one feature at a time; stop after each step and report.
- Ask before creating cloud resources (Supabase projects), committing, or pushing.
- Old reference code lives in `C:\Users\Clarence Zamora\Downloads\OrcaRally\` (read-only reference).

## Commands (run inside `web/`)
- `npm run dev` — dev server (http://localhost:5173)
- `npm run build` — type-check + production build to `web/dist`
- `npm run lint` — oxlint
- `npm test` — Vitest (needs Node >= 22.12)

## Rules
- All Supabase calls go through `web/src/services/`. Only the publishable key in the frontend; never the service role key.
- Every table has RLS. Schema changes = new numbered SQL file in `supabase/migrations/`.
- Use generated types from `web/src/types/database.ts`.
- Keep the old OrcaRally look (Tailwind classes); shadcn only as primitives.
