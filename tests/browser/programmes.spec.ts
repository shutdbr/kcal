import { test, expect } from '@playwright/test';

// a 3-year CS major with a maths minor, the major already complete
const plan = {
	version: 1, touched: true, fourYear: false, yearCount: 3, batchStartYear: 2024,
	structure: 'major-minor', picks: { major1: 'computer science', major2: 'history', minor: 'mathematics', conc: 'physics' },
	placements: {
		'2-1': ['COMP201', 'COMP204', 'MATH201'], '2-2': ['COMP205', 'COMP208', 'MATH230'], '2-3': ['COMP210', 'COMP217', 'MATH203'],
		'3-1': ['COMP305', 'COMP350', 'MATH342'], '3-2': ['COMP312', 'COMP313', 'COMP340'], '3-3': ['COMP308', 'COMP321', 'COMP347']
	}
};

test('a cross-listed course counts for the programme that still needs it', async ({ page }) => {
	await page.addInitScript((saved) => {
		localStorage.setItem('kcal-intro-seen', '1');
		localStorage.setItem('kcal-plan', JSON.stringify(saved));
	}, plan);
	await page.goto('/');
	await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
	// Graph Theory (MATH342 = COMP342) is any-maths-course elective for the minor
	await expect(page.locator('.chip[data-code="MATH342"]')).toHaveAttribute('data-type', 'elective');
	const [major, minor] = await page.locator('.prog').all();
	await expect(major).toContainText('✓ 60 cr');
	await expect(minor).toContainText('12/24 cr');
});
