# kcal

**A visual degree-plan builder for [Krea University](https://krea.edu.in) (SIAS).**

Pick a programme (single major, double major, major + minor, or major + minor +
concentration) and kcal lays out a recommended 3- or 4-year plan on a
year-by-trimester grid. Drag courses around, and it checks your plan against the
real rules — credit loads, prerequisites, when each course is actually offered,
which year it's open to, and how many audits you have left — surfacing every
issue as a plain-language hint instead of silently letting you build an
impossible schedule.

The catalogue, requirements and offering data are **scraped from the university's
own programme pages and term timetables**, not hand-typed, so the plan reflects
what's really on offer.

---

## Features

- **Programme-aware seeding.** Choosing a major fills the grid with that
  programme's required courses, spread sensibly across the years and ordered so
  prerequisites always come first. Departments that publish a recommended
  pathway (e.g. mathematics) use it verbatim.
- **The "laws."** Live hints for: the 12-credit trimester minimum, the
  16-credit recommended load and 20-credit hard cap (additional-load terms
  allowed only twice in a degree), prerequisite ordering, courses placed in a
  trimester or year they aren't offered in, the audit rules, the total-credit
  target, and the 128/176-credit programme ceilings — all per the ERP Course
  Drop Form guidelines.
- **The foundation core.** The twelve KCCS common-curriculum courses (3 credits
  each) are first-class citizens with their own colour: year 1 T1/T2 accept
  only them (four per trimester), the rest spread across years 1–2, and
  Engaging with the Environment sits in year 3. The `kccs` catalogue filter
  shows the core on its own.
- **Your plan vs the ideal path.** One switch flips between your own plan
  (autosaved locally as you edit) and a read-only preview of the recommended
  path — with a single "use this plan" button to adopt it.
- **Drag and drop** a course anywhere on the grid (it snaps to the nearest
  slot), or into a zoomed single-trimester view that draws each course at its
  true credit footprint. Courses fly between the catalogue and the grid.
- **Choice pools.** Where a programme says "any three of these five
  methodology courses" (history), the choices are spelled out in the sidebar.
- **Substitutes.** Interchangeable-but-not-cross-listed courses (Proofs & Ideas
  ⇄ Discrete Mathematics ⇄ Mathematical Foundations of Data Science; Linear
  Algebra ⇄ Introduction to Linear Algebra) are treated as one requirement.
- **Multi-programme accents.** On a double major / major + minor, a subtle
  coloured stripe tells apart which programme each course belongs to.

## Tech stack

- [SvelteKit](https://kit.svelte.dev/) + [Svelte 5](https://svelte.dev/) (runes)
- TypeScript
- SCSS (design tokens in one variables file; component-scoped styles elsewhere)
- A small stdlib-only Python data pipeline (see [Data pipeline](#data-pipeline))

## Getting started

```bash
npm install
npm run dev        # start the dev server
npm run build      # production build
npm run check      # svelte-check (types + a11y)
npm run format     # prettier
```

Open the dev URL Vite prints. Your working board autosaves locally. With Supabase
configured, Settings also provides private cloud copies and Google sign-in.

See [backend setup](docs/backend.md) and [application architecture](docs/architecture.md).

## Project structure

```
src/
├─ routes/
│  ├─ +layout.svelte          # global stylesheet
│  └─ +page.svelte            # the four-column app shell
├─ lib/
│  ├─ features/               # auth, plans and reviews: state, validation, repositories
│  ├─ infrastructure/supabase/ # shared typed client and schema contract
│  ├─ plan.svelte.ts          # scheduling state and curriculum rules
│  ├─ data.ts                 # typed access to the generated data + programme/requirement logic
│  ├─ types.ts                # shared types
│  ├─ transitions.ts          # the shared catalogue⇄grid crossfade
│  ├─ data/                   # generated JSON (courses, requirements, department, programme)
│  ├─ components/
│  │  ├─ sidebar/             # Sidebar (programme pickers), HintsPanel (stats · choices · hints), ExportBar
│  │  ├─ catalogue/           # Catalogue (search + filters), CatalogueCard
│  │  ├─ board/               # OverviewGrid (the year×trimester grid), TrimesterZoom
│  │  └─ details/             # DetailsPanel (selected-course info)
│  └─ styles/                 # _variables (design tokens), _mixins, _reset
└─ app.scss / app.html
misc/                          # the data pipeline (see below)
```

## Phone and tablet layout

At widths up to 1100px, the same planner uses three tabs: **catalogue**, **your
plan**, and **your degree**. The catalogue supports department filters and searches
course titles, cross-listed codes and lecturer names. Course details open over the
current tab, with controls to add, move, remove, audit and grade courses without
dragging. The plan stacks trimesters vertically. Settings, saved plans, Canvas
import, reviews, programme progress and hints remain available.

The desktop layout retains its resizable columns and drag-and-drop grid. Both
layouts share the same `Plan` instance and saved data.

The layout and catalogue code is split into small modules:

- `lib/catalogue.ts`: filtering, cached search text and programme ranking.
- `components/layout/`: mobile navigation and persisted desktop panel resizing.
- `components/details/CourseFaculty.svelte`: lecturer profiles and teaching history.
- `lib/focusScope.ts` and `lib/portal.ts`: overlay focus and mounting outside hidden tabs.

Run `npm run test:browser` for mobile touch workflows, responsive layout checks,
desktop dragging/resizing and Canvas import regressions. Set `KCAL_TEST_BROWSER`
to a Chromium executable when using a system browser instead of Playwright's.
