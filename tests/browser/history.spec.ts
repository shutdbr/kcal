import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem('kcal-intro-seen', '1');
		if (!localStorage.getItem('kcal-plan'))
			localStorage.setItem('kcal-plan', JSON.stringify({ version: 1, placements: {}, touched: true }));
	});
});

const placements = (page: Page) =>
	page.evaluate(() => JSON.parse(localStorage.getItem('kcal-plan') ?? '{}').placements as Record<string, string[]>);

async function place(page: Page, code: string, slot: string) {
	await page.getByRole('searchbox').fill(code);
	await page.locator(`[data-course="${code}"] button.card`).click();
	await page.getByLabel(`trimester to put ${code} in`).selectOption(slot);
	await page.getByRole('button', { name: 'add to plan', exact: true }).click();
	await expect(page.locator(`.chip[data-code="${code}"]`)).toBeVisible();
}

test('undo and redo step through whole planning states, by key and by button', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
	const undo = page.getByRole('button', { name: 'undo', exact: true });
	const redo = page.getByRole('button', { name: 'redo', exact: true });
	await expect(undo).toBeDisabled();

	await place(page, 'MATH201', '2-1');
	await place(page, 'MATH202', '2-2');
	await place(page, 'MATH203', '2-3');

	// typing in the search box keeps the browser's own undo
	await page.getByRole('searchbox').focus();
	await page.keyboard.press('ControlOrMeta+z');
	await expect(page.locator('.chip[data-code="MATH203"]')).toBeVisible();

	await page.locator('.board').click({ position: { x: 5, y: 5 } });
	await page.keyboard.press('ControlOrMeta+z');
	await expect(page.locator('.chip[data-code="MATH203"]')).toHaveCount(0);
	await undo.click();
	await expect(page.locator('.chip[data-code="MATH202"]')).toHaveCount(0);
	expect(await placements(page)).toEqual({ '2-1': ['MATH201'] });

	await page.keyboard.press('ControlOrMeta+Shift+z');
	await expect(page.locator('.chip[data-code="MATH202"]')).toBeVisible();
	await redo.click();
	await expect(page.locator('.chip[data-code="MATH203"]')).toBeVisible();
	await expect(redo).toBeDisabled();

	// a new change after an undo clears the redo branch
	await undo.click();
	await place(page, 'MATH230', '2-3');
	await expect(redo).toBeDisabled();
	expect(await placements(page)).toEqual({ '2-1': ['MATH201'], '2-2': ['MATH202'], '2-3': ['MATH230'] });
});
