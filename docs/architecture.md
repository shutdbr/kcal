# Application structure

The application uses SvelteKit for the UI and Supabase Auth/Postgres for shared
persistence. The UI can be prerendered and served from a CDN; database authorization
is enforced by Postgres, not hidden buttons or frontend email checks.

| Layer          | Location                                                     | Responsibility                                                          |
| -------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Routes         | `src/routes`                                                 | Page composition, layout and browser lifecycle                          |
| UI             | `src/lib/components`                                         | Planner, catalogue, details and settings views                          |
| Authentication | `src/lib/features/auth`                                      | One shared account/session lifecycle                                    |
| Plans          | `src/lib/features/plans`                                     | Document validation, browser saves, cloud repository and cloud UI state |
| Reviews        | `src/lib/features/reviews`                                   | Review validation and database operations                               |
| Infrastructure | `src/lib/infrastructure/supabase`                            | One typed Supabase client and schema contract                           |
| Planner domain | `src/lib/plan.svelte.ts`, `data.ts`, `grades.ts`, `types.ts` | Scheduling, curriculum rules and derived state                          |
| Curriculum     | `src/lib/data`, `misc`                                       | Versioned generated data and ingestion scripts                          |
| Database       | `supabase/migrations`                                        | Versioned tables, constraints, grants and RLS policies                  |
| Verification   | `tests`                                                      | Domain/storage checks, migration tests and browser workflows            |

Feature repositories are the only place that query feature tables. Components
render state and invoke actions. Cloud state ignores stale responses after a panel
closes or the signed-in account changes. Authentication has no review-specific
eligibility logic; the review repository checks that separately.

Browser storage keys remain stable so existing users retain their plans. Local
storage errors are surfaced. Saved copies detach from live reactive data. A backup
recovers a corrupt primary autosave, and writing a recovered plan preserves that
backup.

Keep curriculum rules independent of storage. Add schema changes as new migrations,
update the typed contract and repository, then test database permissions alongside
the feature behavior. Avoid adding table queries directly to route components.

See [backend setup](backend.md) for deployment configuration and limitations.
