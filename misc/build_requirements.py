#!/usr/bin/env python3
"""Assemble the comprehensive programme-requirements database for tracey.

This is the second half of the pipeline the scrape docstring promises:
scrape_programmes.py pulls the two sections that actually matter from
each krea.edu.in/sias/<subject>-at-krea/ page — the "Programme Structure"
tabs (one course-title list per track: 4-Year Single Major, 3-Year Minor,
...) and the "Graduation Requirements" credit tables — into
misc/scraped_programmes.json.  This script joins that against the
CSV-derived catalog (courses.json) so every website course title gets:

    course code, crosslisted codes, terms offered, eligible years,
    latest faculty, credits, course type

and normalises the credit tables into a flat per-programme schema.  The
result is one self-contained src/lib/data/requirements.json (mirrored to
kreabot) — the whole requirements picture tracey needs, nothing else.

Title -> code resolution reuses common.TitleIndex (exact, then subtitle-
stripped, then conservative fuzzy).  On top of that a "prefix" tier
strips a leading qualifier the website adds but the catalog omits
("Introduction to Machine Learning" -> "Machine Learning").  Every
inexact hit records the catalog title it matched so it can be eyeballed,
and a collision guard refuses to let two different website courses claim
the same code (Intro ML vs Principles of ML both -> COMP313): both are
downgraded to unresolved-with-suggestion instead of guessing wrong.

Titles that resolve to no catalog code are courses the university lists
but hasn't run in any CSV term yet -> reported as not_yet_offered.

Stdlib only; offline (reads JSON, no network).  Run after generate.py:
    python3 misc/build_requirements.py
"""
import json
import os
import re
import sys
from datetime import datetime, timezone

from common import DISCIPLINE_TO_SUBJECT, TitleIndex, norm_title, strip_subtitle

HERE = os.path.dirname(os.path.abspath(__file__))
TRACEY_ROOT = os.path.dirname(HERE)
KREABOT_ROOT = os.path.join(os.path.dirname(TRACEY_ROOT), "kreabot")

SCRAPED = os.path.join(HERE, "scraped_programmes.json")
COURSES = os.path.join(TRACEY_ROOT, "src", "lib", "data", "courses.json")

# leading qualifiers the website adds to a title the catalog lists plain
PREFIXES = [
    "an introduction to", "introduction to", "introductory",
    "principles of", "foundations of", "fundamentals of", "elements of",
    "essentials of", "basics of", "applied", "advanced", "intermediate",
    "topics in", "special topics in",
]
PREFIX_RE = re.compile(r"^(?:%s)\s+" % "|".join(re.escape(p) for p in PREFIXES),
                       re.I)

# site titles no matching tier can reach because the catalog names the
# course differently — (subject, norm_title) -> code, checked first
TITLE_OVERRIDES = {
    # catalogued under that term's theme, "Genre (Shakespeare on Screen)"
    ("literature", "genre in literature"): "LITT208",
    # site names the course plainly; the catalog adds a discipline suffix
    ("environmental studies", "tools and methods"): "ENVS206",  # ... in Environmental Studies
    # site uses a compact/synonymous title the matcher can't reach cleanly
    ("psychology", "qualitative approaches to psychology"): "PSYC208",  # Introduction to Qualitative Approaches in Psychology
    ("psychology", "introduction to theories in counselling"): "PSYC437",  # Introduction to Counselling Theories
    ("physics", "waves and oscillations"): "PHYS226",  # Oscillations and Waves
    ("physics", "classical field theory"): "PHYS401",  # Fundamentals of Classical Field Theory
    ("chemistry", "coordination chemistry"): "CHEM219",  # Coordination and Bio-inorganic Chemistry
    ("sociology", "social research methods qualitative"): "SOCL304",  # Qualitative Methods: ...
    ("sociology", "social research methods quantitative"): "SOCL355",  # Quantitative Research Methods ...
    ("sociology", "introduction to political sociology and anthropology"): "SOCL305",  # Introduction to Political Anthropology
    ("sociology", "sociological and anthropological theory 1"): "SOCL306",  # Introduction to Sociological and Anthropological Thought
    # site's required core lists the "I" course; the catalog names the intro
    # course differently, and the "II" sibling belongs to the pick pool
    ("political science", "indian politics 1"): "POLT202",  # Understanding Indian Politics
    ("political science", "political theory 1"): "POLT313",  # Introduction to Political Theory: Concepts and Conundrums
    # the politics core lists its two methodology courses as bare "Methods
    # I/II" — they're the cross-listed research-methods courses
    ("political science", "methods 1"): "SOCL304",  # Qualitative Methods: Researching the Social, Political and the Historical (POLT306)
    ("political science", "methods 2"): "SOCL355",  # Quantitative Research Methods in Humanities and Social Sciences (POLT355)
    # "Applied Linear Algebra" is computer science's OWN course (cross-listed
    # DATA208), not the maths department's. Stripping the lead qualifier makes
    # both it and maths' plainly-titled "Linear Algebra" reduce to the same
    # phrase, and the exact match wins — so the CS/data-science core came out
    # pointing at MATH230 and COMP208 landed in no bucket at all.
    ("computer science", "applied linear algebra"): "COMP208",
    ("data science", "applied linear algebra"): "COMP208",
}

