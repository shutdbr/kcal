# Google sign-in and shared course reviews

kcal uses Supabase Auth and Postgres for reviews. Planning and the Canvas importer
continue to work without an account. The browser extension does not sign users
into kcal, and Google sign-in does not authorize Canvas access.

## Create the backend

1. Create a Supabase project you own.
2. Run `supabase/migrations/202610290001_course_reviews.sql` in the SQL editor
   once, or apply it with the Supabase CLI. It creates the review table and RLS policies.
3. The migration permits posting only for verified Google identities whose email
   domain is exactly `krea.ac.in`. This is checked using server-owned `auth.users`
   and `auth.identities`, not editable profile metadata or a client-side email check.
   Other accounts can read reviews but cannot create or update them. Owners can
   always delete their existing review, even if the allowed domain later changes.

To change the domain allowlist later, run as the project owner:

```sql
update private.review_settings
set allowed_email_domains = array['krea.ac.in']
where singleton = true;
```

Keep the `private` schema out of the exposed Data API schemas (the default).
Do not disable row-level security on `course_reviews`.

## Configure Google OAuth

1. In Google Cloud, create an OAuth consent screen and a **Web application** OAuth
   client. An application you own can request basic Google sign-in; no Canvas
   developer key is involved. University Google Workspace restrictions can still
   affect whether a student may authorize third-party sign-in.
2. Add the callback URL displayed by Supabase's Google provider settings to the
   Google client's **Authorized redirect URIs**, usually
   `https://YOUR_PROJECT.supabase.co/auth/v1/callback`.
3. Enable **Google** under Supabase Authentication → Sign-in / Providers. Enter
   the Google client ID and secret there, **never in the kcal repository or frontend**.
4. In Supabase Auth URL Configuration, set the Site URL to the deployed kcal URL.
   Allow redirect URLs for the planner, including the `?review=COURSE` parameter.
   For example, `https://YOUR_KCAL_HOST/?review=*` and, for development,
   `http://localhost:5173/?review=*`. Use your actual host and port; avoid broad
   production wildcards. The application uses PKCE and returns to the selected course.
5. While the Google OAuth app is in testing, add test users. For student-wide use,
   publish the consent screen as appropriate in your Google Cloud project.

Official setup: [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google)
and [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## Configure kcal

Copy `.env.example` to `.env` and set:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```

Use the project's **publishable** key (or legacy `anon` key), never `service_role`
or a secret API key. These Vite values are public and embedded at build time.
Set the same values in the hosting project's environment and rebuild the site.
Without them kcal displays “Course reviews are coming soon” instead of a fake login.

## Behavior and checks

- Anyone can read reviews; an eligible signed-in student can create one review per
  canonical course code, with difficulty 1–5 and an optional comment up to 1,000 characters.
- Public display names are chosen by students; their email addresses are not displayed.
  Reviews show the difficulty average, number of reviews, and plain-text comments.
- Students can edit/delete only their own review. Cross-listed aliases use the
  canonical course code from kcal, so they share a review thread.
- The database enforces ownership, rating range, lengths, one-review uniqueness,
  immutable ownership/course, and server timestamps. HTML in comments renders as text.
- Course enrollment is not verified; these are student opinions, not verified
  completion records. The extension's imported course list is not proof of enrollment.
- A project administrator can remove inappropriate reviews in Supabase's table
  editor. No moderation role is entrusted to browser metadata.

Before opening to students: sign in with a real `@krea.ac.in` Google account,
publish/edit/delete a review, then test a second account and a non-Krea account.
Confirm the second account cannot edit the first account's row using the Data API.
These live OAuth checks require the project and Google configuration above.
