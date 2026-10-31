import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchCanvasCourse, parseCanvasImport, mergeCanvasCourses, parseCanvasTerm, groupCanvasCourses } from '../src/lib/canvasImport.ts';
import { destinationUrl, importUrl } from '../extensions/canvas-import/transfer.js';
import { validateReview, summarizeReviews } from '../src/lib/features/reviews/model.ts';

const catalogue = [
  { code: 'COMP201', codes: ['COMP201', 'DATA201'], title: 'Programming & Problem Solving' },
  { code: 'MATH201', codes: ['MATH201'], title: 'Linear Algebra' },
  { code: 'MATH202', codes: ['MATH202'], title: 'Calculus' },
  { code: 'PHYS202', codes: ['PHYS202'], title: 'Calculus' }
];
const payload = { version: 2, source: 'https://canvas.krea.edu.in', courses: [{ name: 'DATA-201 Programming', term: '2026 T2', enrollment: 'current' }] };

test('cross-listed and spaced codes match canonical courses, without substring guesses', () => {
  assert.deepEqual(matchCanvasCourse(payload.courses[0], catalogue), ['COMP201']);
  assert.deepEqual(matchCanvasCourse({ name: 'COMP 201 – section 1', term: '' }, catalogue), ['COMP201']);
  assert.deepEqual(matchCanvasCourse({ name: 'XCOMP2010', term: '' }, catalogue), []);
  assert.deepEqual(matchCanvasCourse({ name: 'Programming and Problem Solving', term: '' }, catalogue), ['COMP201']);
  assert.deepEqual(matchCanvasCourse({ name: 'Calculus', term: '' }, catalogue), ['MATH202', 'PHYS202']);
  assert.deepEqual(matchCanvasCourse({ name: 'COMP201 / MATH201', term: '' }, catalogue), ['COMP201', 'MATH201']);
  // Krea's Canvas names: term-prefixed, pipe-joined cross-listings
  assert.deepEqual(matchCanvasCourse({ name: '2023-24-T2/T5/T8/PT2-DATA201-ICT(G)-Programming (3-Credits)', term: '' }, catalogue), ['COMP201']);
  assert.deepEqual(matchCanvasCourse({ name: 'MATH202|PHYS202 - Calculus (4-Credits) (R)', term: '' }, catalogue), ['MATH202', 'PHYS202']);
});

test('import parsing validates shape, bounds, source, duplicates and ignores extra fields', () => {
  assert.deepEqual(parseCanvasImport(JSON.stringify({ ...payload, token: 'not accepted', courses: [...payload.courses, ...payload.courses] })), payload);
  for (const value of [null, {}, { ...payload, version: 3 }, { ...payload, source: 'https://evil.example' },
    { ...payload, courses: [{ name: 'X', term: '' }] }, { ...payload, courses: [{ name: 'X', term: '', enrollment: 'someday' }] },
    { ...payload, courses: [] }, { ...payload, courses: [{ name: {}, term: '' }] },
    { ...payload, courses: [{ name: 'a'.repeat(501), term: '' }] },
    { ...payload, courses: Array(201).fill(payload.courses[0]) }]) {
    assert.throws(() => parseCanvasImport(JSON.stringify(value)));
  }
  assert.throws(() => parseCanvasImport('{'));
  assert.throws(() => parseCanvasImport('x'.repeat(160001)));
});

test('version 1 exports from older extension builds read as current enrollments', () => {
  const v1 = { version: 1, source: 'https://canvas.krea.edu.in', courses: [{ name: 'DATA-201 Programming', term: '2026 T2' }] };
  assert.deepEqual(parseCanvasImport(JSON.stringify(v1)), payload);
});

test('term labels give an academic-year start and trimester, or nothing', () => {
  const cases = {
    'SIAS AY 2023-24 - Trimester 1 / 4 / 7 / 10': [2023, 1], 'SIAS AY 2025-26 - Trimester 3 / 6 / 9 / ...': [2025, 3],
    '2025-26 T2': [2025, 2], 'AY 2025-2026 Term 3': [2025, 3], 'Trimester 1, 2024\u201325': [2024, 1],
    '25_T2': [2025, 2], '2026 T1': [2026, 1], 'T3 2026-27': [2026, 3], 'term-2 25-26': [2025, 2]
  };
  for (const [label, [startYear, trim]] of Object.entries(cases)) assert.deepEqual(parseCanvasTerm(label), { startYear, trim }, label);
  for (const label of ['', 'Default Term', 'Winter 2025', '2025-26', 'T4 2025-26', 'Batch 2025']) assert.equal(parseCanvasTerm(label), null, label);
});

test('rows group by term: past, current, future, and readable terms in date order', () => {
  const groups = groupCanvasCourses([
    { name: 'A', term: '2026-27 T1', enrollment: 'current' },
    { name: 'B', term: '2025-26 T3', enrollment: 'past' },
    { name: 'C', term: 'Default Term', enrollment: 'past' },
    { name: 'D', term: '2024-25 T1', enrollment: 'past' },
    { name: 'E', term: '2025-26 T3', enrollment: 'past' },
    { name: 'F', term: '2026-27 T2', enrollment: 'future' }
  ]);
  assert.deepEqual(groups.map((g) => [g.term, g.rows]), [
    ['2024-25 T1', [3]], ['2025-26 T3', [1, 4]], ['Default Term', [2]], ['2026-27 T1', [0]], ['2026-27 T2', [5]]
  ]);
});

test('imports preserve existing and hidden-year placements, append once, and never mutate input', () => {
  const existing = { '2-1': ['COMP201'], '2-2': ['MATH201'], '5-1': ['PHYS202'] };
  const result = mergeCanvasCourses(existing, ['COMP201', 'PHYS202', 'MATH202', 'MATH202'], '2-2');
  assert.deepEqual(result.added, ['MATH202']);
  assert.deepEqual(result.placements, { '2-1': ['COMP201'], '2-2': ['MATH201', 'MATH202'], '5-1': ['PHYS202'] });
  assert.deepEqual(existing['2-2'], ['MATH201']);
  assert.deepEqual(mergeCanvasCourses(result.placements, ['MATH202'], '3-1').added, []);
});

test('transfer uses a fragment, strips existing query/hash, and rejects unsafe destinations', () => {
  const url = new URL(importUrl('https://kcal.example/?old=1#old', payload));
  assert.equal(url.search, '');
  assert.deepEqual(parseCanvasImport(decodeURIComponent(url.hash.slice('#canvas-import='.length))), payload);
  assert.equal(destinationUrl('http://localhost:5173/').origin, 'http://localhost:5173');
  for (const bad of ['javascript:alert(1)', 'http://kcal.example', 'https://user:pass@kcal.example', 'https://canvas.krea.edu.in', 'https://krea.instructure.com/', '/relative']) {
    assert.throws(() => destinationUrl(bad));
  }
});

test('reviews validate ratings and text and compute difficulty, not approval stars', () => {
  assert.equal(validateReview('Student', 3, ''), null);
  for (const n of [0, 6, 2.5, NaN]) assert.ok(validateReview('Student', n, ''));
  assert.ok(validateReview(' ', 3, ''));
  assert.ok(validateReview('a'.repeat(61), 3, ''));
  assert.ok(validateReview('Student', 3, 'x'.repeat(1001)));
  assert.deepEqual(summarizeReviews([]), { count: 0, average: null });
  assert.deepEqual(summarizeReviews([{ difficulty: 1 }, { difficulty: 5 }]), { count: 2, average: 3 });
});