PTYPES = [  # order matters: "double major" before "major" substring checks
    ("double major", "double_major"),
    ("single major", "single_major"),
    ("major", "single_major"),  # bare "major" column == single major
    ("minor", "minor"),
    ("concentration", "concentration"),
]

# scraper artifacts that land in a course list but aren't courses: bare
# section headings (drop them) and rule sentences (fold into the group's
# rule instead of pretending they're a course)
HEADINGS = {
    "required courses", "required course", "elective courses",
    "elective course", "electives", "elective", "required",
    "core courses", "list of electives",
    "required course work", "required coursework",
    # NB: "tools and methods" is NOT a heading — it's a real environmental-
    # studies course (ENVS206, "Tools and Methods in Environmental Studies");
    # see TITLE_OVERRIDES.
}


def classify_noncourse(title):
    t = re.sub(r"\s+", " ", title).strip().lower().rstrip(".")
    if t in HEADINGS:
        return "heading"
    if ("students get to select" in t or "cross-listed elective" in t
            or "cross listed elective" in t
            or re.match(r"^any\b.*\b(elective|credit|course|of the)\b", t)):
        return "rule"
    return None


def split_alternatives(title):
    """'Global Politics I or Comparative Politics I' -> the two choices.
    Only splits a clean two-way 'A or B' where both sides are multi-word
    (so it never chops a title that merely contains the word 'or')."""
    if re.search(r"\s+or\s+", title, re.I):
        parts = re.split(r"\s+or\s+", title, flags=re.I)
        if len(parts) == 2 and all(len(p.split()) >= 2 for p in parts):
            return [p.strip() for p in parts]
    return None


# ── credit-table normalisation ──────────────────────────────────────
def find_type(s):
    sl = s.lower()
    for needle, key in PTYPES:
        if needle in sl:
            return key
    return None


def find_dur(s):
    sl = s.lower()
    if re.search(r"\b3\b|3-year|3 year|three-year", sl):
        return "3yr"
    if re.search(r"\b4\b|4-year|4 year|four-year", sl):
        return "4yr"
    return None


def find_metric(s):
    sl = s.lower()
    if "required" in sl:
        return "required"
    if "elective" in sl:
        return "elective"
    if "total" in sl or "needed" in sl or "required for" in sl or "necessary" in sl:
        return "total"
    return None


def to_int(s):
    m = re.search(r"-?\d+", s or "")
    return int(m.group(0)) if m else None


