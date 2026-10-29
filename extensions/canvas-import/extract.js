// Self-contained: scripting.executeScript serializes this function into the tab.
// Read the current table only; dashboard cards are an incomplete favourites list.
export function extractCourses() {
  if (location.origin !== 'https://canvas.krea.edu.in' || !/^\/courses\/?$/.test(location.pathname)) {
    throw new Error('Open Krea Canvas → Courses → All Courses, then click the extension again.');
  }
  const table = document.querySelector('#my_courses_table');
  if (!table) {
    throw new Error('The current Courses table is missing. Check that you are signed in and the page has finished loading.');
  }
  const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
  const courses = [];
  const seen = new Set();
  for (const row of table.querySelectorAll('tbody tr')) {
    const cell = row.querySelector('.course-list-course-title-column');
    if (!cell) continue;
    const name = clean(cell.querySelector('.name')?.textContent || cell.textContent);
    const term = clean(row.querySelector('.course-list-term-column')?.textContent);
    if (!name) continue;
    if (name.length > 500 || term.length > 200) {
      throw new Error('A course entry is longer than expected. Please report this Canvas page layout.');
    }
    const key = `${name}\n${term}`;
    if (seen.has(key)) continue;
    seen.add(key);
    courses.push({ name, term });
  }
  if (!courses.length) throw new Error('No current courses were found. Past and future enrollments are not imported.');
  if (courses.length > 200) throw new Error('Too many courses were found. Please check the Courses page.');
  return { version: 1, source: 'https://canvas.krea.edu.in', courses };
}
