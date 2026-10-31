import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extractMarkList } from '../../extensions/canvas-import/extract.js';
import { importUrl } from '../../extensions/canvas-import/transfer.js';

const examUrl = 'https://oe.krea.edu.in/krea/my_mark/';
const fixture = new URL('../fixtures/exam-mark-list.html', import.meta.url);

test('reads term tables only, preserves retakes and excludes student profile information', async ({ page }) => {
  await page.route(examUrl, (route) => readFile(fixture, 'utf8').then((body) => route.fulfill({ body, contentType: 'text/html' })));
  await page.goto(examUrl);
  const payload = await page.evaluate(extractMarkList);
  expect(payload.version).toBe(3);
  expect(payload.courses).toHaveLength(5);
  expect(payload.courses?.map((row) => row.term)).toEqual([1, 4, 4, 10, 10]);
  expect(payload.courses?.filter((row) => row.code === 'MATH201').map((row) => row.grade)).toEqual(['U', 'B+']);
  expect(JSON.stringify(payload)).not.toMatch(/Example Student|private-profile|trajectory/);
  await page.locator('.mm-grade').first().evaluate((node) => node.textContent = 'invalid');
  expect((await page.evaluate(extractMarkList)).error).toContain('could not be read safely');
});

test('wrong origins, login pages and absent mark tables do not produce exports', async ({ page }) => {
  for (const url of ['https://oe.krea.edu.in.evil.test/krea/my_mark/', 'https://oe.krea.edu.in/auth/', examUrl]) {
    await page.route(url, (route) => route.fulfill({ body: '<h1>Sign in</h1>', contentType: 'text/html' }));
    await page.goto(url);
    expect((await page.evaluate(extractMarkList)).error).toBeTruthy();
  }
});

test('review is local and explicit; latest selected retake reaches the board and all attempts survive reload', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kcal-intro-seen', '1');
    if (!localStorage.getItem('kcal-plan')) localStorage.setItem('kcal-plan', JSON.stringify({ version: 1, placements: {}, touched: true }));
  });
  await page.route(examUrl, (route) => readFile(fixture, 'utf8').then((body) => route.fulfill({ body, contentType: 'text/html' })));
  await page.goto(examUrl);
  const payload = await page.evaluate(extractMarkList);
  await page.goto(importUrl('http://127.0.0.1:4173/', payload));
  const dialog = page.getByRole('dialog', { name: 'import Krea Exam results' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL('http://127.0.0.1:4173/');
  await expect(dialog.getByText('Local import. No automatic uploads.')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('kcal-exam-mark-list'))).toBeNull();
  await expect(dialog.getByLabel('Match for MATH201 in Term 10')).toHaveValue('MATH201');
  await dialog.getByRole('button', { name: 'Copy 3 matched courses & grades to board' }).click();
  await expect(dialog.getByRole('status')).toContainText('Added 3 courses and copied 3 grades');
  const saved = await page.evaluate(() => ({
    plan: JSON.parse(localStorage.getItem('kcal-plan')!),
    record: JSON.parse(localStorage.getItem('kcal-exam-mark-list')!)
  }));
  expect(saved.record.courses).toHaveLength(5);
  expect(saved.plan.placements).toEqual({ '1-1': ['KCCS103'], '4-1': ['MATH201', 'COMP217'] });
  expect(saved.plan.grades).toEqual({ KCCS103: 'A', MATH201: 'B+', COMP217: 'I' });
  expect(saved.plan).not.toHaveProperty('examTranscript');
  await page.reload();
  await page.getByRole('button', { name: 'settings', exact: true }).click();
  await page.getByRole('button', { name: 'import courses & grades', exact: true }).click();
  await page.getByRole('button', { name: 'View saved mark list on this device' }).click();
  await expect(page.getByRole('region', { name: 'Term 4 results' }).getByText('MATH201 · Analysis-I')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Term 10 results' }).getByText('MATH201 · Analysis-I')).toBeVisible();
});

test('existing placements and grades are preserved until replacement is explicitly selected', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kcal-intro-seen', '1');
    localStorage.setItem('kcal-plan', JSON.stringify({ version: 1, placements: { '2-1': ['MATH201'] }, grades: { MATH201: 'C' }, touched: true }));
  });
  const payload = { version: 3, source: 'https://oe.krea.edu.in', courses: [
    { code: 'MATH201', title: 'Analysis-I', term: 10, grade: 'A-', credits: 4 }
  ] };
  await page.goto(importUrl('http://127.0.0.1:4173/', payload));
  const dialog = page.getByRole('dialog', { name: 'import Krea Exam results' });
  await dialog.getByRole('button', { name: 'Copy 1 matched courses & grades to board' }).click();
  await expect(dialog.getByRole('status')).toContainText('Added 0 courses and copied 0 grades');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kcal-plan')!).grades.MATH201)).toBe('C');
  await dialog.getByLabel('Replace existing board grades').check();
  await dialog.getByRole('button', { name: 'Copy 1 matched courses & grades to board' }).click();
  await expect(dialog.getByRole('status')).toContainText('copied 1 grades');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('kcal-plan')!));
  expect(saved.placements).toEqual({ '2-1': ['MATH201'] });
  expect(saved.grades.MATH201).toBe('A-');
  await dialog.getByRole('button', { name: 'Remove saved mark list from this device', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm remove local mark list', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('kcal-exam-mark-list'))).toBeNull();
});
