#!/usr/bin/env python3
"""Parse the misc/*.csv course catalogs and build course-tree.html,
a standalone visualization of per-subject prerequisite trees.

Usage: python3 misc/gen_course_tree.py
"""
import csv
import glob
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

NON_ANSWERS = {
    "", "none", "-", "--na--", "n/a", "na", "nil", "no", "n", "yes", "y",
    "ok", "tbd", "none.",
}

ROMAN = {"i": "1", "ii": "2", "iii": "3", "iv": "4", "v": "5", "vi": "6"}


def norm_title(t):
    t = t.lower().strip()
    t = re.sub(r"\(.*?\)", " ", t)
    t = t.replace("&", " and ")
    t = re.sub(r"[–—-]", " ", t)
    words = re.findall(r"[a-z0-9]+", t)
    words = [ROMAN.get(w, w) for w in words]
    # drop leading articles that vary between listings
    while words and words[0] in ("the", "an", "a"):
        words.pop(0)
    return " ".join(words)


def find_col(header, *needles):
    for i, h in enumerate(header):
        hl = h.lower()
        if all(n in hl for n in needles):
            return i
    return None


def cell(row, idx):
    if idx is None or idx >= len(row):
        return ""
    return row[idx].strip()


def parse_codes(raw, prefixes=None):
    """Extract normalized course codes like BUSI201 from free text."""
    out = []
    for m in re.finditer(r"\b([A-Z]{3,4})\s*-?\s*(\d{3})\b", raw):
        code = m.group(1) + m.group(2)
        if prefixes is None or m.group(1) in prefixes:
            if code not in out:
                out.append(code)
    return out


def build():
    """Parse every catalog CSV. Returns (nodes, edges): nodes maps a
    canonical course code to its merged record, edges are (prereq, course)
    pairs."""
    files = sorted(glob.glob(os.path.join(HERE, "*.csv")))
    courses = {}  # code -> dict
    prereq_rows = []  # (code, prereq_text, future_text, term)

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
        di = find_col(header, "description")
        fai = find_col(header, "faculty")

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
            for code in codes:
                c = courses.setdefault(code, {
                    "code": code,
                    "canon": canon,
                    "title": title,
                    "discp": re.match(r"[A-Z]+", code).group(0),
                    "credits": "",
                    "type": "",
                    "faculty": "",
                    "terms": [],
                    "prereq_text": "",
                    "desc": "",
                })
                c["canon"] = canon
                c["title"] = title  # later files win (files sorted by term)
                if cell(row, cri):
                    c["credits"] = cell(row, cri)
                if cell(row, tyi):
                    c["type"] = cell(row, tyi)
                fac = cell(row, fai)
                # later files win, but never replace a name with an email
                if fac and (not c["faculty"]
                            or "@" not in fac or "@" in c["faculty"]):
                    c["faculty"] = fac
                if cell(row, di) and len(cell(row, di)) > len(c["desc"]):
                    c["desc"] = cell(row, di)
                if term not in c["terms"]:
                    c["terms"].append(term)

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

    prefixes = {c["discp"] for c in courses.values()}
    # index of normalized titles -> canonical code (skip ambiguous)
    title_ix = {}
    for c in courses.values():
        nt = norm_title(c["title"])
        if nt in title_ix and title_ix[nt] != c["canon"]:
            title_ix[nt] = None  # ambiguous
        else:
            title_ix[nt] = c["canon"]
    title_ix = {k: v for k, v in title_ix.items() if v and len(k) >= 6}

    def resolve(text):
        """Course codes + conservative title matches from a prereq blob."""
        found = parse_codes(text, prefixes)
        # try title matches on comma/newline/semicolon-separated segments
        cleaned = re.sub(r"\(.*?\)", " ", text)
        for seg in re.split(r"[\n,;]| and |/|\bor\b", cleaned):
            seg = re.sub(r"^\s*\d+\s*\.\s*", "", seg)
            seg = re.sub(r"(or equivalent( course)?|recommended|required)\s*\.?\s*$",
                         "", seg, flags=re.I)
            nt = norm_title(seg)
            code = title_ix.get(nt)
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

    # keep only canonical entries; create stubs for referenced-but-unknown codes
    nodes = {c["canon"]: c for c in courses.values() if c["code"] == c["canon"]}
    for a, b in edges:
        for code in (a, b):
            if code not in nodes:
                nodes[code] = {
                    "code": code, "canon": code, "title": code,
                    "discp": re.match(r"[A-Z]+", code).group(0),
                    "credits": "", "type": "", "faculty": "", "terms": [],
                    "prereq_text": "", "desc": "", "stub": True,
                }
    edges = sorted(e for e in edges if e[0] != e[1])

    data = {
        "courses": {k: {kk: vv for kk, vv in v.items() if kk != "canon"}
                    for k, v in sorted(nodes.items())},
        "edges": [list(e) for e in edges],
    }

    n_linked = len({c for e in edges for c in e})
    print(f"{len(nodes)} courses, {len(edges)} prerequisite edges, "
          f"{n_linked} courses in trees, "
          f"{len(prefixes)} disciplines")

    template = open(os.path.join(HERE, "course_tree_template.html"),
                    encoding="utf-8").read()
    out = template.replace("/*__DATA__*/null",
                           json.dumps(data, ensure_ascii=False))
    out_path = os.path.join(ROOT, "course-tree.html")
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(out)
    print("wrote", out_path)

    # ── app catalog: src/lib/data/courses.json ──
    SKIP = re.compile(r"independent stud|capstone", re.I)
    keep = {
        code: c for code, c in nodes.items()
        if c["discp"] != "KCCS" and not SKIP.search(c["title"])
    }
    def pretty_faculty(f):
        if "@" not in f:
            return f
        names = []
        for email in re.findall(r"[\w.+-]+@", f):
            names.append(" ".join(p.capitalize()
                                  for p in re.split(r"[._]", email[:-1]) if p))
        return ", ".join(names)

    app = {}
    for code, c in sorted(keep.items()):
        app[code] = {
            "code": code,
            "title": c["title"],
            "discp": c["discp"],
            "credits": c["credits"],
            "type": c["type"],
            "faculty": pretty_faculty(c.get("faculty", "")),
            "terms": c["terms"],
            "desc": c["desc"],
            "prereqs": sorted(a for a, b in edges if b == code and a in keep),
            "unlocks": sorted(b for a, b in edges if a == code and b in keep),
        }
    n_app_edges = sum(len(c["prereqs"]) for c in app.values())
    json_path = os.path.join(ROOT, "src", "lib", "data", "courses.json")
    os.makedirs(os.path.dirname(json_path), exist_ok=True)
    with open(json_path, "w", encoding="utf-8") as fh:
        json.dump({"courses": app}, fh, ensure_ascii=False, indent=1)
    print(f"wrote {json_path}: {len(app)} courses, {n_app_edges} prereq links")


if __name__ == "__main__":
    build()