def normalise_credits(tables):
    """Fold every Graduation-Requirements table into
    {programme_type: {duration: {total/required/elective: int}}}, plus a
    graduation_minimum[duration] if the page states one.  Handles both
    layouts seen across subjects: programme types as columns with
    duration rows (most subjects), and duration+type combined in the
    header with metric rows (psychology).  Best-effort — credits_raw is
    always kept alongside for anything this can't place."""
    out = {}
    grad_min = {}

    def put(ptype, dur, metric, val):
        if ptype and dur and metric and val is not None:
            out.setdefault(ptype, {}).setdefault(dur, {})[metric] = val

    for table in tables:
        rows = [r for r in table if any(c.strip() for c in r)]
        if not rows:
            continue
        # combined-header layout: a header cell names both a type and a
        # duration ("3-Year Single Major") -> row labels are the metrics
        combined = any(find_type(c) and find_dur(c)
                       for c in rows[0])
        if combined:
            header = rows[0]
            for row in rows[1:]:
                metric = find_metric(row[0]) or "total"
                for col in range(1, len(header)):
                    put(find_type(header[col]), find_dur(header[col]),
                        metric, to_int(row[col]) if col < len(row) else None)
            continue

        # type-columns layout: pick the row with the most type keywords as
        # the header, carry each type across the merged/blank cells to its
        # right, and read an optional Required/Elective sub-header below it
        tr = max(range(len(rows)),
                 key=lambda i: sum(bool(find_type(c)) for c in rows[i]))
        if sum(bool(find_type(c)) for c in rows[tr]) < 2:
            continue
        # graduation-minimum column (physics): a non-type header naming it
        gm_cols = {col for col, c in enumerate(rows[tr])
                   if col and "minimum" in c.lower() and "graduat" in c.lower()}

        # Each programme-type block starts at the column whose header names
        # a type; blank cells to its right (merged colspans) belong to it.
        # These tables are always in the order Single, Double, Minor,
        # Concentration, so if the header labels don't cleanly match that
        # order (biology's site typos its "Minor" column as "Major"), trust
        # column order over the labels.
        canonical = ["single_major", "double_major", "minor", "concentration"]
        starts = [(col, find_type(c)) for col, c in enumerate(rows[tr])
                  if col and c.strip() and find_type(c) and col not in gm_cols]
        raw_types = [t for _, t in starts]
        if raw_types != canonical[:len(raw_types)]:
            raw_types = canonical[:len(starts)]
        col_type = {}
        for i, (start, _) in enumerate(starts):
            end = starts[i + 1][0] if i + 1 < len(starts) else len(rows[tr])
            for c in range(start, end):
                if c not in gm_cols:
                    col_type[c] = raw_types[i]

        # Assign the metric by how many columns a type spans, rather than by
        # the Required/Elective sub-header row — that row is missing its
        # leading (rowspan-merged) cell, so its columns don't line up with
        # the data.  A type in one column is a total; a type spanning two
        # columns is (required, elective) in that order.
        col_metric = {}
        for col, ptype in col_type.items():
            run = [c for c in col_type if col_type[c] == ptype]
            run.sort()
            if len(run) == 2:
                col_metric[col] = "required" if col == run[0] else "elective"
            else:
                col_metric[col] = "total"

        # a Required/Elective sub-header sits between the type row and the
        # data rows — skip it (its cells are labels, not numbers)
        data_start = tr + 1
        if data_start < len(rows) and all(
                (not c.strip()) or find_metric(c) in ("required", "elective")
                for c in rows[data_start]):
            data_start += 1

        for row in rows[data_start:]:
            dur = find_dur(row[0])
            if not dur:
                continue
            for col, ptype in col_type.items():
                if col < len(row):
                    put(ptype, dur, col_metric[col], to_int(row[col]))
            for col in gm_cols:
                if col < len(row) and to_int(row[col]) is not None:
                    grad_min[dur] = to_int(row[col])

    if grad_min:
        out["graduation_minimum"] = grad_min

    # ── reconcile the summary total against the per-type breakdown ──
    # Two tables state each figure and the pages don't always agree:
    #   • the "Credits needed to earn a Double Major in X" summary column is
    #     per-major on most subjects but the WHOLE degree (both majors, 2x)
    #     on politics and physics — summing that across a student's two
    #     majors would double-count a whole degree,
    #   • physics states a 16-credit concentration whose own required list
    #     is 18 credits, so the total sits below its own required core.
    # The Required/Elective breakdown is per-programme by construction and
    # is what the published course lists actually add up to, so it wins.
    # Cells the page gives no breakdown for (literature/psychology
    # concentrations) keep their stated total.
    for ptype, years in out.items():
        if ptype == "graduation_minimum":
            continue
        for cell in years.values():
            parts = sum(cell[m] for m in ("required", "elective") if m in cell)
            if parts and cell.get("total") != parts:
                cell["total"] = parts
    return out


