import { test, expect } from '@playwright/test';

test.describe('phone planner', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem('kcal-intro-seen', '1');
			if (!localStorage.getItem('kcal-plan'))
				localStorage.setItem(
					'kcal-plan',
					JSON.stringify({ version: 1, placements: {}, touched: true })
				);
		});
	});

	test('search, add, move, reload, grade and remove entirely by touch', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto('/');
		await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
		await expect(page.getByRole('navigation', { name: 'main navigation' })).toBeVisible();
		const search = page.getByRole('searchbox');
		await search.fill('MATH201');
		await page.locator('.catalogue [data-course="MATH201"] button.card').tap();
		await expect(page.locator('.rightbar')).toBeVisible();
		await page.getByLabel('trimester to put MATH201 in').selectOption('2-1');
		await page.getByRole('button', { name: 'add to plan', exact: true }).tap();
		await expect(page.locator('.d-place-where')).toContainText('y2 t1');
		await page.getByLabel('trimester to put MATH201 in').selectOption('2-2');
		await page.getByRole('button', { name: 'move', exact: true }).tap();
		await expect(page.locator('.d-place-where')).toContainText('y2 t2');
		await page.getByRole('button', { name: 'close course details' }).tap();
		await expect(search).toHaveValue('MATH201');
		await page.reload();
		await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
		await search.fill('MATH201');
		await page.locator('[data-course="MATH201"] .placed-open').tap();
		await expect(page.locator('.rightbar .d-place')).toBeVisible();
		await page.screenshot({ path: '/tmp/kcal-mobile-after-tap.png' });
		expect(errors).toEqual([]);
		await expect(page.locator('.d-place-where')).toContainText('y2 t2');
		await page.getByRole('button', { name: 'close course details' }).tap();
		await page.getByRole('navigation').getByRole('button', { name: 'your plan' }).tap();
		await page.getByRole('button', { name: 'grade view', exact: true }).tap();
		await page.locator('.chip[data-code="MATH201"] .chip-open').tap();
		await page.getByRole('combobox', { name: 'grade', exact: true }).selectOption('A');
		await page.getByRole('button', { name: 'close course details' }).tap();
		await expect(page.locator('.cgpa-btn')).toContainText('9.60');
		await page.locator('.chip[data-code="MATH201"] .chip-open').tap();
		await page.getByRole('button', { name: 'remove', exact: true }).tap();
		await expect(page.locator('.d-place-where')).toContainText('not on your plan');
		expect(errors).toEqual([]);
	});

	test('filters, empty results, degree settings and modal focus', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
		await page.getByLabel('browse department').selectOption('mathematics');
		await expect(page.locator('.catalogue .cell').first()).toBeVisible();
		await page.getByRole('searchbox').fill('no-course-matches-this');
		await expect(page.getByText('no courses found', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'clear search & filters' }).tap();
		await page.getByRole('searchbox').fill('Prathamesh');
		await expect(page.locator('.catalogue .cell').first()).toBeVisible();
		await page.getByRole('navigation').getByRole('button', { name: 'your degree' }).tap();
		await page.getByRole('combobox', { name: 'major', exact: true }).selectOption('mathematics');
		await page.getByRole('button', { name: 'settings', exact: true }).tap();
		const dialog = page.getByRole('dialog', { name: 'settings' });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'close', exact: true })).toBeFocused();
		await page.keyboard.press('Shift+Tab');
		expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
		await page.keyboard.press('Escape');
		await expect(dialog).not.toBeVisible();
		await expect(page.getByRole('button', { name: 'settings', exact: true })).toBeFocused();
		await page.getByRole('navigation').getByRole('button', { name: 'catalogue' }).tap();
		await expect(page.getByRole('searchbox')).toHaveValue('Prathamesh');
	});

	test('course and Canvas deep links open above the active tab', async ({ page }) => {
		await page.goto('/?course=MATH201');
		await expect(page.locator('.rightbar .d-place')).toBeVisible();
		await expect(page.locator('.rightbar')).toBeVisible();
		// the course link is consumed, so a refresh doesn't reopen it
		await expect(page).toHaveURL('/');
		// an import always arrives in a fresh tab, from the extension
		await page.goto('about:blank');
		await page.goto('/#canvas-import=%7Bbad');
		await expect(page.getByRole('dialog', { name: 'import courses & grades' })).toBeVisible();
		await expect(page.getByRole('alert')).toContainText('not a valid course list');
	});

	test('trimester browsing and large text in dark mode', async ({ page }) => {
		await page.addInitScript(() =>
			localStorage.setItem('kcal-settings', JSON.stringify({ theme: 'dark', textSize: 'huge' }))
		);
		await page.goto('/');
		await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		await page.getByRole('navigation').getByRole('button', { name: 'your plan' }).tap();
		await page.getByRole('button', { name: 'view y2 t1', exact: true }).tap();
		await expect(page.getByRole('heading', { name: 'year 2 · trimester 1' })).toBeVisible();
		await page
			.getByRole('navigation')
			.getByRole('button', { name: 'catalogue', exact: true })
			.tap();
		await expect(page.getByText('offered in trimester 1', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'show all terms ×' }).tap();
		await expect(page.getByText('offered in trimester 1', { exact: true })).not.toBeVisible();
		await page.screenshot({ path: '/tmp/kcal-mobile-dark.png' });
		expect(
			await page.locator('.catalogue').evaluate((el) => el.scrollWidth - el.clientWidth)
		).toBeLessThanOrEqual(1);
	});

	// phones only — from 768px a tablet keeps the desktop columns (below)
	for (const width of [320, 390, 767]) {
		test(`fits catalogue, plan, degree and details at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 844 });
			await page.goto('/');
			await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
			if (width === 390) await page.screenshot({ path: '/tmp/kcal-mobile-catalogue.png' });
			for (const name of ['catalogue', 'your plan', 'your degree']) {
				await page.getByRole('navigation').getByRole('button', { name, exact: true }).tap();
				if (name === 'your plan') {
					const cells = await page
						.locator('.overview .cell')
						.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()));
					// Wide phone containers intentionally show three trimesters per row.
					const columns = width >= 720 ? 3 : 1;
					for (let i = 1; i < cells.length; i++) {
						if (i % columns === 0)
							expect(cells[i].top).toBeGreaterThanOrEqual(cells[i - 1].bottom);
						else {
							expect(cells[i].top).toBe(cells[i - 1].top);
							expect(cells[i].left).toBeGreaterThanOrEqual(cells[i - 1].right);
						}
					}
				}
				if (width === 390 && name === 'your plan')
					await page.screenshot({ path: '/tmp/kcal-mobile-plan.png' });
				const overflow = await page.evaluate(() => {
					const nodes = [
						document.documentElement,
						...document.querySelectorAll<HTMLElement>('.rail, .board, .catalogue-panel')
					];
					return nodes
						.filter((el) => el.getClientRects().length)
						.map((el) => ({ name: el.className, overflow: el.scrollWidth - el.clientWidth }));
				});
				for (const item of overflow) expect(item.overflow, item.name).toBeLessThanOrEqual(1);
			}
			await page.goto('/?course=MATH201');
			await expect(page.locator('.rightbar .d-place')).toBeVisible();
			if (width === 390) await page.screenshot({ path: '/tmp/kcal-mobile-details.png' });
			expect(
				await page.locator('.rightbar').evaluate((el) => el.scrollWidth - el.clientWidth)
			).toBeLessThanOrEqual(1);
		});
	}
});

test('desktop retains resizers, catalogue and drag placement', async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem('kcal-intro-seen', '1');
		localStorage.setItem(
			'kcal-plan',
			JSON.stringify({ version: 1, placements: {}, touched: true })
		);
	});
	await page.goto('/');
	await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
	await expect(page.getByRole('navigation', { name: 'main navigation' })).not.toBeVisible();
	const splitter = page.getByRole('separator', { name: 'resize the catalogue' });
	await splitter.focus();
	await page.keyboard.press('ArrowRight');
	await expect(splitter).toHaveAttribute('aria-valuenow', '31.6');
	await page.getByRole('searchbox').fill('MATH201');
	await page
		.locator('[data-course="MATH201"] button.card')
		.dragTo(page.locator('.overview .cell[data-year="2"][data-trim="1"]'));
	await expect(page.locator('.chip[data-code="MATH201"]')).toBeVisible();
	await page.locator('.chip[data-code="MATH201"] .chip-open').click();
	await expect(page.locator('.d-place-where')).toContainText('y2 t1');
	// a course's padding opens the course, and a press that slips off the chip
	// onto its trimester doesn't open the trimester zoom
	const chip = page.locator('.chip[data-code="MATH201"]');
	await chip.click({ position: { x: 3, y: 3 } });
	await expect(page.getByRole('button', { name: '← back' })).toHaveCount(0);
	const box = await chip.boundingBox();
	if (!box) throw new Error('chip not laid out');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height + 6);
	await page.mouse.up();
	await expect(page.getByRole('button', { name: '← back' })).toHaveCount(0);
	await page.locator('.overview .cell[data-year="2"][data-trim="1"]').click({ position: { x: 8, y: 80 } });
	await expect(page.getByRole('button', { name: '← back' })).toBeVisible();
});

test.describe('tablet planner', () => {
	test.use({ hasTouch: true });
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem('kcal-intro-seen', '1');
			localStorage.setItem(
				'kcal-plan',
				JSON.stringify({ version: 1, placements: {}, touched: true })
			);
		});
	});

	test('landscape keeps the columns and slides the details in', async ({ page }) => {
		await page.setViewportSize({ width: 1180, height: 820 });
		await page.goto('/');
		await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
		await expect(page.getByRole('navigation', { name: 'main navigation' })).not.toBeVisible();
		for (const panel of ['.rail', '.catalogue-panel', '.board']) await expect(page.locator(panel)).toBeVisible();
		await expect(page.locator('.rightbar')).not.toBeVisible();
		await page.getByRole('searchbox').fill('MATH201');
		await page.locator('[data-course="MATH201"] button.card').tap();
		await expect(page.locator('.rightbar .d-place')).toBeVisible();
		await page.locator('.scrim').click({ position: { x: 400, y: 400 } });
		await expect(page.locator('.rightbar')).not.toBeVisible();
	});

	test('upright folds the sidebar to a strip that slides it in', async ({ page }) => {
		await page.setViewportSize({ width: 820, height: 1180 });
		await page.goto('/');
		await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
		await expect(page.locator('.rail')).not.toBeVisible();
		await page.getByRole('button', { name: 'your degree' }).tap();
		await expect(page.locator('.rail')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('.rail')).not.toBeVisible();
	});

	test('a long press drags a course onto the grid', async ({ page }) => {
		await page.setViewportSize({ width: 1180, height: 820 });
		await page.goto('/');
		await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
		await page.getByRole('searchbox').fill('MATH201');
		const card = await page.locator('[data-course="MATH201"] button.card').boundingBox();
		const cell = await page.locator('.overview .cell[data-year="2"][data-trim="1"]').boundingBox();
		if (!card || !cell) throw new Error('card or cell not laid out');
		const touch = (type: string, x: number, y: number) =>
			page.locator('[data-course="MATH201"] button.card').dispatchEvent(type, {
				touches: type === 'touchend' ? [] : [{ identifier: 1, clientX: x, clientY: y }],
				changedTouches: [{ identifier: 1, clientX: x, clientY: y }]
			});
		const from = { x: card.x + card.width / 2, y: card.y + card.height / 2 };
		const to = { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 };
		await touch('touchstart', from.x, from.y);
		await page.waitForTimeout(400);
		for (let i = 1; i <= 5; i++)
			await touch('touchmove', from.x + ((to.x - from.x) * i) / 5, from.y + ((to.y - from.y) * i) / 5);
		await touch('touchend', to.x, to.y);
		await expect(page.locator('.overview .cell[data-year="2"][data-trim="1"] .chip[data-code="MATH201"]')).toBeVisible();
	});
});

test('a phone first visit says once that kcal is better on a laptop', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');
	const note = page.getByRole('dialog', { name: 'better on a laptop' });
	await expect(note).toContainText('kcal is better used on a laptop.');
	await note.getByRole('button', { name: 'continue on phone' }).click();
	await expect(note).toHaveCount(0);
	await page.reload();
	await expect(page.locator('.app')).toHaveAttribute('data-ready', 'true');
	await expect(note).toHaveCount(0);
	// a laptop in the same browser still gets its welcome
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.reload();
	await expect(page.getByRole('dialog', { name: 'better on a laptop' })).toHaveCount(0);
});
