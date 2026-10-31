import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExamImport, examSlot, matchExamCourse, latestExamChoices } from '../src/lib/features/plans/exam-import.ts';
import { parseCourseImport } from '../src/lib/canvasImport.ts';
import { destinationUrl } from '../extensions/canvas-import/transfer.js';

const course = { code: 'MATH201', title: 'Analysis-I', term: 4, grade: 'U', credits: 4 };
const payload = { version: 3, source: 'https://oe.krea.edu.in', courses: [course, { ...course, term: 10, grade: 'B+' }] };

test('exam imports preserve repeated attempts and discard profile fields', () => {
  const parsed = parseCourseImport(JSON.stringify({ ...payload, student: 'Private', courses: payload.courses.map((row) => ({ ...row, email: 'private@example.invalid' })) }));
  assert.deepEqual(parsed, payload);
  assert.equal(parsed.courses.length, 2);
  assert.deepEqual(parseExamImport({ ...payload, courses: [...payload.courses, course] }), payload);
  assert.throws(() => parseExamImport({ ...payload, courses: [course, { ...course, grade: 'A' }] }), /Conflicting/);
});

test('ordinal terms keep their actual positions despite missing terms', () => {
  assert.deepEqual([1, 2, 4, 7, 10].map(examSlot), [
    { year: 1, trim: 1 }, { year: 1, trim: 2 }, { year: 2, trim: 1 }, { year: 3, trim: 1 }, { year: 4, trim: 1 }
  ]);
  assert.equal(latestExamChoices(payload.courses, ['MATH201', 'MATH201']).get('MATH201'), 1);
  assert.equal(latestExamChoices(payload.courses, ['MATH201', '']).get('MATH201'), 0);
});

test('code reuse does not cause a wrong match; matching requires title and credits', () => {
  const catalogue = [
    { code: 'MATH201', title: 'Linear Algebra', credits: 4 },
    { code: 'MATH211', title: 'Analysis I', credits: 4 },
    { code: 'MATH212', title: 'Analysis I', credits: 2 }
  ];
  assert.deepEqual(matchExamCourse(course, catalogue), ['MATH211']);
  assert.deepEqual(matchExamCourse({ ...course, title: 'Unlisted' }, catalogue), []);
});

test('invalid grades, credits, terms, origins and oversized exports fail closed', () => {
  for (const field of [{ grade: 'A++' }, { credits: -1 }, { credits: null }, { credits: 0 }, { term: 0 }, { term: 1.5 }, { title: '' }, { code: '<script>' }]) {
    assert.throws(() => parseExamImport({ ...payload, courses: [{ ...course, ...field }] }));
  }
  assert.throws(() => parseExamImport({ ...payload, source: 'https://oe.krea.edu.in.evil.test' }));
  assert.throws(() => parseExamImport({ ...payload, courses: Array(201).fill(course) }));
  assert.throws(() => destinationUrl('https://oe.krea.edu.in/krea/my_mark/'));
});
