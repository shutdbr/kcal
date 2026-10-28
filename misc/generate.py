#!/usr/bin/env python3
"""Single source of truth for kreabot + kcal course data.

Parses every misc/*.csv term catalog (drop a new one in here each
trimester, no code changes needed) and writes one canonical
courses.json into both apps:
    kreabot/src/lib/courses.json   (canonical copy)
    kcal/src/lib/data/courses.json

department.json / programme.json are hand-maintained (nothing in the
CSVs can rebuild professor bios or major/minor requirements) and live
in kreabot/src/lib/ — this script just mirrors them into kcal so
both apps read the same files.

Usage: python3 misc/generate.py
"""
import csv
import glob
import json
import os
import re
import shutil
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
KCAL_ROOT = os.path.dirname(HERE)
KREABOT_ROOT = os.path.join(os.path.dirname(KCAL_ROOT), "kreabot")

NON_ANSWERS = {
    "", "none", "-", "--na--", "n/a", "na", "nil", "no", "n", "yes", "y",
    "ok", "tbd", "none.",
}

ROMAN = {"i": "1", "ii": "2", "iii": "3", "iv": "4", "v": "5", "vi": "6"}

# Course-code prefix -> full subject name, matching the keys used in
# kreabot's department.json / programme.json / SUBJECTS list. KCCS is
# the university-wide foundation (common core) curriculum — mapped to
# the pseudo-subject "core" so kcal can place and colour it, but it
# is not a major/minor. Any prefix not in this map is left unmapped
# and surfaced in review_flags instead of guessed at, so a new
# department showing up in a future CSV doesn't get silently dropped
# or misfiled.
DISCIPLINE_TO_SUBJECT = {
    "ARTS": "arts",
    "BIO": "biology", "BIOS": "biology",
    "BUSI": "business studies",
    "CHEM": "chemistry",
    "COMP": "computer science",
    "DATA": "data science",
    "ECON": "economics",
    "ENVS": "environmental studies",
    "HIST": "history",
    "KCCS": "core",
    "LIT": "literature", "LITT": "literature",
    "MATH": "mathematics",
    "PHIL": "philosophy",
    "PHYS": "physics",
    "POLT": "political science",
    "PSYC": "psychology", "PSYCH": "psychology",
    "SOCL": "sociology",
}
EXCLUDED_DISCIPLINES = set()

# The KCCS foundation courses' own CSV rows are the least consistent in the
# whole catalog — credits/eligibility cells vary or are blank per term, the
# same course is titled three different ways, and 25_T3 typos "Enviroment".
# The rules themselves are fixed university policy: every foundation course
# is 3 credits and required, taken in years 1-2 — except Engaging with the
# Environment, which is a year-3 course.
CORE_TITLES = {
    "KCCS101": "Writing and Oral Communication",
    "KCCS102": "Mathematical Reasoning",
    "KCCS103": "Creative Expression",
    "KCCS121": "Scientific Reasoning",
    "KCCS122": "Exploring the Social and the Historical",
    "KCCS123": "Philosophical Perspectives Across Cultures",
    "KCCS124": "Data Analytics",
    "KCCS131": "Literature and the Arts",
    "KCCS132": "Ethics",
    "KCCS133": "Design Thinking",
    "KCCS134": "Introduction to Computational Thinking",
    "KCCS190": "Engaging with the Environment",
}
CORE_CREDITS = 3
CORE_YEAR3 = {"KCCS190"}


def norm_title(t):
    t = t.lower().strip()
    t = re.sub(r"\(.*?\)", " ", t)
    t = t.replace("&", " and ")
    t = re.sub(r"[–—-]", " ", t)
    words = re.findall(r"[a-z0-9]+", t)
    words = [ROMAN.get(w, w) for w in words]
    while words and words[0] in ("the", "an", "a"):
        words.pop(0)
    return " ".join(words)


def find_col(header, *needles):
    for i, h in enumerate(header):
        hl = h.lower()
        if all(n in hl for n in needles):
            return i
    return None


