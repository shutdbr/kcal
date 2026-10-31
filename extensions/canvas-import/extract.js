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
