import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extractCourses } from '../../extensions/canvas-import/extract.js';
import { importUrl } from '../../extensions/canvas-import/transfer.js';

test('extracts current rows only, keeps unlinked courses, and ignores nicknames and duplicate rows', async ({ page }) => {
  const html = await readFile(new URL('../fixtures/canvas-courses.html', import.meta.url), 'utf8');
  await page.route('https://canvas.krea.edu.in/courses', (route) => route.fulfill({ body: html, contentType: 'text/html' }));
  await page.goto('https://canvas.krea.edu.in/courses');
  const payload = await page.evaluate(extractCourses);
  expect(payload.courses).toEqual([
    { name: 'COMP 201 — Programming', term: '2026 T2' },
    { name: 'MATH201 Linear Algebra', term: '2026 T2' },
    { name: '<img src=x onerror=alert(1)> Unknown course', term: 'Default term' }
  ]);
  await page.locator('#my_courses_table').evaluate((node) => node.remove());
  await expect(page.evaluate(extractCourses)).rejects.toThrow('current Courses table is missing');
});

test('extractor refuses other sites and Canvas dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.evaluate(extractCourses)).rejects.toThrow('All Courses');
  await page.route('https://canvas.krea.edu.in/', (route) => route.fulfill({ body: '<h1>Dashboard</h1>', contentType: 'text/html' }));
  await page.goto('https://canvas.krea.edu.in/');
  await expect(page.evaluate(extractCourses)).rejects.toThrow('All Courses');
});

test('import previews escaped content, preserves the saved plan, and does not add duplicates', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kcal-intro-seen', '1');
    if (!localStorage.getItem('kcal-plan')) localStorage.setItem('kcal-plan', JSON.stringify({ version: 1, placements: { '2-1': ['MATH201'] }, touched: true }));
  });
  const payload = { version: 1, source: 'https://canvas.krea.edu.in', courses: [
    { name: 'MATH201 Linear Algebra', term: '2026 T2' },
    { name: 'KCCS101', term: '2026 T2' },
    { name: '<img src=x onerror=alert(1)> Unknown course', term: '' }
  ] };
  await page.goto(importUrl('http://127.0.0.1:4173/', payload));
  const dialog = page.getByRole('dialog', { name: 'import from Canvas' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL('http://127.0.0.1:4173/');
  await expect(dialog.getByText('<img src=x onerror=alert(1)> Unknown course', { exact: true })).toBeVisible();
  await expect(dialog.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kcal-plan')).placements)).toEqual({ '2-1': ['MATH201'] });
  await dialog.getByLabel('Add new courses to').selectOption('2-2');
  await dialog.getByRole('button', { name: 'Add 1 new course', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Added 1 course');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kcal-plan')).placements)).toEqual({ '2-1': ['MATH201'], '2-2': ['KCCS101'] });
  await expect(dialog.getByRole('button', { name: 'Add 0 new courses', exact: true })).toBeDisabled();
});

test('invalid transfer reports an error without changing the plan; reviews have an honest unconfigured state', async ({ page }) => {
  await page.goto('/#canvas-import=%7Bbad');
  await expect(page.getByRole('alert')).toContainText('not a valid course list');
  await page.getByRole('button', { name: 'close', exact: true }).click();
  await page.goto('/?review=MATH201');
  await expect(page.getByText('Course reviews are coming soon. Sign-in is not available yet.')).toBeVisible();
});