# ── title -> code resolution (TitleIndex + prefix tier) ─────────────
class Resolver:
    def __init__(self, catalog):
        self.ix = TitleIndex(catalog)
        # exact/subtitle lookup on a bare title, scoped by subject then global
        self.exact = self.ix.exact
        self.titles = self.ix.titles
        # renamed courses: the catalog title often keeps the old name in a
        # "(formerly ...)" note while the website still lists that old name
        self.former = {}  # (subject, norm_old_name) -> code, ambiguous -> None
        for code, c in catalog.items():
            for old in re.findall(
                    r"formerly(?:\s+known\s+as)?[:\s]*[\"“]?([^)\"”|]+)",
                    c["title"], re.I):
                no = norm_title(old)
                if len(no.split()) < 2:
                    continue
                for subj in (c["subject"], ""):
                    key = (subj, no)
                    self.former[key] = None if self.former.get(key, code) != code else code

        # catalog titles indexed under their lead-qualifier- and subtitle-
        # stripped form, so a website phrase that only differs by such a
        # qualifier still resolves ("Applied Linear Algebra" -> COMP208
        # "Introduction to Linear Algebra"), preferring the page's subject
        self.alt = {}  # (subject, norm_stripped_title) -> code, ambiguous -> None
        for code, c in catalog.items():
            variants = {norm_title(PREFIX_RE.sub("", c["title"], count=1)),
                        norm_title(strip_subtitle(c["title"]))}
            for nt in variants:
                if len(nt.split()) < 2:
                    continue
                for subj in (c["subject"], ""):
                    key = (subj, nt)
                    self.alt[key] = None if self.alt.get(key, code) != code else code

    def _bare(self, title, subject):
        """exact then subtitle-stripped, no fuzzy — used for the prefix
        tier so a stripped title only takes a code it matches cleanly."""
        nt = norm_title(title)
        for subj in (subject, ""):
            code = self.exact.get((subj, nt))
            if code:
                return code
        st = norm_title(strip_subtitle(title))
        if len(st.split()) >= 2:
            for subj in (subject, ""):
                code = self.ix.stripped.get((subj, st)) or self.exact.get((subj, st))
                if code:
                    return code
        return None

    def resolve(self, title, subject):
        """-> (code, match_kind, catalog_title).  match_kind is one of
        exact / override / inexact / prefix; catalog_title is set whenever
        the match isn't exact so it can be audited.  (None, None, None) if
        unmatched."""
        override = TITLE_OVERRIDES.get((subject, norm_title(title)))
        if override:
            return override, "override", self.titles.get(override)
        code, cat_title = self.ix.resolve(title, subject)
        if code:
            return code, ("exact" if cat_title is None else "inexact"), cat_title
        # renamed-course tier: the site title is a course's former name
        nt = norm_title(title)
        for subj in (subject, ""):
            code = self.former.get((subj, nt))
            if code:
                return code, "renamed", self.titles.get(code)
        # prefix tier: drop a leading qualifier and try a clean match,
        # both against plain titles and the stripped-catalog index
        stripped = PREFIX_RE.sub("", title, count=1)
        if stripped != title and len(norm_title(stripped).split()) >= 2:
            code = self._bare(stripped, subject)
            if code:
                return code, "prefix", self.titles.get(code)
        for cand in (norm_title(stripped), norm_title(title)):
            if len(cand.split()) < 2:
                continue
            for subj in (subject, ""):
                code = self.alt.get((subj, cand))
                if code:
                    return code, "prefix", self.titles.get(code)
        return None, None, None


# ── main assembly ───────────────────────────────────────────────────
def course_ref(code, site_title, kind, cat_title, catalog, alias2canon):
    """One entry in a track's course list: the website title plus, when
    the code is a real catalog course, the CSV facts tracey needs."""
    ref = {"title": site_title, "code": code, "match": kind}
    if kind and kind != "exact":
        ref["catalog_title"] = cat_title
    canon = alias2canon.get(code)
    c = catalog.get(canon) if canon else None
    if c:
        ref["code"] = canon
        ref["crosslisted_with"] = [x for x in c.get("codes", []) if x != canon]
        ref["credits"] = c.get("credits", 0)
        ref["type"] = c.get("type", "")
        ref["terms"] = c.get("terms", [])
        ref["eligible_years"] = c.get("eligible_years", [])
        ref["eligible_msc"] = c.get("eligible_msc", False)
        ref["eligible_phd"] = c.get("eligible_phd", False)
        ref["faculty"] = c.get("faculty", [])
    elif code:
        # resolved to a code with no catalog node (stub/future course)
        ref["not_yet_offered"] = True
    return ref


