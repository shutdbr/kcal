#!/usr/bin/env python3
"""Scrape major/minor/concentration requirements from the Krea SIAS
subject pages (https://krea.edu.in/sias/<subject>-at-krea/) into
misc/scraped_programmes.json — a RAW artifact: course titles, rule
sentences and credit tables exactly as the site states them, with no
interpretation. generate.py turns it into requirements.json.

This only needs to run when the university edits its pages. Fetched
HTML is cached in misc/.scrape_cache/ (delete it to force a refetch),
so re-runs don't touch the network at all.

The pages are Elementor-built: the "Programme Structure" section
(#course-structure) holds one tab per track (4 Year Single Major,
3-Year Minor, ...) and each tab holds columns of
  <p><strong>rule text</strong></p>  followed by  <ul> of course titles
(economics drops bare <ul>s, sociology uses <br>-separated <p>s).
The "Graduation Requirements" section (#graduation) holds wpDataTables
credit tables.

Usage (bs4 + requests needed):
    nix-shell -p python3Packages.beautifulsoup4 python3Packages.requests \
        --run "python3 misc/scrape_programmes.py"
"""
import json
import os
import re
import sys
import time
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

from common import PROGRAMME_PAGE_SLUGS, clean

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_PATH = os.path.join(HERE, "scraped_programmes.json")
CACHE_DIR = os.path.join(HERE, ".scrape_cache")

BASE = "https://krea.edu.in/sias/"
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")


def widget_groups(scope):
    """Walk <p>/<ul> elements in document order and pair each 'rule'
    paragraph ("Any three of the methodology courses below") with the
    list of course titles that follows. A list with no preceding rule
    becomes a rule-less group (the 'Elective courses' tabs are plain
    lists). Deliberately not scoped to Elementor widget wrappers —
    some pages (economics) drop bare <ul>s straight into the column."""
    groups = []
    pending_rule = None

    def add_items(lines):
        items = []
        for txt in lines:
            # the site sometimes splits one title across two bullets
            # ("Security: Technology," / "Privacy and Ethics") —
            # a trailing comma means continuation
            if items and items[-1].endswith(","):
                items[-1] += " " + txt
            else:
                items.append(txt)
        return items

    for el in scope.find_all(["p", "ul", "ol"]):
        if el.find_parent(["ul", "ol"]):
            continue  # part of an outer list already handled
        if el.name in ("ul", "ol"):
            items = add_items(txt for li in el.find_all("li")
                              if (txt := clean(li.get_text(" "))))
            if items:
                groups.append({"rule": pending_rule, "courses": items})
                pending_rule = None
            continue
        # WordPress wraps each tab's embedded layout in a literal <p>;
        # html.parser keeps the whole block inside it, so a p holding
        # block elements is a wrapper artifact, not a real paragraph
        if el.find(["div", "section", "table", "ul", "ol"]):
            continue
        # paragraph: sociology lists electives as one <p> with <br>
        # separators, so a multi-line <p> is a course list, not a rule
        # (split only on <br> — raw source newlines are just wrapping)
        for br in el.find_all("br"):
            br.replace_with("\x00")
        lines = [clean(x) for x in el.get_text(" ").split("\x00") if clean(x)]
        if not lines:
            continue
        if len(lines) > 1:
            if re.search(r"\bbelow\b|:$", lines[0], re.I):
                if pending_rule:
                    groups.append({"rule": pending_rule, "courses": []})
                pending_rule = lines.pop(0)
            groups.append({"rule": pending_rule, "courses": add_items(lines)})
            pending_rule = None
            continue
        if pending_rule:  # two rules in a row: keep the first as a note
            groups.append({"rule": pending_rule, "courses": []})
        pending_rule = lines[0]
    if pending_rule:
        groups.append({"rule": pending_rule, "courses": []})
    return groups


def parse_tables(scope):
    """All tables inside scope as raw rows of cell text (colspans noted
    inline so merged headers stay readable)."""
    tables = []
    for table in scope.find_all("table"):
        rows = []
        for tr in table.find_all("tr"):
            row = []
            for td in tr.find_all(["td", "th"]):
                txt = clean(td.get_text(" "))
                span = int(td.get("colspan") or 1)
                row.append(txt)
                row.extend([""] * (span - 1))  # keep columns aligned
            if any(row):
                rows.append(row)
        if rows:
            tables.append(rows)
    return tables


def parse_page(html):
    soup = BeautifulSoup(html, "html.parser")
    out = {"tracks": {}, "credit_tables": []}

    structure = soup.find(id="course-structure")
    if structure is not None:
        tabs_widget = structure.select_one("div.elementor-widget-tabs")
        if tabs_widget is not None:
            titles = {}
            for t in tabs_widget.select("div.elementor-tab-desktop-title"):
                titles[t.get("data-tab")] = clean(t.get_text(" "))
            for content in tabs_widget.select("div.elementor-tab-content"):
                name = titles.get(content.get("data-tab"))
                if not name or name in out["tracks"]:
                    continue
                out["tracks"][name] = {"groups": widget_groups(content)}
                tables = parse_tables(content)
                if tables:
                    out["tracks"][name]["tables"] = tables

    graduation = soup.find(id="graduation")
    if graduation is not None:
        out["credit_tables"] = parse_tables(graduation)
    return out


def fetch(session, slug, url):
    path = os.path.join(CACHE_DIR, slug + ".html")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    r = session.get(url, timeout=30)
    r.raise_for_status()
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(r.text)
    time.sleep(1)  # be polite
    return r.text


def main():
    session = requests.Session()
    session.headers["User-Agent"] = UA

    result = {
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "subjects": {},
    }
    failures = []
    for slug, subject in PROGRAMME_PAGE_SLUGS.items():
        url = BASE + slug + "/"
        try:
            html = fetch(session, slug, url)
        except Exception as e:
            failures.append((subject, url, str(e)))
            print(f"FAIL  {subject:<22} {url} ({e})", file=sys.stderr)
            continue
        parsed = parse_page(html)
        parsed["url"] = url
        result["subjects"][subject] = parsed
        n_courses = sum(len(g["courses"])
                        for t in parsed["tracks"].values() for g in t["groups"])
        print(f"ok    {subject:<22} {len(parsed['tracks'])} tracks, "
              f"{len(parsed['credit_tables'])} credit tables, "
              f"{n_courses} course mentions")

    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=1)
    print(f"\nwrote {OUT_PATH} ({len(result['subjects'])}/{len(PROGRAMME_PAGE_SLUGS)} subjects)")
    print("now run: python3 misc/generate.py  (builds requirements.json from this)")
    if failures:
        print(f"{len(failures)} page(s) failed — rerun or fix slugs:", file=sys.stderr)
        for subject, url, err in failures:
            print(f"  {subject}: {url} — {err}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
