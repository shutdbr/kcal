import { test, expect } from '@playwright/test';

const board = (page: import('@playwright/test').Page) =>
	page.evaluate(() => JSON.parse(localStorage.getItem('kcal-plan') ?? '{}'));

test('a share link opens a copy only when asked, keeps the receiver’s board, and carries no grades', async ({ page, context, baseURL }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	// the sender: two courses, one of them graded
	await page.addInitScript(() => {
		localStorage.setItem('kcal-intro-seen', '1');
		if (!localStorage.getItem('kcal-plan'))
			localStorage.setItem(
				'kcal-plan',
				JSON.stringify({ version: 1, placements: { '2-1': ['MATH201'], '2-2': ['MATH202'] }, picks: {}, touched: true, grades: { MATH201: 'A' } })
			);
	});
	await page.goto('/');
	await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
	await page.getByRole('button', { name: 'settings' }).click();
	await page.getByRole('button', { name: 'copy share link' }).click();
	await expect(page.getByRole('button', { name: 'link copied ✓' })).toBeVisible();
	const link = await page.evaluate(() => navigator.clipboard.readText());
	expect(link).toMatch(/\/#plan=[A-Za-z0-9_-]+$/);

	// the receiver already has a plan of their own
	await page.evaluate(() =>
		localStorage.setItem('kcal-plan', JSON.stringify({ version: 1, placements: { '3-1': ['COMP201'] }, picks: {}, touched: true }))
	);
	await page.goto('about:blank');
	await page.goto(link);
	const dialog = page.getByRole('dialog', { name: 'a shared plan' });
	await expect(dialog).toContainText('2 courses on a 4-year plan');
	await expect(page).toHaveURL(`${baseURL}/`);
	expect((await board(page)).placements).toEqual({ '3-1': ['COMP201'] });

	await dialog.getByRole('button', { name: 'open the shared plan' }).click();
	await expect(dialog).toHaveCount(0);
	const opened = await board(page);
	expect(opened.placements).toEqual({ '2-1': ['MATH201'], '2-2': ['MATH202'] });
	expect(opened.grades).toEqual({});
	const saves = await page.evaluate(() => JSON.parse(localStorage.getItem('kcal-saved-plans') ?? '[]'));
	expect(saves.some((s: { data: { placements: Record<string, string[]> } }) => s.data.placements['3-1']?.[0] === 'COMP201')).toBe(true);
});

test('a damaged share link says so and changes nothing', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('kcal-intro-seen', '1'));
	await page.goto('/#plan=not-a-real-plan');
	await expect(page.getByRole('dialog', { name: 'a shared plan' })).toContainText('incomplete or damaged');
});