PTYPE_KEYS = ["single_major_3yr", "single_major_4yr", "double_major_3yr",
              "double_major_4yr", "minor_3yr", "minor_4yr", "concentration"]


def track_ptypes(name):
    """Which programme-type keys a track's lists apply to.
    '4-Year Double Major' -> ['double_major_4yr'];
    '3/4-Year Concentration' -> ['concentration'] (one key, no duration);
    'Elective courses' -> ['__electives__'] (the subject-wide pool);
    a duration-less name applies to both durations; 'Overview' -> []."""
    nl = name.lower()
    if "elective" in nl:
        return ["__electives__"]
    if "concentration" in nl:  # before minor: CS names its tab "Minor Concentration"
        return ["concentration"]
    if "double" in nl:
        base = "double_major"
    elif "single" in nl or "major" in nl:
        base = "single_major"
    elif "minor" in nl:
        base = "minor"
    else:
        return []
    durs = [d for d, pat in (("3yr", r"\b3\b|three"), ("4yr", r"\b4\b|four"))
            if re.search(pat, nl)]
    return ["%s_%s" % (base, d) for d in durs or ("3yr", "4yr")]


def classify_codes(tracks):
    """Split a subject's resolved codes three ways *per programme type*
    ({single_major_3yr: [...], minor_4yr: [...], ...}), exactly as the
    website states them: a fixed group in a track is that track's
    required core; a 'choose N from' group is a required *choice pool*
    (history's "any three of the methodology courses" counts toward its
    40 required credits, it is not a free elective); the subject-wide
    'Elective Courses' tab is elective for every programme type the page
    defines.  Required beats pick beats elective within a type.  Trusted
    over the term CSVs' noisy Required/Elective flag."""
    required, picks, elective = {}, {}, {}
    pool = []  # the Elective-courses tab

    def codes_of(group):
        out = []
        for c in group.get("courses", []):
            for r in (c["one_of"] if "one_of" in c else [c]):
                if r.get("code"):
                    out.append(r["code"])
        return out

    def add(bucket, key, codes):
        dest = bucket.setdefault(key, [])
        dest.extend(c for c in codes if c not in dest)

    for tname, td in tracks.items():
        keys = track_ptypes(tname)
        for g in td["groups"]:
            codes = codes_of(g)
            if not codes:
                continue
            if keys == ["__electives__"]:
                pool.extend(c for c in codes if c not in pool)
                continue
            for key in keys:
                add(picks if g.get("pick") else required, key, codes)

    for key in set(required) | set(picks) or set(PTYPE_KEYS):
        add(elective, key, pool)
    required = {k: sorted(v) for k, v in required.items() if v}
    picks = {k: sorted(c for c in v if c not in required.get(k, []))
             for k, v in picks.items()}
    picks = {k: v for k, v in picks.items() if v}
    elective = {k: sorted(c for c in v
                          if c not in required.get(k, []) and c not in picks.get(k, []))
                for k, v in elective.items()}
    elective = {k: v for k, v in elective.items() if v}
    return required, picks, elective


def parse_pick(rule):
    if not rule:
        return None
    m = re.search(r"\bany\s+(\w+)\b", rule, re.I)
    if not m:
        return None
    words = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
             "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}
    tok = m.group(1).lower()
    return int(tok) if tok.isdigit() else words.get(tok)


