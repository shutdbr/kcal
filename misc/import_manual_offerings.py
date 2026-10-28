"""Build a repeatable T2 supplement from the user's deduplicated pasted timetable.
No academic year, credits, eligibility or prerequisites are inferred from titles.
The undergraduate planner excludes graduate-only rows; the TSV retains them.
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
source = ROOT / 'misc/manual-t2-offerings.tsv'
courses = json.loads((ROOT / 'src/lib/data/courses.json').read_text())['courses']
index = {alias: code for code, c in courses.items() for alias in [code, *c.get('codes', [])]}
subjects = {'ARTS':'arts', 'BIOS':'biology', 'BUSI':'business studies', 'FINA':'business studies', 'ENTR':'business studies', 'CHEM':'chemistry', 'COMP':'computer science', 'DATA':'data science', 'ECON':'economics', 'ENVS':'environmental studies', 'HIST':'history', 'KCCS':'core', 'LITT':'literature', 'MATH':'mathematics', 'PHIL':'philosophy', 'PHYS':'physics', 'POLT':'political science', 'PSYC':'psychology', 'SOCL':'sociology'}
entries = {}
review = []
for row in csv.DictReader(source.open(), delimiter='\t'):
    codes = list(dict.fromkeys(re.findall(r'[A-Z]{3,5}\d{3}[A-Z]?', row['Code'])))
    undergraduate = [c for c in codes if int(re.search(r'\d{3}', c)[0]) < 500]
    if not undergraduate or not row['Course Title'] or row['Course Title'] == '#N/A':
        review.append({'source':row['Code'], 'reason':'graduate-only or missing title'})
        continue
    matches = list(dict.fromkeys(index[c] for c in undergraduate if c in index))
    # Do not silently collapse independently catalogued courses.
    if len(matches) > 1:
        review.append({'source':row['Code'], 'reason':'multiple existing records; marked each T2 without merging', 'matches': matches})
    targets = matches or [undergraduate[0]]
    for code in targets:
        entry = entries.setdefault(code, {'code':code, 'title':row['Course Title'], 'codes':[], 'facultyEmails':[], 'offered':[2], 'new':code not in courses})
        for alias in undergraduate:
            if len(matches) <= 1 or index.get(alias) == code:
                if alias not in entry['codes']: entry['codes'].append(alias)
                index[alias] = code
        for email in row['Faculty'].split(','):
            email = email.strip()
            if '@' in email and email not in entry['facultyEmails']: entry['facultyEmails'].append(email)
        entry['subject'] = subjects[re.match(r'[A-Z]+', code)[0]]
        entry['subjects'] = list(dict.fromkeys(subjects[re.match(r'[A-Z]+', a)[0]] for a in entry['codes']))
        entry['codesBySubject'] = {subjects[re.match(r'[A-Z]+', a)[0]]: a for a in reversed(entry['codes'])}
faculty_names = {f['email']: f['name'] for c in courses.values() for f in c.get('faculty', []) if f.get('email') and f.get('name')}
for entry in entries.values():
    entry['faculty'] = [{'email': email, 'name': faculty_names.get(email, email), 'id': None} for email in entry['facultyEmails']]
output = {'source':'User-provided timetable, T2 for all plan years; academic year unspecified.', 'courses':list(entries.values()), 'review':review}
(ROOT / 'src/lib/data/manual-offerings.json').write_text(json.dumps(output, indent=2, ensure_ascii=False)+'\n')
new = [e['code'] for e in entries.values() if e['new']]
print(f'{len(entries)-len(new)} existing courses matched; {len(new)} new courses: {", ".join(new)}')
print(json.dumps(review, indent=2))
