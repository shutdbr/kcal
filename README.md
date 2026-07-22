# tracey

**A visual degree-plan builder for [Krea University](https://krea.edu.in) (SIAS).**

Pick a programme (single major, double major, major + minor, or major + minor +
concentration) and tracey lays out a recommended 3- or 4-year plan on a
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
- **Export / import.** Download your plan as a JSON file and load it back
  later or on another machine (it also autosaves to `localStorage`).
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

The whole app is driven by one reactive `Plan` instance created in `+page.svelte`
and passed down as a prop; every derived value (course colours, hints, stats,
the filtered catalogue) flows from its state, so nothing can disagree.

## Data pipeline

All course data lives in `src/lib/data/*.json`, **generated** from sources in
`misc/` — never edit the JSON by hand. The pipeline is stdlib-only Python and,
apart from the scraper, runs offline.

Run in order:

```bash
cd misc
python3 scrape_programmes.py     # krea.edu.in programme pages → scraped_programmes.json
                                 #   (needs beautifulsoup4 + requests; caches HTML in .scrape_cache/)
python3 generate.py              # term CSVs → courses.json (catalogue, prereq graph, faculty)
python3 build_requirements.py    # scrape + courses.json → requirements.json (per-programme rules)
```

- **`generate.py`** turns the term timetables (`misc/24_T1.csv` … `26_T1.csv`)
  into the catalogue: credits, terms offered, eligible years, faculty, and the
  prerequisite graph. It merges renamed courses ("Formerly known as …"), drops
  structurally-backwards prerequisites, and keeps hand-maintained exceptions in
  `SOFT_PREREQS`.
- **`build_requirements.py`** joins the scraped **Programme Structure** tabs and
  **Graduation Requirements** credit tables against the catalogue, resolving each
  website course title to a code (with a `TITLE_OVERRIDES` table for the handful
  the fuzzy matcher can't reach). The website is the source of truth for what's
  required vs elective.
- `scraped_programmes.json` (the parsed scrape) is committed, so the second two
  steps reproduce the data without re-scraping.

The university's own numbers are trusted over the noisy per-term CSV flags: the
Graduation-Requirements credit table caps how many "required" courses actually
count, and choice pools ("any N of …") are kept distinct from free electives.

## The rules, in one place

Every planning rule lives on the `Plan` class in `plan.svelte.ts` and the
constants at the top of `data.ts`:

| Rule | Value |
| --- | --- |
| Trimester minimum | 12 credits (full-time status) |
| Trimester recommended load | 16 credits |
| Trimester hard cap | 20 credits (16–20 "additional load" terms allowed only twice per degree) |
| Total credits | at most 128 (3-year) / 176 (4-year) |
| Foundation core | all 12 KCCS courses required, 3 credits each; years 1–2 except Engaging with the Environment (year 3) |
| Year 1 T1/T2 | KCCS foundation courses only, max 4 per trimester |
| Audits | 2 per degree; 2- or 4-credit courses only; never KCCS/391/490/491 |

Credit-load issues are advisory (yellow) — a light trimester is something you
fix by adding courses, not an impossible plan. Hard errors (prerequisite order,
a course not offered in that trimester, a non-core course in year 1 T1/T2) are
red.

---

*tracey is part of the kreabot project. Course data is derived from public Krea
University pages for planning purposes and may lag the official catalogue —
always confirm with your academic advisor.*