def build_subject(subject, scraped, resolver, catalog, alias2canon, subj_titles):
    """Resolve one scraped subject's tracks + credit tables into the
    output record.  Headings are dropped, rule sentences folded into the
    group rule, 'A or B' entries kept as a one_of choice, and a cross-
    track collision guard refuses any non-exact code claimed by two
    different website titles."""
    tracks_out = {}
    inexact_owner = {}    # code -> distinct site titles matched non-exactly
    required_owner = {}   # code -> those titles that sit in a required core

    def resolve1(title, required_ctx=False):
        code, kind, cat = resolver.resolve(title, subject)
        if code and kind != "exact":
            inexact_owner.setdefault(code, set()).add(norm_title(title))
            if required_ctx:
                required_owner.setdefault(code, set()).add(norm_title(title))
        return {"title": title, "code": code, "match": kind, "cat": cat}

    # first pass: turn each raw entry into an item (course / one_of), and
    # move any rule-sentence entries onto the group's rule
    for tname, tdata in scraped.get("tracks", {}).items():
        groups = []
        for g in tdata.get("groups", []):
            rule = g.get("rule")
            # a fixed (non-'pick N') group inside a Major track is the
            # degree's required core — worth preferring when a code is
            # otherwise ambiguous
            required_ctx = "Major" in tname and not parse_pick(g.get("rule"))
            extra_rules, items = [], []
            for course in g.get("courses", []):
                title = course["title"] if isinstance(course, dict) else course
                kind = classify_noncourse(title)
                if kind == "heading":
                    continue
                if kind == "rule":
                    extra_rules.append(title.strip())
                    continue
                alts = split_alternatives(title)
                if alts:
                    items.append({"one_of": [resolve1(a, required_ctx) for a in alts],
                                  "title": title})
                else:
                    items.append(resolve1(title, required_ctx))
            if extra_rules:
                rule = ". ".join(filter(None, [rule] + extra_rules))
            groups.append({"rule": rule, "pick": parse_pick(rule), "_items": items})

        # a "choose N from the courses below" heading sometimes scrapes into its
        # OWN group, separated from the course list that follows it (literature's
        # concentration: "Any four courses from the required courses …" then the
        # seven courses in the next group). Reattach the orphan pick rule to that
        # following course group so its courses read as a choice pool, not a
        # fixed required core. A generic "any N elective courses" pool has no
        # following course group and is left as-is.
        merged, carry = [], None
        for g in groups:
            if carry and g["_items"] and not g["pick"]:
                g = {**g, "rule": carry["rule"], "pick": carry["pick"]}
                carry = None
            if g["pick"] and not g["_items"]:
                carry = g
                continue
            merged.append(g)
        if carry:
            merged.append(carry)
        tracks_out[tname] = {"groups": merged}

    # a code claimed by two different site titles is ambiguous; if exactly
    # one of the claimants is a required-core course, let it keep the code
    # (Introduction to Machine Learning -> COMP313) and drop the others,
    # otherwise drop them all
    ambiguous = {}  # code -> the one title allowed to keep it, or None
    for code, titles in inexact_owner.items():
        if len(titles) > 1:
            req = required_owner.get(code, set())
            ambiguous[code] = next(iter(req)) if len(req) == 1 else None

    review, not_yet = [], {}

    def note_unresolved(title):
        key = norm_title(title)
        if key not in not_yet:
            not_yet[key] = {"title": title, "suggestion": suggest(title, subject, subj_titles)}

    def finalize(item):
        # an item resolved non-exactly to an ambiguous code loses it unless
        # it's the designated winner (the required-core claimant)
        if (item.get("code") and item["match"] != "exact"
                and item["code"] in ambiguous
                and norm_title(item["title"]) != ambiguous[item["code"]]):
            if norm_title(item["title"]) not in {norm_title(x["title"]) for x in review}:
                review.append({"title": item["title"], "reason": "ambiguous",
                               "note": "multiple website courses match one code"})
            item["code"] = None
        if not item.get("code"):
            note_unresolved(item["title"])
        return course_ref(item["code"], item["title"], item["match"],
                          item["cat"], catalog, alias2canon)

    for tdata in tracks_out.values():
        for g in tdata["groups"]:
            out, claimed = [], set()
            for item in g.pop("_items"):
                if "one_of" in item:
                    out.append({"title": item["title"], "one_of":
                                [finalize(a) for a in item["one_of"]]})
                    continue
                ref = finalize(item)
                # One course, listed twice in the same pool under two names:
                # history's methodology pool carries both "Indian
                # Historiography" and "Advanced Indian Historiography", and
                # both resolve to HIST355.  A "choose three of five" that is
                # really four courses overstates the choice, so the second
                # mention is dropped and the course keeps the (exact) name it
                # is catalogued under.
                if ref.get("code"):
                    if ref["code"] in claimed:
                        continue
                    claimed.add(ref["code"])
                out.append(ref)
            g["courses"] = out

    return {
        "tracks": tracks_out,
        "review": review,
        "not_yet_offered": sorted(not_yet.values(), key=lambda x: x["title"]),
    }