def find_year_col(header, year):
    """Find the 'Year N' eligibility column, careful not to match
    'MSc Year 1' / 'PhD Year 1' which contain the same substring."""
    for i, h in enumerate(header):
        n = re.sub(r"\s+", "", h).lower()
        if n.startswith(f"year{year}") and not n.startswith(("msc", "phd")):
            return i
    return None


def find_msc_phd_col(header, kind, year=None):
    for i, h in enumerate(header):
        n = re.sub(r"\s+", "", h).lower()
        if year is not None:
            if n == f"{kind}year{year}":
                return i
        elif n.startswith(f"{kind}year"):
            return i
    return None


def cell(row, idx):
    if idx is None or idx >= len(row):
        return ""
    return row[idx].strip()


def is_yes(v):
    return v.strip().upper() == "YES"


def parse_codes(raw, prefixes=None):
    out = []
    for m in re.finditer(r"\b([A-Z]{3,4})\s*-?\s*(\d{3})\b", raw):
        code = m.group(1) + m.group(2)
        if prefixes is None or m.group(1) in prefixes:
            if code not in out:
                out.append(code)
    return out


def build():
    files = sorted(glob.glob(os.path.join(HERE, "*.csv")))
    courses = {}          # alias code -> dict
    prereq_rows = []      # (canon, ptext, ftext)

    for path in files:
        term = os.path.splitext(os.path.basename(path))[0]
        with open(path, encoding="utf-8", errors="replace") as fh:
            rows = list(csv.reader(fh))
        header = rows[0]
        ci = find_col(header, "course code")
        ti = find_col(header, "course title")
        cri = find_col(header, "credits")
        tyi = find_col(header, "course type")
        pi = find_col(header, "prerequisites to enrol")
        fi = find_col(header, "prerequisites for any future")
        if fi is None:
            fi = find_col(header, "prerequisites for any")
        di = find_col(header, "description")
        fai = find_col(header, "faculty")
        rfi = find_col(header, "required for")
        year_cols = {y: find_year_col(header, y) for y in (1, 2, 3, 4)}
        msc_col = find_msc_phd_col(header, "msc")
        phd_cols = [find_msc_phd_col(header, "phd", y) for y in (1, 2, 3, 4)]
        phd_cols = [c for c in phd_cols if c is not None]
        if not phd_cols:
            single_phd = find_msc_phd_col(header, "phd")
            if single_phd is not None:
                phd_cols = [single_phd]

        for row in rows[1:]:
            raw_code = cell(row, ci)
            title = re.sub(r"\s*\([A-Z]\)\s*$", "", cell(row, ti)).strip()
            if not raw_code or not title:
                continue
            if "dropped" in raw_code.lower() or "dropped" in title.lower():
                continue
            codes = parse_codes(raw_code)
            if not codes:
                continue
            canon = codes[0]

            eligible_years = [y for y, idx in year_cols.items() if is_yes(cell(row, idx))]
            eligible_msc = is_yes(cell(row, msc_col)) if msc_col is not None else False
            eligible_phd = any(is_yes(cell(row, idx)) for idx in phd_cols)

            for code in codes:
                c = courses.setdefault(code, {
                    "code": code,
                    "canon": canon,
                    "codes": [],
                    "title": title,
                    "discipline": re.match(r"[A-Z]+", code).group(0),
                    "credits": "",
                    "type": "",
                    "faculty_by_term": {},
                    "terms": [],
                    "eligible_years": set(),
                    "eligible_msc": False,
                    "eligible_phd": False,
                    "required_for": "",
                    "prereq_text": "",
                    "desc": "",
                })
                # Crosslist membership can drift between terms (a course
                # sometimes lists its partner codes, sometimes doesn't).
                # Once a code is established as an alias of another canon,
                # don't let a later "solo" row (canon == code) reset it to
                # its own node — only a genuine multi-code row can move it.
                if not (canon == code and c["canon"] != code):
                    c["canon"] = canon
                c["title"] = title  # later files win
                if cell(row, cri):
                    c["credits"] = cell(row, cri)
                if cell(row, tyi):
                    c["type"] = cell(row, tyi)
                fac = cell(row, fai)
                if fac:
                    # different people often teach the same course in
                    # different terms — keep faculty scoped per term so
                    # e.g. a 2024 instructor doesn't get shown alongside
                    # the 2026 one as if they co-taught it
                    term_facs = c["faculty_by_term"].setdefault(term, [])
                    if fac not in term_facs:
                        term_facs.append(fac)
                if cell(row, di) and len(cell(row, di)) > len(c["desc"]):
                    c["desc"] = cell(row, di)
                if rfi is not None and cell(row, rfi):
                    c["required_for"] = cell(row, rfi)
                if term not in c["terms"]:
                    c["terms"].append(term)
                c["eligible_years"] |= set(eligible_years)
                c["eligible_msc"] = c["eligible_msc"] or eligible_msc
                c["eligible_phd"] = c["eligible_phd"] or eligible_phd

            ptext = cell(row, pi)
            ftext = cell(row, fi)
            if ptext.lower() in NON_ANSWERS:
                ptext = ""
            if ftext.lower() in NON_ANSWERS:
                ftext = ""
            if ptext or ftext:
                prereq_rows.append((canon, ptext, ftext))
            if ptext and len(ptext) > len(courses[canon]["prereq_text"]):
                courses[canon]["prereq_text"] = ptext

    prefixes = {c["discipline"] for c in courses.values()}

    # a leading qualifier the catalog carries but a prereq mention omits
    # (or vice versa): "Applied Probability and Statistics" vs the prereq
    # text "Probability and Statistics"
    LEAD = re.compile(
        r"^(?:applied|introductory|an introduction to|introduction to|"
        r"principles of|foundations of|fundamentals of|elements of|"
        r"essentials of|basics of|advanced|intermediate)\s+", re.I)

    def strip_lead(t):
        return LEAD.sub("", t, count=1)

    def strip_sub(t):
        return re.split(r"[:–—]|\s-\s", t, maxsplit=1)[0]

    title_ix = {}   # exact norm_title -> canon
    alt_ix = {}     # lead/subtitle-stripped norm_title -> canon

    def add_ix(ix, key, canon):
        if len(key) < 6:
            return
        ix[key] = None if ix.get(key, canon) != canon else canon

    for c in courses.values():
        canon, t = c["canon"], c["title"]
        add_ix(title_ix, norm_title(t), canon)
        add_ix(alt_ix, norm_title(strip_lead(t)), canon)
        add_ix(alt_ix, norm_title(strip_sub(t)), canon)

    def match_title(seg):
        """One prereq phrase -> a course code, tolerating a missing/extra
        leading qualifier or subtitle.  Returns None rather than guess."""
        for cand in (seg, strip_lead(seg)):
            nt = norm_title(cand)
            if len(nt) < 6:
                continue
            code = title_ix.get(nt) or alt_ix.get(nt)
            if code:
                return code
        return None

    def resolve(text):
        # a phrase governed by a condition ("MATH/PHYS 061 if no prior
        # exposure to calculus", "may be waived if ...") is advice, not a
        # hard prerequisite — drop it before any code/title matching
        text = "\n".join(p for p in re.split(r"[\n;]", text)
                         if not re.search(r"\bif\b", p, re.I))
        found = parse_codes(text, prefixes)
        cleaned = re.sub(r"\(.*?\)", " ", text)
        # each newline / semicolon / numbered item is one prereq *phrase*;
        # match the whole phrase first so a multi-word title ("Design and
        # Analysis of Algorithms", "Probability and Statistics") is never
        # fractured on its internal "and".  Only if the whole phrase fails
        # to match is it treated as a list and split on ',' / 'and' / '/'.
        for phrase in re.split(r"[\n;]", cleaned):
            phrase = re.sub(r"^\s*\d+\s*[.)]\s*", "", phrase)
            phrase = re.sub(r"(or equivalent( course)?|recommended|required)\s*\.?\s*$",
                            "", phrase, flags=re.I).strip()
            if not phrase:
                continue
            code = match_title(phrase)
            if code:
                if code not in found:
                    found.append(code)
                continue
            for seg in re.split(r"[,/]| and |\bor\b", phrase):
                code = match_title(re.sub(r"^\s*\d+\s*[.)]\s*", "", seg).strip())
                if code and code not in found:
                    found.append(code)
        return found

    edges = set()
    for canon, ptext, ftext in prereq_rows:
        for code in resolve(ptext):
            if code != canon:
                edges.add((courses.get(code, {}).get("canon", code), canon))
        for code in parse_codes(ftext, prefixes):
            if code != canon:
                edges.add((canon, courses.get(code, {}).get("canon", code)))
    # Prereq edges the term CSVs over-state — the krea subject pages list these
    # as *recommended*, not hard prerequisites (the real gates are common-
    # curriculum courses we don't model). Drop them so the course isn't pulled
    # onto a plan as a forced requirement. (prereq, dependent) by canonical
    # code; kept in sync with SOFT_PREREQS in kcal/src/lib/data.ts.
    SOFT_PREREQS = {
        ("BIOS201", "BIOS241"),   # Ecology & Conservation: Life at Different Scales is recommended, not required
        ("POLT317", "POLT313"),   # backwards source row: "Political Theory II" is listed as a prereq FOR the intro course
    }
    # The other direction: edges the CSVs state but lose in transit, because
    # the cell that carries them sits in a record whose multi-line description
    # spills across lines. Added back by hand, and ONLY where the source
    # supports them — a numbered sequence is not on its own grounds to invent a
    # gate, since kcal enforces prerequisite order against real registration.
    # Kept in sync with SEQUENCE_PREREQS in kcal/src/lib/data.ts.
    SEQUENCE_PREREQS = {
        ("MATH341", "MATH442"),   # Topology 1's forward cell reads "Analysis 4, Topology II"
        ("MATH303", "MATH304"),   # Analysis 4's own column is blank; MATH341 requires 303 AND 304
    }
    edges = sorted(
        (e for e in edges | SEQUENCE_PREREQS if e[0] != e[1] and e not in SOFT_PREREQS)
    )

    # A course can't require a HIGHER-level course of its OWN department: a
    # 200-level intro (COMP246 Deep Learning) listing a 300-level course
    # (COMP313 Machine Learning), or DATA242 listing DATA302, is a backwards
    # source row. Only cross-LEVEL inversions are dropped — same-band oddities
    # (a 2xx citing another 2xx) aren't reliably backwards, since numbering
    # within a level isn't strictly sequential; fix those by hand in
    # SOFT_PREREQS if a specific one is wrong.
    def _disc(code):
        m = re.match(r"[A-Z]+", code)
        return m.group(0) if m else ""

    def _level(code):
        m = re.search(r"\d", code)
        return int(m.group(0)) if m else 0

    dropped_inversions = [e for e in edges if _disc(e[0]) == _disc(e[1]) and _level(e[0]) > _level(e[1])]
    edges = [e for e in edges if e not in set(dropped_inversions)]
    if dropped_inversions:
        print(f"dropped {len(dropped_inversions)} backwards cross-level prereq(s): "
              + ", ".join(f"{a}->{b}" for a, b in dropped_inversions))

    # canonical entries only, with all aliases attached
    nodes = {c["canon"]: c for c in courses.values() if c["code"] == c["canon"]}
    for code, c in courses.items():
        if c["canon"] in nodes:
            nodes[c["canon"]]["codes"].append(code)
    for a, b in edges:
        for code in (a, b):
            if code not in nodes:
                nodes[code] = {
                    "code": code, "canon": code, "codes": [code], "title": code,
                    "discipline": re.match(r"[A-Z]+", code).group(0),
                    "credits": "", "type": "", "faculty_by_term": {}, "terms": [],
                    "eligible_years": set(), "eligible_msc": False, "eligible_phd": False,
                    "required_for": "", "prereq_text": "", "desc": "", "stub": True,
                }

    # ── renamed courses: fold an old code into its successor ──────────
    # A renumbered course keeps its OLD code as a separate taught row from an
    # earlier term and names the new one "(Formerly known as OLDCODE ...)":
    # Global Politics I (POLT207) was POLT205, Culture, Cognition... (PSYC348)
    # was PSYC345. Left alone, the catalogue shows the course twice and a
    # prereq that still cites the old code can never be satisfied. Merge the
    # old code away and remap its prerequisite edges onto the surviving one.
    FORMER_RE = re.compile(
        r"former(?:ly)?(?:\s+known\s+as)?[:\s]*\(?([A-Z]{3,4})\s*-?\s*(\d{3})", re.I)
    rename = {}
    for canon, c in nodes.items():
        m = FORMER_RE.search(c["title"])
        if m and (m.group(1) + m.group(2)) != canon:
            rename[m.group(1) + m.group(2)] = canon

    def _final(code):
        seen = set()
        while code in rename and code not in seen:
            seen.add(code)
            code = rename[code]
        return code
    rename = {old: _final(new) for old, new in rename.items()}
    if rename:
        edges = sorted({(rename.get(a, a), rename.get(b, b)) for a, b in edges})
        edges = [e for e in edges if e[0] != e[1]]
        for old in rename:
            nodes.pop(old, None)
        print(f"merged {len(rename)} renamed code(s): "
              + ", ".join(f"{o}->{n}" for o, n in sorted(rename.items())))

    # tidy display titles: drop a trailing "(formerly/previously ...)" note so
    # the catalogue reads cleanly ("Global Politics I", not "... (Formerly
    # known as POLT205 - Global Politics in the 21st Century ...)")
    CLEAN_TITLE_RE = re.compile(r"\s*\((?:formerly|previously)\b.*$", re.I)
    for c in nodes.values():
        c["title"] = CLEAN_TITLE_RE.sub("", c["title"]).strip()

    n_linked = len({c for e in edges for c in e})
    print(f"{len(nodes)} courses, {len(edges)} prerequisite edges, "
          f"{n_linked} courses in trees, {len(prefixes)} disciplines")

    # ── standalone prereq-tree debug artifact (unchanged behavior) ──
    tree_data = {
        "courses": {k: {kk: (sorted(vv) if isinstance(vv, set) else vv)
                        for kk, vv in v.items() if kk != "canon"}
                    for k, v in sorted(nodes.items())},
        "edges": [list(e) for e in edges],
    }
    template = open(os.path.join(HERE, "course_tree_template.html"),
                    encoding="utf-8").read()
    out = template.replace("/*__DATA__*/null", json.dumps(tree_data, ensure_ascii=False))
    out_path = os.path.join(KCAL_ROOT, "course-tree.html")
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(out)
    print("wrote", out_path, "(standalone debug artifact, not linked from either app)")

    # ── app catalog: unified courses.json ──
    SKIP = re.compile(r"independent stud|capstone", re.I)
    review_flags = []

    def latest_faculty_raw(c):
        """Faculty text from the most recent term only — terms sort
        lexicographically in chronological order ("24_T1" < "26_T1")."""
        by_term = c["faculty_by_term"]
        if not by_term:
            return []
        return by_term[max(by_term)]

    def pretty_faculty(email):
        if not email or "@" not in email:
            return email
        local = email.split("@")[0]
        return " ".join(p.capitalize() for p in re.split(r"[._]", local) if p)

    STOPWORDS = {"and", "the", "van", "de"}

    def name_tokens(s):
        return {t for t in re.findall(r"[a-z]+", s.lower()) if len(t) >= 3 and t not in STOPWORDS}

    # The CSVs are wildly inconsistent about how they spell a faculty
    # member across terms — "Prathamesh Turaga", "Turaga Venkata
    # Hanumanta Prathamesh", "TVK Prathamesh", "T.V.H. Prathamesh", and
    # (finally, in 26_T1) an email — sometimes for an email that doesn't
    # even match the one on file in department.json. Email match is
    # tried first; anything else falls back to matching name tokens
    # against department.json, scoped to the course's own subject to
    # avoid cross-department false positives.
    def resolve_one(segment, subject, dept_by_email, dept_by_subject):
        segment = segment.strip()
        if not segment:
            return None
        m = re.search(r"[\w.+-]+@[\w.-]+", segment)
        if m:
            email = m.group(0).lower()
            prof = dept_by_email.get(email)
            if prof:
                return {"email": email, "name": prof["name"], "id": prof["id"]}
        else:
            email = None

        # no email, or an email that isn't the one on file in department.json
        # (the CSVs are inconsistent about this across terms) — fall back to
        # matching name tokens (this also tokenizes an unresolved email's
        # local part, e.g. "prathamesh.turaga@..." still hits "prathamesh")
        tokens = name_tokens(segment)
        if tokens:
            candidates = dept_by_subject.get(subject, [])
            scored = sorted(
                ((len(tokens & p["_tokens"]), p) for p in candidates),
                key=lambda x: x[0], reverse=True,
            )
            if scored and scored[0][0] > 0 and (len(scored) == 1 or scored[0][0] > scored[1][0]):
                prof = scored[0][1]
                return {"email": prof["email"].lower(), "name": prof["name"], "id": prof["id"]}

        if email:
            return {"email": email, "name": pretty_faculty(email), "id": None}
        return {"email": "", "name": segment, "id": None}

    def resolve_faculty(raw_values, subject, dept_by_email, dept_by_subject):
        seen_ids = set()
        seen_names = set()
        out = []
        for raw in raw_values:
            for segment in re.split(r"[,;&]|\band\b", raw, flags=re.I):
                resolved = resolve_one(segment, subject, dept_by_email, dept_by_subject)
                if not resolved:
                    continue
                dedupe_key = resolved["id"] or resolved["name"].strip().lower()
                seen = seen_ids if resolved["id"] else seen_names
                if dedupe_key in seen:
                    continue
                seen.add(dedupe_key)
                out.append(resolved)
        return out

    dept_path = os.path.join(KREABOT_ROOT, "src", "lib", "department.json")
    dept_by_email = {}
    dept_by_subject = {}
    if os.path.exists(dept_path):
        with open(dept_path, encoding="utf-8") as fh:
            dept = json.load(fh)
        for subj, profs in dept.items():
            for p in profs:
                p = {**p, "_tokens": name_tokens(p["name"])}
                if p.get("email"):
                    dept_by_email[p["email"].lower()] = p
                dept_by_subject.setdefault(subj, []).append(p)

    # stubs (a code only ever seen in someone's prereq text, never taught in
    # any term CSV — COMP215, MATH213, ...) stay in the debug tree above but
    # must not reach the apps: they'd show as placeable 0-credit courses.
    # Dropping them here also drops them from every prereqs/unlocks list.
    keep = {
        code: c for code, c in nodes.items()
        if c["discipline"] not in EXCLUDED_DISCIPLINES
        and not SKIP.search(c["title"])
        and not c.get("stub")
    }

    app = {}
    for code, c in sorted(keep.items()):
        subject = DISCIPLINE_TO_SUBJECT.get(c["discipline"], "")
        if not subject and not c.get("stub"):
            review_flags.append({
                "code": code, "title": c["title"], "discipline": c["discipline"],
                "reason": "unmapped discipline prefix — add it to DISCIPLINE_TO_SUBJECT",
            })
        try:
            credits = int(float(c["credits"])) if c["credits"] else 0
        except ValueError:
            credits = 0

        eligible_years = sorted(c["eligible_years"])
        type_parts = {p.strip() for p in c["type"].split("|") if p.strip()}
        course_type = type_parts.pop() if len(type_parts) == 1 else c["type"]
        if c["discipline"] == "KCCS":
            credits = CORE_CREDITS
            course_type = "Required"
            eligible_years = [3] if code in CORE_YEAR3 else [1, 2]
            c["title"] = CORE_TITLES.get(code, c["title"])
        num_match = re.match(r"^" + re.escape(c["discipline"]) + r"(\d{3})", c["code"])
        if num_match and num_match.group(1)[0] >= "3" and 1 in eligible_years:
            review_flags.append({
                "code": code, "title": c["title"],
                "reason": f"numbered {num_match.group(1)} but eligible_years includes 1 "
                          f"(first year) — verify against source CSV",
            })

        # every subject this course belongs to via its cross-listed codes —
        # a course listed as SOCL355|POLT355 is both a sociology and a
        # political-science course and should surface under either
        code_subjects = sorted(
            {DISCIPLINE_TO_SUBJECT.get(re.match(r"[A-Z]+", cc).group(0), "")
             for cc in set(c["codes"])} - {""}
        )
        if subject and subject not in code_subjects:
            code_subjects.append(subject)

        # which of the cross-listed codes to show a student browsing a given
        # subject: HIST235 for a historian, LITT235 for a literature student,
        # even though the canonical code is ARTS229. The canonical code goes
        # first so a same-subject alias — a renumbering like MATH316 for
        # MATH332 — never shadows the current number.
        codes_by_subject = {}
        for cc in [code] + sorted(set(c["codes"])):
            s = DISCIPLINE_TO_SUBJECT.get(re.match(r"[A-Z]+", cc).group(0), "")
            if s:
                codes_by_subject.setdefault(s, cc)

        app[code] = {
            "code": code,
            "codes": sorted(set(c["codes"])),
            "codes_by_subject": codes_by_subject,
            "title": c["title"],
            "subject": subject,
            "subjects": code_subjects or ([subject] if subject else []),
            "discipline": c["discipline"],
            "credits": credits,
            "type": course_type,
            "faculty": resolve_faculty(latest_faculty_raw(c), subject, dept_by_email, dept_by_subject),
            "terms": sorted(c["terms"]),
            "eligible_years": eligible_years,
            "eligible_msc": c["eligible_msc"],
            "eligible_phd": c["eligible_phd"],
            "required_for": c["required_for"],
            "prereq_text": c["prereq_text"],
            "description": c["desc"],
            "prereqs": sorted(a for a, b in edges if b == code and a in keep),
            "unlocks": sorted(b for a, b in edges if a == code and b in keep),
        }

    n_app_edges = sum(len(c["prereqs"]) for c in app.values())
    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_files": [os.path.basename(p) for p in files],
        "courses": app,
        "review_flags": review_flags,
    }

    kreabot_out = os.path.join(KREABOT_ROOT, "src", "lib", "courses.json")
    kcal_out = os.path.join(KCAL_ROOT, "src", "lib", "data", "courses.json")
    for out_path in (kreabot_out, kcal_out):
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(output, fh, ensure_ascii=False, indent=1)
        print(f"wrote {out_path}: {len(app)} courses, {n_app_edges} prereq links")

    # ── mirror hand-maintained files into kcal ──
    for name in ("department.json", "programme.json"):
        src = os.path.join(KREABOT_ROOT, "src", "lib", name)
        dst = os.path.join(KCAL_ROOT, "src", "lib", "data", name)
        if os.path.exists(src):
            shutil.copyfile(src, dst)
            print(f"mirrored {src} -> {dst}")

    if review_flags:
        print(f"\n{len(review_flags)} item(s) need manual review:")
        for f in review_flags:
            print(f"  {f['code']} ({f['title']}): {f['reason']}")


if __name__ == "__main__":
    build()
