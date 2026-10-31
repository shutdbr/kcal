export type CanvasEnrollment = 'past' | 'current' | 'future';
export type CanvasCourse = { name: string; term: string; enrollment: CanvasEnrollment };
export type CanvasImport = { version: 2; source: 'https://canvas.krea.edu.in'; courses: CanvasCourse[] };
type CatalogueCourse = { code: string; codes: string[]; title: string };
export const CANVAS_IMPORT_LIMIT = 160_000;
const ENROLLMENTS: readonly CanvasEnrollment[] = ['past', 'current', 'future'];

/** Version 1 exports (older extension builds) held the current table only. */
export function parseCanvasImport(text: string): CanvasImport {
  if (text.length > CANVAS_IMPORT_LIMIT) throw new Error('The course list is too large. Export the Courses page again.');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('This is not a valid course list. Export it using the kcal Canvas extension.'); }
  if (!value || (value.version !== 1 && value.version !== 2) || value.source !== 'https://canvas.krea.edu.in' ||
      !Array.isArray(value.courses) || !value.courses.length || value.courses.length > 200) {
    throw new Error('This is not a supported Krea Canvas course export.');
  }
  const seen = new Set<string>();
  const courses: CanvasCourse[] = [];
  for (const row of value.courses) {
    const enrollment = value.version === 1 ? 'current' : row?.enrollment;
    if (!row || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 500 ||
        typeof row.term !== 'string' || row.term.length > 200 || !ENROLLMENTS.includes(enrollment)) {
      throw new Error('The course list contains an invalid entry.');
    }
    const item: CanvasCourse = { name: row.name.trim(), term: row.term.trim(), enrollment };
    const key = JSON.stringify([item.name, item.term]);
    if (!seen.has(key)) courses.push(item);
    seen.add(key);
  }
  return { version: 2, source: 'https://canvas.krea.edu.in', courses };
}

/** Academic-year start and trimester from a Canvas term label, or null.
 *  Reads "2025-26 T2", "AY 2025-2026 Term 2", "Trimester 2, 2025-26" and Krea's
 *  own "25_T2" / "2025 T2". A lone year is taken as the academic year's start,
 *  as in Krea's term codes. Anything else (e.g. "Default Term") is left to the student. */
export function parseCanvasTerm(term: string): { startYear: number; trim: 1 | 2 | 3 } | null {
  const trimMatch = term.match(/(?:^|[^a-z])(?:t|term|tri|trimester)\s*[-_.]?\s*([123])(?!\d)/i);
  if (!trimMatch) return null;
  const trim = Number(trimMatch[1]) as 1 | 2 | 3;
  const full = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  const range = term.match(/(?<!\d)((?:20)?\d{2})\s*[-\u2013\u2014/]\s*((?:20)?\d{2})(?!\d)/);
  if (range && (full(range[1]) + 1) % 100 === full(range[2]) % 100) return { startYear: full(range[1]), trim };
  const four = term.match(/(?<!\d)(20\d{2})(?!\d)/);
  if (four) return { startYear: Number(four[1]), trim };
  const two = term.match(/(?<!\d)(\d{2})[\s_-]*(?:t|term|tri|trimester)\s*[-_.]?\s*[123](?!\d)/i);
  if (two) return { startYear: full(two[1]), trim };
  return null;
}

export type CanvasTermGroup = { term: string; enrollment: CanvasEnrollment; rows: number[]; parsed: ReturnType<typeof parseCanvasTerm> };

/** One group per Canvas term label, earliest first: past, current, then future
 *  enrollments; within those, terms kcal can read in date order, then the rest
 *  as Canvas listed them. `rows` index into `courses`. */
export function groupCanvasCourses(courses: readonly CanvasCourse[]): CanvasTermGroup[] {
  const groups = new Map<string, CanvasTermGroup>();
  courses.forEach((row, i) => {
    const group = groups.get(row.term);
    if (group) group.rows.push(i);
    else groups.set(row.term, { term: row.term, enrollment: row.enrollment, rows: [i], parsed: parseCanvasTerm(row.term) });
  });
  const rank = (g: CanvasTermGroup) => ENROLLMENTS.indexOf(g.enrollment);
  const when = (g: CanvasTermGroup) => (g.parsed ? g.parsed.startYear * 10 + g.parsed.trim : 0);
  return [...groups.values()].sort((a, b) =>
    rank(a) - rank(b) || Number(!a.parsed) - Number(!b.parsed) || (a.parsed && b.parsed ? when(a) - when(b) : 0));
}

const normalizedTitle = (text: string) => text.normalize('NFKC').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const normalizedCode = (text: string) => text.toUpperCase().replace(/[\s-]+/g, '');

/** Exact code/alias first, then exact normalized title. Never guess a fuzzy match. */
export function matchCanvasCourse(row: { name: string }, catalogue: readonly CatalogueCourse[]) {
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
