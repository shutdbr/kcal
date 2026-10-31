# kcal Canvas importer

A user-triggered browser extension for Krea Canvas's **All Courses** page, at
**https://canvas.krea.edu.in/courses** or **https://krea.instructure.com/courses**
(the same Canvas under two addresses).
Reads the current, past and future enrollment tables, including unstarred and
unlinked courses. Dashboard favourites are deliberately excluded. Each course
keeps its Canvas term, and kcal suggests a year and trimester per term; students
review the matches and the placement before anything is added.

## Install locally

- Chrome, Chromium, Brave, Edge: open the browser's Extensions page, enable
  **Developer mode**, choose **Load unpacked**, then select this folder.
- Firefox: open `about:debugging#/runtime/this-firefox`, choose **Load Temporary
  Add-on**, and select `manifest.json`. This lasts until Firefox restarts.
  Permanent Firefox distribution needs Mozilla signing; Chrome Web Store and
  Firefox store publication have not been performed.

To share the development build, run `npm run extension:package` in kcal and send
`static/downloads/kcal-canvas-extension.zip`. Recipients unzip it and follow the
steps above. The same download is available in kcal under **settings → import from Canvas**.

## Use

1. Sign into Krea Canvas normally and open **Courses → All Courses**.
2. Click the extension icon, then **Read my courses**.
3. Enter the kcal website address where your plan lives. For a local development
   server the usual address is `http://localhost:5173/`. Use the actual port Vite prints.
4. Click **Review in kcal**. Only do this for a kcal website you trust.
5. Review the matches, skip unmatched courses, check the year and trimester
   chosen for each Canvas term, and add the courses. Existing placements are
   kept; duplicate imports add nothing.

You can instead **Save course list as a file**, then open that JSON in kcal's
import dialog. This also works when moving the list to another browser.

## Data and permissions

- `activeTab` + `scripting`: temporarily read the current page only when invoked.
  The extractor checks the exact Krea origin and `/courses` path again in the tab.
- `storage`: remembers only the kcal destination URL. Course lists stay in popup
  memory and disappear when the popup closes.
- No cookies permission, permanent host access, password collection, Canvas API
  tokens, Google credentials, grades, student profile data, or background requests.
- Reads course names and term labels from `#my_courses_table`,
  `#past_enrollments_table` and `#future_enrollments_table`. No Canvas API calls.
- Sending opens the destination with the course list in the **URL fragment**,
  never the query string. Fragments are not sent in HTTP requests. kcal clears it
  on arrival and validates before displaying; course data is not added to the plan
  until the student confirms. The destination page can read the fragment, so the
  student must choose their trusted kcal site. This is not an authentication channel.
- Saved exports contain only the format version, Krea Canvas origin, course
  names, terms, and whether each was a past, current or future enrollment.
  Treat the file as a personal course list.

## Maintenance

The DOM selectors follow Canvas's Courses table. If the table ids disappear, it
falls back to tables headed Course … Term (skipping My Groups); if neither is
there, it reports a missing table instead of scraping arbitrary links. Errors
are returned as `{ error }` rather than thrown, because Chrome drops exceptions
from `scripting.executeScript`.
Test fixture: `tests/fixtures/canvas-courses.html`. The public fixture covers the
upstream layout; a signed-in Krea page still needs a live smoke test.

There is no build step for the extension itself. Edit the files and reload the
extension, then rebuild the ZIP before deploying kcal.
