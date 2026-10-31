# Rebuild: a server-rendered site on Supabase

Working plan for moving kcal from a prerendered single page with bundled JSON
to SvelteKit on Vercel with Supabase as the system of record. Each phase leaves
the app working; tick a phase off when its checks pass.

## Principles

- **Cacheable by default.** Public pages carry no per-visitor state, so the
  edge can cache them (prerender or ISR). Personal data loads in the browser
  or on private routes (`/account`, `/admin`, `/auth/*`) that read the session.
- **The database is the system of record.** The curriculum, requirement rules
  and saved plans live in Postgres behind row-level security. The scrape and
  the departments' documents are inputs to an import pipeline, never read by
  the app directly.
- **One way in per concern.** One browser client, one request-scoped server
  client, one repository per feature table.
- **Runs without a backend.** With no `PUBLIC_SUPABASE_*` configured the
  planner still works from the bundled curriculum and browser storage.

## Phases

1. **Platform and auth** — done.
   `adapter-vercel` (Node 22); `@supabase/ssr` cookie sessions; `hooks.server.ts`
   with a lazily verified `locals.getUser()` (JWT claims); `/auth/callback`
   code exchange with a same-site redirect guard; runtime `PUBLIC_*` env.
2. **Curriculum schema and import** — done. `supabase/migrations/202611010001_curriculum.sql`:
   normalised tables (courses, codes, prerequisites, equivalences, lecturers,
   requirement sets → programmes → courses / choices / pathways, batch rules),
   public read, admin write (`app_metadata.role = 'admin'`); `import_curriculum`
   and `publish_curriculum` assemble an immutable release. `npm run
   curriculum:build` compiles the scrape and `src/lib/data/requirement-sets/**`;
   `curriculum:push` imports it (secret key); tests prove an exact round trip.
3. **Curriculum runtime** — done. `src/lib/curriculum/compiler.ts` holds every
   source correction; `src/lib/data.ts` only indexes the snapshot. Builds pull
   the current release (`curriculum:pull`, in `prebuild`); publishing should
   trigger a rebuild through a Vercel deploy hook.
4. **Public pages** — done. `/courses`, `/courses/[code]`, `/programmes`,
   `/programmes/[subject]`, `/lecturers`, `/lecturers/[id]`, `/sitemap.xml`:
   prerendered, no client JavaScript.
5. **Accounts** — the current board, grades and settings sync to the account
   (debounced, revision-checked); `/account` for profile, saved plans and
   sign-out.
6. **Admin on the database** — `/admin` checks `isAdmin` on the server, edits
   go through form actions, publishing a release revalidates the ISR pages.
7. **Finish** — docs, tests for each table's policies, remove the old
   local-draft admin storage.
