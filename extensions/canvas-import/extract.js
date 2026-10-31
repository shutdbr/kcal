// Self-contained: scripting.executeScript serializes this function into the tab,
// so nothing outside it is in scope. Reads every enrollment table on All Courses
// (current, past and future), so a student can bring in earlier trimesters too.
// Dashboard cards are an incomplete favourites list and are ignored.
// Problems come back as { error } rather than a throw: Chrome drops an injected
// function's exception and the popup would only see an empty result.
export function extractCourses() {
  // Krea's Canvas answers at both addresses; the export names the school's one
  const origins = ['https://canvas.krea.edu.in', 'https://krea.instructure.com'];
  /** @param {string | null | undefined} value */
  const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
  /** @param {Element} table */
  const columns = (table) => {
    const labels = Array.from(table.querySelectorAll('thead th'), (th) => clean(th.textContent).toLowerCase());
    return { course: labels.findIndex((l) => /^(course|subject)/.test(l)), term: labels.findIndex((l) => l.startsWith('term')) };
  };
  try {
    if (!origins.includes(location.origin) || !/^\/courses\/?$/.test(location.pathname)) {
      throw new Error('Open Krea Canvas → Courses → All Courses, then click the extension again.');
    }
    /** @type {{ enrollment: 'past' | 'current' | 'future', table: Element }[]} */
    const tables = [];
    for (const [enrollment, id] of /** @type {const} */ ([['past', 'past_enrollments_table'], ['current', 'my_courses_table'], ['future', 'future_enrollments_table']])) {
      const table = document.getElementById(id);
      if (table) tables.push({ enrollment, table });
    }
    // Canvas's ids gone (a reworded or re-themed page): any table headed
    // Course … Term, filed past or future by the heading above it
    if (!tables.length) {
      let heading = '';
      for (const node of document.querySelectorAll('h1, h2, h3, table')) {
        if (node.tagName !== 'TABLE') { heading = clean(node.textContent).toLowerCase(); continue; }
        const cols = columns(node);
        if (node.id === 'my_groups_table' || /group/.test(heading) || cols.course < 0 || cols.term < 0) continue;
        tables.push({ enrollment: /past/.test(heading) ? 'past' : /future|upcoming/.test(heading) ? 'future' : 'current', table: node });
      }
    }
    if (!tables.length) {
      throw new Error('The Courses tables are missing. Check that you are signed in and the page has finished loading.');
    }
    const courses = [];
    const seen = new Set();
    for (const { enrollment, table } of tables) {
      const cols = columns(table);
      for (const row of table.querySelectorAll('tbody tr')) {
        const cell = row.querySelector('.course-list-course-title-column') || row.children[cols.course];
        if (!cell) continue;
        const name = clean(cell.querySelector('.name')?.textContent || cell.textContent);
        const term = clean((row.querySelector('.course-list-term-column') || row.children[cols.term])?.textContent);
        if (!name) continue;
        if (name.length > 500 || term.length > 200) {
          throw new Error('A course entry is longer than expected. Please report this Canvas page layout.');
        }
        const key = `${name}\n${term}`;
        if (seen.has(key)) continue;
        seen.add(key);
        courses.push({ name, term, enrollment });
      }
    }
    if (!courses.length) throw new Error('No courses were found on the Courses page.');
    if (courses.length > 200) throw new Error('Too many courses were found. Please check the Courses page.');
    return { version: 2, source: 'https://canvas.krea.edu.in', courses };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not read the Courses page.' };
  }
}

/** Self-contained, click-triggered reader for the Office of Examinations mark list. */
export function extractMarkList() {
  try {
    if (location.origin !== 'https://oe.krea.edu.in' || !/^\/krea\/my_mark\/?$/.test(location.pathname)) {
      throw new Error('Open Krea Exam → My Mark List, then click the extension again.');
    }
    /** @param {string | null | undefined} value */
    const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const grades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'E', 'U', 'I', 'W'];
    const courses = [];
    const seen = new Map();
    for (const table of document.querySelectorAll('table.mm-table')) {
      const heading = clean(table.closest('section')?.querySelector('h3')?.textContent);
      const termMatch = heading.match(/^Term\s+(\d+)$/i);
      if (!termMatch) throw new Error('A mark-list table has no readable term. No results were imported.');
      const term = Number(termMatch[1]);
      if (term < 1 || term > 99) throw new Error('A mark-list term is outside the supported range.');
      const headers = Array.from(table.querySelectorAll('thead th'), (node) => clean(node.textContent).toLowerCase());
      const courseColumn = headers.indexOf('course');
      const gradeColumn = headers.indexOf('grade');
      const creditsColumn = headers.indexOf('credits');
      if ([courseColumn, gradeColumn, creditsColumn].some((index) => index < 0)) {
        throw new Error('The mark-list columns have changed. Expected Course, Grade and Credits.');
      }
      for (const row of table.querySelectorAll('tbody tr')) {
        const cells = row.querySelectorAll('td');
        if (!cells.length) continue;
        const cell = cells[courseColumn];
        const code = clean(cell?.querySelector('.zpm-mono')?.textContent).toUpperCase();
        // The source places the title in a separate span; do not scrape the student's profile.
        const title = clean(cell?.querySelector('span.block')?.textContent);
        const grade = clean(cells[gradeColumn]?.textContent).toUpperCase().replace(/[−–]/g, '-');
        const rawCredits = clean(cells[creditsColumn]?.textContent);
        const credits = Number(rawCredits);
        if (!/^[A-Z]{2,8}\d{3}[A-Z]?$/.test(code) || !title || title.length > 500 ||
            !grades.includes(grade) || !/^\d+(?:\.\d+)?$/.test(rawCredits) || credits <= 0 || credits > 30) {
          throw new Error(`A result in Term ${term} could not be read safely. No results were imported.`);
        }
        const item = { code, title, term, grade, credits };
        const key = `${term}:${code}`;
        const serialized = JSON.stringify(item);
        if (seen.has(key) && seen.get(key) !== serialized) throw new Error(`Conflicting results for ${code} in Term ${term}.`);
        if (!seen.has(key)) courses.push(item);
        seen.set(key, serialized);
      }
    }
    if (!courses.length) throw new Error('No published results found. Sign in and open My Mark List.');
    if (courses.length > 200) throw new Error('Too many results were found. Please report this page layout.');
    return { version: 3, source: 'https://oe.krea.edu.in', courses: courses.sort((a, b) => a.term - b.term) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not read the mark list.' };
  }
}
