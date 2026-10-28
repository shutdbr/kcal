# relay — the idea, in five sentences and a canvas

## The five sentence abstract

**1 · Introduction.** Students in flexible liberal-arts programmes like Krea's
SIAS assemble their own degree — a major, maybe a minor or concentration, a
common core, and electives — course by course across nine to twelve trimesters.

**2 · Related work.** Today they plan this with a patchwork of tools of varying
sophistication: the university's programme handbooks and website pages, the ERP
drop form at registration time, personal spreadsheets, screenshots of
timetables, mentor meetings, and advice from seniors; larger universities ship
degree-audit modules inside ERPs (Workday Student, PeopleSoft) that check a
plan against the catalogue.

**3 · Problem statement.** For a Krea student none of these check the plan
*while it is being made* — the handbooks and web pages are static and lag the
catalogue, spreadsheets don't know the rules, mentors don't scale, and the ERP
validates only at the moment of registration — so prerequisite gaps, credit
overloads, and courses that simply don't run in a given trimester are
discovered at registration or, worse, in the final year when they cost a
graduation delay.

**4 · Solution.** relay is a drag-and-drop degree-plan builder whose course
catalogue, prerequisite graph, and per-programme requirements are generated
from the university's own term timetables (CSV) and programme pages (scraped),
and which re-checks every placement live against the real rules — prerequisite
ordering, trimester offerings, year eligibility, the 12/16/20-credit load
rules, the KCCS foundation core, audit limits, and total-credit ceilings —
surfacing each violation as a plain-language hint on the plan itself.

**5 · Validation.** Success is measurable at registration: the number of drop-
form rejections and forced schedule rewrites for relay users versus non-users
(plus advising minutes spent per student on mechanical rule-checking), with
the internal check that every rule relay enforces is traceable to a published
university source — the same pages and guidelines the registrar applies.

## The Business Model Canvas, in brief

| Block | For relay |
| --- | --- |
| **Customer segments** | Krea SIAS students (planners); faculty mentors and the OAA (beneficiaries); later: other Indian liberal-arts universities with trimester curricula |
| **Value proposition** | You cannot accidentally build an impossible degree — the whole 3/4-year plan on one screen, checked live against the university's real rules |
| **Channels** | Word of mouth in student groups, seniors recommending to juniors, mentors during advising week |
| **Customer relationships** | Self-serve web app; no accounts, plans saved locally and shareable as files |
| **Key activities** | Per-term data refresh (drop the new timetable CSV in, rerun the pipeline), rule upkeep when policies change, catalogue accuracy fixes |
| **Key resources** | The scraped catalogue + requirements dataset, the rules engine ("the laws"), the data pipeline that rebuilds both each term |
| **Key partners** | The university (source data, ideally official blessing), student mentors, the kreabot project |
| **Cost structure** | Near-zero hosting (static client-side app); the real cost is maintainer hours each term |
| **Revenue / utility metric** | Free for students — utility is measured in adoption (share of a cohort planning on relay), registration rejections avoided, and advising hours saved; a monetary path exists in licensing the pipeline + planner to registrars at peer universities |

The canvas's honest weak spots, per the exercise: the "market" is one
university until the pipeline is generalised, and the customer-research tip
applies — the next step is not asking students *"would you use this?"* but
*"how did you plan last trimester, and what went wrong at registration?"*
