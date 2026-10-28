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

Open the dev URL Vite prints. The app runs entirely client-side; your plan is
saved to `localStorage`.

## Project structure

```
src/
├─ routes/
│  ├─ +layout.svelte          # global stylesheet
│  └─ +page.svelte            # the four-column app shell
├─ lib/
│  ├─ plan.svelte.ts          # Plan class — all app state + the "laws" (single source of truth)
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
