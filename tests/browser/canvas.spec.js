import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extractCourses } from '../../extensions/canvas-import/extract.js';
import { importUrl } from '../../extensions/canvas-import/transfer.js';

test('extracts past, current and future rows, keeps unlinked courses, and ignores nicknames and duplicate rows', async ({ page }) => {
  const html = await readFile(new URL('../fixtures/canvas-courses.html', import.meta.url), 'utf8');
  await page.route('https://canvas.krea.edu.in/courses', (route) => route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' }));
  await page.goto('https://canvas.krea.edu.in/courses');
  const payload = await page.evaluate(extractCourses);
  expect(payload.version).toBe(2);
  expect(payload.courses).toEqual([
    { name: 'OLD101 Old course', term: '2025-26 T1', enrollment: 'past' },
    { name: 'KCCS101 Untermed', term: '', enrollment: 'past' },
    { name: 'COMP 201 — Programming', term: '2026 T2', enrollment: 'current' },
    { name: 'MATH201 Linear Algebra', term: '2026 T2', enrollment: 'current' },
    { name: '<img src=x onerror=alert(1)> Unknown course', term: 'Default term', enrollment: 'current' },
    { name: 'FUT101 Future course', term: '2026-27 T3', enrollment: 'future' }
  ]);
  await page.locator('#my_courses_table').evaluate((node) => node.remove());
  expect((await page.evaluate(extractCourses)).courses?.map((c) => c.enrollment)).toEqual(['past', 'past', 'future']);
  await page.evaluate(() => document.querySelectorAll('table').forEach((node) => node.remove()));
  expect((await page.evaluate(extractCourses)).error).toContain('Courses tables are missing');
});

test('reads Krea Canvas at its instructure address, and finds tables by their headers when the ids are gone', async ({ page }) => {
  /** @param {string} text */
  const cell = (text) => `<td>${text}</td>`;
  /** @param {string} name @param {string} term */
  const row = (name, term) => `<tr>${cell('★')}${cell(`<a href="/courses/1">${name}</a>`)}${cell('')}${cell(term)}${cell('Student')}${cell('Yes')}</tr>`;
  const head = '<thead><tr><th>Favorite</th><th><a href="?sort=course">Course</a></th><th>Nickname</th><th>Term</th><th>Enrolled as</th><th>Published</th></tr></thead>';
  const html = `<h1>All Courses</h1><h2>Current Enrollments</h2><table>${head}<tbody>
    ${row('COMP201 - Mathematical Foundations of Computer Science I (4-Credits)', 'SIAS AY 2024-25 - Trimester 1 / 4 / 7 / 10')}</tbody></table>
    <h2>Past Enrollments</h2><table>${head}<tbody>${row('2023-24-T1/T4/T7/PT1-KCCS101-WOC(I)-Writing &amp; Oral Communication (I) (3-Credits)', 'SIAS AY 2023-24 - Trimester 1 / 4 / 7 / 10')}</tbody></table>
    <h2>My Groups</h2><table><thead><tr><th>Group</th><th>Course</th><th>Term</th></tr></thead><tbody><tr><td>Team</td><td>Group course</td><td>T1</td></tr></tbody></table>`;
  await page.route('https://krea.instructure.com/courses', (route) => route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' }));
  await page.goto('https://krea.instructure.com/courses');
  const payload = await page.evaluate(extractCourses);
  expect(payload.source).toBe('https://canvas.krea.edu.in');
  expect(payload.courses).toEqual([
    { name: 'COMP201 - Mathematical Foundations of Computer Science I (4-Credits)', term: 'SIAS AY 2024-25 - Trimester 1 / 4 / 7 / 10', enrollment: 'current' },
    { name: '2023-24-T1/T4/T7/PT1-KCCS101-WOC(I)-Writing & Oral Communication (I) (3-Credits)', term: 'SIAS AY 2023-24 - Trimester 1 / 4 / 7 / 10', enrollment: 'past' }
  ]);
});

test('extractor refuses other sites and Canvas dashboard', async ({ page }) => {
  await page.goto('/');
  expect((await page.evaluate(extractCourses)).error).toContain('All Courses');
  await page.route('https://canvas.krea.edu.in/', (route) => route.fulfill({ body: '<h1>Dashboard</h1>', contentType: 'text/html; charset=utf-8' }));
  await page.goto('https://canvas.krea.edu.in/');
  expect((await page.evaluate(extractCourses)).error).toContain('All Courses');
});

test('import previews escaped content, places each term in its own trimester, preserves the saved plan, and does not add duplicates', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kcal-intro-seen', '1');
    if (!localStorage.getItem('kcal-plan')) localStorage.setItem('kcal-plan', JSON.stringify({ version: 1, batchStartYear: 2025, placements: { '2-1': ['MATH201'] }, touched: true }));
  });
  const payload = { version: 2, source: 'https://canvas.krea.edu.in', courses: [
    { name: 'MATH201 Linear Algebra', term: '2026-27 T2', enrollment: 'current' },
    { name: 'KCCS101', term: '2026-27 T2', enrollment: 'current' },
    { name: '<img src=x onerror=alert(1)> Unknown course', term: '', enrollment: 'current' },
    { name: 'COMP201 Programming', term: '25_T3', enrollment: 'past' },
    { name: 'KCCS101 again', term: '25_T3', enrollment: 'past' }
  ] };
  await page.goto(importUrl('http://127.0.0.1:4173/', payload));
  const dialog = page.getByRole('dialog', { name: 'import from Canvas' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL('http://127.0.0.1:4173/');
  await expect(dialog.getByText('<img src=x onerror=alert(1)> Unknown course', { exact: true })).toBeVisible();
  await expect(dialog.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kcal-plan') ?? '{}').placements)).toEqual({ '2-1': ['MATH201'] });
  // terms are suggested from the batch: AY 2025-26 is year 1, 2026-27 year 2
  await expect(dialog.getByLabel('Trimester for 25_T3')).toHaveValue('1-3');
  await expect(dialog.getByLabel('Trimester for 2026-27 T2')).toHaveValue('2-2');
  await expect(dialog.getByLabel('Trimester for courses with no term')).toHaveValue('');
  // KCCS101 shows up in both terms; it goes in the earlier one, once
  await dialog.getByRole('button', { name: 'Add 2 new courses', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Added 2 courses across 1 trimester');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kcal-plan') ?? '{}').placements)).toEqual({ '2-1': ['MATH201'], '1-3': ['COMP201', 'KCCS101'] });
  await expect(dialog.getByRole('button', { name: 'Add 0 new courses', exact: true })).toBeDisabled();
});

test('the Canvas import opens from settings', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kcal-intro-seen', '1'));
  await page.goto('/');
  await page.getByRole('button', { name: 'settings' }).click();
  await page.getByRole('dialog', { name: 'settings' }).getByRole('button', { name: 'import from Canvas' }).click();
  await expect(page.getByRole('dialog', { name: 'settings' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'import from Canvas' })).toBeVisible();
});

test('invalid transfer reports an error without changing the plan', async ({ page }) => {
  await page.goto('/#canvas-import=%7Bbad');
  await expect(page.getByRole('alert')).toContainText('not a valid course list');
  await page.getByRole('button', { name: 'close', exact: true }).click();
});
