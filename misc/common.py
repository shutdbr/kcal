"""Shared vocabulary for the kreabot/tracey data pipeline.

Everything here is stdlib-only so both generate.py (offline, CSVs) and
scrape_programmes.py (network, bs4) can import it.
"""
import difflib
import re

# ── canonical subject naming ────────────────────────────────────────
# Course-code prefix -> full subject name, matching the keys used in
# kreabot's department.json / programme.json / SUBJECTS list. KCCS is
# the university-wide foundation curriculum, handled separately (not
# a browsable "subject" in either app). Any prefix not in this map is
# left unmapped and surfaced in review_flags instead of guessed at,
# so a new department showing up in a future CSV doesn't get silently
# dropped or misfiled.
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
    "LIT": "literature", "LITT": "literature",
    "MATH": "mathematics",
    "PHIL": "philosophy",
    "PHYS": "physics",
    "POLT": "political science",
    "PSYC": "psychology", "PSYCH": "psychology",
    "SOCL": "sociology",
}
EXCLUDED_DISCIPLINES = {"KCCS"}

# krea.edu.in/sias/<slug>/ -> subject key (economics' slug is irregular)
PROGRAMME_PAGE_SLUGS = {
    "mathematics-at-krea": "mathematics",
    "politics-at-krea": "political science",
    "economics-at-krea-2": "economics",
    "environmental-studies-at-krea": "environmental studies",
    "sociology-and-anthropology-at-krea": "sociology",
    "computer-science-at-krea": "computer science",
    "literature-at-krea": "literature",
    "data-science-at-krea": "data science",
    "psychology-at-krea": "psychology",
    "physics-at-krea": "physics",
    "chemistry-at-krea": "chemistry",
    "biological-sciences-at-krea": "biology",
    "history-at-krea": "history",
}


def subject_of_code(code):
    m = re.match(r"[A-Z]+", code)
    return DISCIPLINE_TO_SUBJECT.get(m.group(0), "") if m else ""


# ── text normalization ──────────────────────────────────────────────
ROMAN = {"i": "1", "ii": "2", "iii": "3", "iv": "4", "v": "5", "vi": "6"}


def clean(s):
    return re.sub(r"\s+", " ", s).strip()


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


def strip_subtitle(t):
    """'Contemporary India – A History of ...' -> 'Contemporary India'."""
    return re.split(r"[:–—]|\s-\s", t, maxsplit=1)[0]


def parse_codes(raw, prefixes=None):
    out = []
    for m in re.finditer(r"\b([A-Z]{3,4})\s*-?\s*(\d{3})\b", raw):
        code = m.group(1) + m.group(2)
        if prefixes is None or m.group(1) in prefixes:
            if code not in out:
                out.append(code)
    return out


# ── fuzzy title -> catalog code matching ────────────────────────────
def _lev(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1,
                           prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


_STOP = {"a", "an", "the", "and", "of", "in", "for", "to", "into", "on"}


def _common_prefix(a, b):
    n = 0
    for ca, cb in zip(a, b):
        if ca != cb:
            break
        n += 1
    return n


def fuzzy_tokens_ok(nt_a, nt_b):
    """Guard against difflib matching titles that share most characters
    but differ in a real word ('Developmental Psychopathology' vs
    'Developmental Psychology'). Differing tokens must pair up as
    near-typos (edit distance <= 2, one a prefix of the other, or a long
    shared word-stem like 'programs'/'programming'); leftover tokens on
    only one side (dropped subtitles) are fine."""
    from collections import Counter
    ta = Counter(w for w in nt_a.split() if w not in _STOP)
    tb = Counter(w for w in nt_b.split() if w not in _STOP)
    da, db = list((ta - tb).elements()), list((tb - ta).elements())
    # a numeric token is a sequence marker (Roman numerals are normalised to
    # digits upstream): "Indian Politics I" -> "... 1", "... II" -> "... 2".
    # These must match EXACTLY — never as near-typos — or a required "Part I"
    # course silently resolves to its "Part II" sibling. So a digit only pairs
    # with the identical digit (which would already have cancelled out), and a
    # leftover unequal digit blocks the fuzzy match.
    pairs = sorted(
        ((_lev(x, y), x, y) for x in da for y in db
         if not (x.isdigit() or y.isdigit())
         and (_lev(x, y) <= 2 or x.startswith(y) or y.startswith(x)
              or _common_prefix(x, y) >= 5)),
    )
    for _, x, y in pairs:
        if x in da and y in db:
            da.remove(x)
            db.remove(y)
    return not (da and db)


class TitleIndex:
    """Resolve a website course title to a catalog code: exact
    norm_title first, then subtitle-stripped, then fuzzy — always
    preferring courses of the page's own subject. Fuzzy/stripped hits
    return the catalog title too so they can be eyeballed.

    `catalog` is {code: {"title": ..., "subject": ...}} — canonical
    entries only (one per course, aliases excluded).
    """

    def __init__(self, catalog):
        self.titles = {}      # code -> catalog title
        self.exact = {}       # (subject, norm_title) -> code
        self.stripped = {}    # (subject, stripped norm_title) -> code, ambiguous -> None
        self.by_subject = {}  # subject -> [(norm_title, code)]
        for code, c in catalog.items():
            nt = norm_title(c["title"])
            if not nt:
                continue
            self.titles[code] = c["title"]
            for subj in (c["subject"], ""):  # "" = global scope
                self.exact.setdefault((subj, nt), code)
                st = norm_title(strip_subtitle(c["title"]))
                if len(st.split()) >= 2:
                    key = (subj, st)
                    self.stripped[key] = None if self.stripped.get(key, code) != code else code
            self.by_subject.setdefault(c["subject"], []).append((nt, code))
            self.by_subject.setdefault("", []).append((nt, code))
        # global exact matches that collide across subjects are unusable
        seen = {}
        for (subj, nt), code in list(self.exact.items()):
            if subj == "" and seen.setdefault(nt, code) != code:
                del self.exact[("", nt)]

    def resolve(self, title, subject):
        """Returns (code, catalog_title_if_inexact) or (None, None)."""
        m = re.search(r"\b([A-Z]{3,4})\s*-?\s*(\d{3})\b", title)
        if m:
            return m.group(1) + m.group(2), None
        nt = norm_title(title)
        for subj in (subject, ""):
            code = self.exact.get((subj, nt))
            if code:
                return code, None
        st = norm_title(strip_subtitle(title))
        if len(st.split()) >= 2:
            for subj in (subject, ""):
                code = self.stripped.get((subj, st)) or self.exact.get((subj, st))
                if code:
                    return code, self.titles[code]
        # fuzzy within the page's own subject first, so a near-miss
        # prefers its own department's courses
        cands = self.by_subject.get(subject, [])
        close = difflib.get_close_matches(nt, [t for t, _ in cands], n=3, cutoff=0.85)
        for cand in close:
            if fuzzy_tokens_ok(nt, cand):
                code = dict(cands)[cand]
                return code, self.titles[code]
        # cross-subject fuzzy (pages list other departments' courses,
        # e.g. SOCL218 on the environmental-studies page): stricter
        # cutoff, and only if exactly one course passes the token check
        cands = self.by_subject.get("", [])
        close = difflib.get_close_matches(nt, [t for t, _ in cands], n=5, cutoff=0.9)
        lookup = dict(cands)
        codes = {lookup[c] for c in close if fuzzy_tokens_ok(nt, c)}
        if len(codes) == 1:
            code = codes.pop()
            return code, self.titles[code]
        return None, None