def suggest(title, subject, subj_titles):
    """Nearest catalog course (same subject) for an unresolved title, so a
    human can confirm or dismiss it — never auto-applied."""
    import difflib
    nt = norm_title(title)
    cands = subj_titles.get(subject, [])
    close = difflib.get_close_matches(nt, [t for t, _ in cands], n=1, cutoff=0.6)
    if close:
        code = dict(cands)[close[0]]
        return {"code": code, "title": None}  # title filled by caller below
    return None


def main():
    catalog = json.load(open(COURSES, encoding="utf-8"))["courses"]
    alias2canon = {}
    for canon, c in catalog.items():
        for code in c.get("codes", [canon]):
            alias2canon[code] = canon
        alias2canon.setdefault(canon, canon)

    ti_catalog = {code: {"title": c["title"], "subject": c["subject"]}
                  for code, c in catalog.items()}
    resolver = Resolver(ti_catalog)

    subj_titles = {}  # subject -> [(norm_title, code)] for suggestions
    for code, c in catalog.items():
        subj_titles.setdefault(c["subject"], []).append((norm_title(c["title"]), code))

    scraped = json.load(open(SCRAPED, encoding="utf-8"))

    subject_discipline = {}
    for code, c in catalog.items():
        subject_discipline.setdefault(c["subject"], {}).setdefault(c["discipline"], 0)
        subject_discipline[c["subject"]][c["discipline"]] += 1

    out_subjects = {}
    report = []

    for subject, sd in scraped["subjects"].items():
        built = build_subject(subject, sd, resolver, catalog, alias2canon, subj_titles)
        # fill suggestion titles now that catalog is in scope
        for nyo in built["not_yet_offered"]:
            sug = nyo.get("suggestion")
            if sug and sug.get("code"):
                sug["title"] = catalog.get(alias2canon.get(sug["code"], sug["code"]),
                                           {}).get("title")
        disc = max(subject_discipline.get(subject, {"": 0}),
                   key=lambda d: subject_discipline.get(subject, {}).get(d, 0))
        required_codes, pick_codes, elective_codes = classify_codes(built["tracks"])
        out_subjects[subject] = {
            "subject": subject,
            "discipline": disc,
            "source": "website",
            "url": sd.get("url"),
            "credits": normalise_credits(sd.get("credit_tables", [])),
            "credits_raw": sd.get("credit_tables", []),
            "required_codes": required_codes,
            "pick_codes": pick_codes,
            "elective_codes": elective_codes,
            **built,
        }
        report.append((subject, built))

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources": {
            "programme_structure_and_credits": "scraped_programmes.json (krea.edu.in/sias pages)",
            "course_metadata": "courses.json (term CSVs)",
        },
        "subjects": out_subjects,
    }

    tracey_out = os.path.join(TRACEY_ROOT, "src", "lib", "data", "requirements.json")
    kreabot_out = os.path.join(KREABOT_ROOT, "src", "lib", "requirements.json")
    for path in (tracey_out, kreabot_out):
        if not os.path.isdir(os.path.dirname(path)):
            continue
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(output, fh, ensure_ascii=False, indent=1)
        print(f"wrote {path}")

    # ── report ──
    print(f"\n{len(out_subjects)} subjects assembled\n")
    print(f"{'subject':24} {'tracks':>6} {'courses':>7} {'exact':>6} "
          f"{'inexact':>7} {'unresolved':>10}")
    for subject, built in report:
        tks = built["tracks"]
        refs = []
        for t in tks.values():
            for g in t["groups"]:
                for c in g["courses"]:
                    refs.extend(c["one_of"] if "one_of" in c else [c])
        exact = sum(1 for r in refs if r.get("match") == "exact")
        inexact = sum(1 for r in refs if r.get("match") in ("inexact", "prefix", "renamed", "override"))
        unres = sum(1 for r in refs if not r.get("code"))
        print(f"{subject:24} {len(tks):>6} {len(refs):>7} {exact:>6} "
              f"{inexact:>7} {unres:>10}")

    print("\nnot-yet-offered / unresolved website courses (no CSV code):")
    for subject, built in report:
        if built["not_yet_offered"]:
            names = ", ".join(n["title"] for n in built["not_yet_offered"])
            print(f"  {subject}: {names}")


if __name__ == "__main__":
    main()
