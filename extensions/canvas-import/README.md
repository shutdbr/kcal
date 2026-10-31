# kcal Krea course and grade importer · 0.3.0

A local, click-triggered extension for:

- **Krea Exam → My Mark List:** https://oe.krea.edu.in/krea/my_mark/
- **Canvas → All Courses:** https://canvas.krea.edu.in/courses or
  https://krea.instructure.com/courses

## Install or update

Download `static/downloads/kcal-canvas-extension.zip`, unzip it, and install:

- Chrome / Chromium / Brave / Edge: Extensions → Developer mode → Load unpacked.
- Firefox: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on →
  `manifest.json`. Temporary installs last until Firefox restarts.

For an existing installation, replace the extracted files and **reload the
extension**. Check that its version is **0.3.0**. Store publication/signing has not
been performed. Rebuild the ZIP with `npm run extension:package` after edits.

## Use

1. Sign in to Krea Exam normally and open **My Mark List**.
2. Open the extension and choose **Read this page locally**.
3. Review the results in the popup. Enter the address of the kcal site you trust.
4. Choose **Review in kcal**, or **Save course list as a file** to import later.
5. In kcal, choose **Save mark list on this device** to keep every original
   attempt locally. Optionally review catalogue matches and copy selected
   courses and grades onto the board.

Settings → **import courses & grades** can open an export or reopen the locally
saved mark list. Canvas still imports current, past and future enrollment tables.
Older Canvas export files remain supported.

## Local processing and permissions

The extension reads the currently open page only when you click. It makes no API
requests or background uploads. It does not read passwords, cookies, login tokens,
student names, emails, roll numbers, profile photos, or the page's scripts.

- `activeTab` and `scripting` allow a one-time read of the selected tab. Both the
  popup and injected reader check the exact origin and page path.
- `storage` remembers only the kcal destination address locally. Results stay in
  popup memory until you transfer or download them.
- No permanent host permissions, content scripts, service worker, tracking,
  remote code or background syncing.
- The exam reader copies only course codes, titles, ordinal terms, grades and
  credits from `.mm-table` inside each term section. Canvas copies names and terms.
- **Review in kcal** passes data to the chosen kcal site in a URL fragment,
  which is not sent in the HTTP request. kcal clears the fragment on arrival.
  The destination page can read it, so use your own trusted kcal address.
- A downloaded JSON file contains personal academic results. The full imported
  mark list is stored only in this browser and excluded from cloud plan snapshots.
  If you copy grades to your board and explicitly choose **Save to account**,
  those board grades are included in the Supabase cloud copy. Nothing uploads
  automatically when importing.

This is a minimal-permission design, not a claim that any software is risk-free.

## Matching and repeated courses

Term numbers map directly to years/trimesters: Term 4 → Year 2 T1, Term 10 → Year
4 T1. Missing terms do not shift later results. Every repeated attempt is kept in
the local mark list, including U and I grades and courses absent from the catalogue.

Historical codes can be reused, so automatic exam matches require identical
normalized titles and credits. Unmatched results remain in the local record;
students can select a catalogue match explicitly. Credit mismatches are shown and
excluded from board copying. The board supports one placement/grade per course,
so the latest selected attempt is used. Existing placements and grades are kept
unless the user explicitly opts to replace grades. Audited courses keep their status.

Planner GPA estimates may differ from the portal. The extension does not infer
unpublished grades, recreate the official transcript, or change the grading scale.

## Verification

`tests/fixtures/exam-mark-list.html` contains synthetic results with the provided
page structure, including missing terms and retakes. Browser tests cover extraction,
rejected origins/layouts, local review, persistence and grade copying. A live
signed-in portal and installed-extension smoke test is still recommended after
portal layout changes. No student HTML/profile data is checked into this repository.
