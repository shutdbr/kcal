export type CanvasCourse = { name: string; term: string };
export type CanvasImport = { version: 1; source: 'https://canvas.krea.edu.in'; courses: CanvasCourse[] };
type CatalogueCourse = { code: string; codes: string[]; title: string };
export const CANVAS_IMPORT_LIMIT = 160_000;

export function parseCanvasImport(text: string): CanvasImport {
  if (text.length > CANVAS_IMPORT_LIMIT) throw new Error('The course list is too large. Export the current Courses table again.');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('This is not a valid course list. Export it using the kcal Canvas extension.'); }
  if (!value || value.version !== 1 || value.source !== 'https://canvas.krea.edu.in' ||
      !Array.isArray(value.courses) || !value.courses.length || value.courses.length > 200) {
    throw new Error('This is not a supported Krea Canvas course export.');
  }
  const seen = new Set<string>();
  const courses: CanvasCourse[] = [];
  for (const row of value.courses) {
    if (!row || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 500 ||
        typeof row.term !== 'string' || row.term.length > 200) throw new Error('The course list contains an invalid entry.');
    const item = { name: row.name.trim(), term: row.term.trim() };
    const key = JSON.stringify(item);
    if (!seen.has(key)) courses.push(item);
    seen.add(key);
  }
  return { version: 1, source: 'https://canvas.krea.edu.in', courses };
}

const normalizedTitle = (text: string) => text.normalize('NFKC').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const normalizedCode = (text: string) => text.toUpperCase().replace(/[\s-]+/g, '');

/** Exact code/alias first, then exact normalized title. Never guess a fuzzy match. */
export function matchCanvasCourse(row: CanvasCourse, catalogue: readonly CatalogueCourse[]) {
  const codes = new Set(Array.from(row.name.toUpperCase().matchAll(/(?<![A-Z0-9])([A-Z]{2,8})[\s-]*(\d{3}[A-Z]?)(?![A-Z0-9])/g),
    (m) => m[1] + m[2]));
  const matches = catalogue.filter((course) => [course.code, ...course.codes].some((code) => codes.has(normalizedCode(code))));
  if (matches.length) return matches.map((course) => course.code);
  const title = normalizedTitle(row.name);
  return catalogue.filter((course) => normalizedTitle(course.title) === title).map((course) => course.code);
}

/** Append only. A course already placed anywhere keeps its original slot. */
export function mergeCanvasCourses(placements: Record<string, string[]>, codes: string[], slot: string) {
  const next = Object.fromEntries(Object.entries(placements).map(([key, value]) => [key, [...value]]));
  const existing = new Set(Object.values(next).flat());
  const added: string[] = [];
  for (const code of codes) {
    if (existing.has(code)) continue;
    existing.add(code);
    added.push(code);
  }
  if (added.length) next[slot] = [...(next[slot] ?? []), ...added];
  return { placements: next, added };
}
