# Supabase backend

## Connect a project

1. Create a Supabase project.
2. Apply both files in `supabase/migrations/`, in filename order, using the SQL
   editor or the Supabase CLI. If the reviews migration is already applied, run
   only the new private-plans migration. Never rerun an applied migration.
3. Copy `.env.example` to `.env`. Set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` to the project's URL and public publishable key.
   Do not use a service-role or secret key in the frontend.
4. Configure Google sign-in using [the OAuth setup guide](course-reviews-setup.md).
   Allow the exact planner root URL (including localhost for development) as well
   as the review redirect URLs described there. Account sign-in returns to `/`.
5. Set the same public environment values on your hosting provider and rebuild.

Without configuration, the planner and local saves work; cloud controls explain
that the backend is unavailable. No Supabase project is created by this repository.

## Persistence behavior

The board autosaves to this browser. Settings provides explicit private cloud
copies: save, load, update from the board, and delete. Loading a cloud copy replaces
this browser's board after confirmation. Subsequent edits are local until the user
updates the cloud copy. Older browser saves can be loaded and saved to the account.
Signing out clears the cloud list but keeps the current board in this browser.

`public.plans` stores an owner, name, versioned JSONB document, server timestamps,
and revision number. JSONB preserves complete planner snapshots without coupling
personal plans to a changing course catalogue. Ownership uses `auth.users(id)`;
account deletion cascades to plans. Row-level security and column permissions
protect reads and writes. Updates/deletes match the last observed revision; stale
writes fail visibly. The database validates names, document shape and size.

All authenticated accounts may save private plans. Public reviews retain their
separate verified Krea Google eligibility policy. Curriculum JSON is a versioned
build artifact; the existing `/admin` pages edit local drafts and export them for
the data pipeline. They do not grant access to other users or publish database changes.

## Development checks

```sh
npm run check
npm test
npm run build
npm run test:browser
npm run test:cloud
```

Database tests run the actual migrations in PGlite, including ownership, anonymous
access, constraints, stale revisions and account deletion. Cloud browser tests use
mock HTTP responses to exercise the UI without credentials. They do not replace a
live Google OAuth and two-account Supabase smoke test before launch.

The schema contract is in `src/lib/infrastructure/supabase/database.types.ts`.
After applying future migrations, regenerate it with the Supabase CLI:

```sh
supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/infrastructure/supabase/database.types.ts
```

Keep exported app aliases in separate files if replacing the contract with generated
types (currently `Json` and `PlanRow` are imported by the plan repository).

References: [Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google).
