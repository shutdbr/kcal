import { test } from '@playwright/test';
test('alternatives', async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem('kcal-intro-seen', '1');
		if (!localStorage.getItem('kcal-plan')) localStorage.setItem('kcal-plan', JSON.stringify({ version: 1, placements: {}, touched: true, picks: {} }));
	});
	await page.goto('/');
	await page.locator('.app[data-ready="true"]').waitFor();
	await page.getByRole('combobox', { name: 'major' }).selectOption('computer science');
	await page.waitForTimeout(400);
	await page.goto('/?course=COMP201');
	await page.locator('.d-alts').waitFor();
	console.log('COMP201:', (await page.locator('.d-alts').innerText()).replace(/\s+/g, ' '));
	await page.locator('.d-alts').screenshot({ path: '/tmp/claude-1000/-home-toad-code-kcal/0108ad91-712f-418e-a7a0-6ef8f4db02ac/scratchpad/alts.png' });
	await page.getByRole('combobox', { name: 'major' }).selectOption('history');
	await page.waitForTimeout(400);
	await page.goto('/?course=HIST303');
	await page.locator('.d-alts').waitFor();
	console.log('HIST303:', (await page.locator('.d-alts').innerText()).replace(/\s+/g, ' '));
});
