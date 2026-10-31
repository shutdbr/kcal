import { test, expect } from '@playwright/test';

const userId = '00000000-0000-4000-8000-000000000001';
const initial = {
	id: '00000000-0000-4000-8000-000000000010', user_id: userId, name: 'My cloud plan',
	revision: 1, created_at: '2026-10-31T00:00:00Z', updated_at: '2026-10-31T00:00:00Z',
	snapshot: { version: 1, placements: { '2-1': ['MATH201'] }, picks: {}, touched: true }
};

test.beforeEach(async ({ page }) => {
	await page.addInitScript((id) => {
		localStorage.setItem('kcal-intro-seen', '1');
		localStorage.setItem('kcal-plan', JSON.stringify({ version: 1, placements: {}, picks: {}, touched: true }));
		localStorage.setItem('sb-kcal-test-auth-token', JSON.stringify({
			access_token: 'test-token', refresh_token: 'test-refresh', token_type: 'bearer',
			expires_at: Math.floor(Date.now() / 1000) + 3600,
			user: { id, email: 'student@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-31T00:00:00Z' }
		}));
	}, userId);
	await page.route('https://kcal-test.supabase.co/auth/v1/**', (route) => route.fulfill({ status: 204 }));
});

test('private cloud copies can be loaded, created, updated and deleted from phone settings', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	let rows = [structuredClone(initial)];
	await page.route('https://kcal-test.supabase.co/rest/v1/plans**', async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const id = url.searchParams.get('id')?.replace('eq.', '');
		const revision = Number(url.searchParams.get('revision')?.replace('eq.', ''));
		const single = url.searchParams.get('select') === 'snapshot';
		const matching = rows.find((row) => row.id === id);
		let response: unknown = single ? { snapshot: matching?.snapshot } : rows;
		if (request.method() === 'POST') {
			const input = request.postDataJSON();
			expect(input.user_id).toBe(userId);
			const created = { ...structuredClone(initial), ...input, id: '00000000-0000-4000-8000-000000000011' };
			rows.push(created);
			response = created;
		} else if (request.method() === 'PATCH') {
			expect(revision).toBe(matching?.revision);
			Object.assign(matching!, request.postDataJSON(), { revision: revision + 1 });
			response = [matching];
		} else if (request.method() === 'DELETE') {
			expect(revision).toBe(matching?.revision);
			rows = rows.filter((row) => row.id !== id);
			response = [{ id }];
		}
		await route.fulfill({ json: response });
	});
	await page.goto('/');
	await page.getByRole('button', { name: 'your degree', exact: true }).click();
	await page.getByRole('button', { name: 'settings', exact: true }).click();
	const panel = page.getByRole('region', { name: 'Cloud plans' });
	await expect(panel.getByText('My cloud plan', { exact: true })).toBeVisible();
	await panel.getByRole('button', { name: 'Load', exact: true }).click();
	await panel.getByRole('button', { name: 'Confirm load' }).click();
	await expect(panel.getByRole('status')).toContainText('Loaded onto your board');
	await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('kcal-plan')!).placements)).toEqual({ '2-1': ['MATH201'] });
	await panel.getByLabel('Plan name').fill('Another plan');
	await panel.getByRole('button', { name: 'Save to account' }).click();
	await expect(panel.getByText('Another plan', { exact: true })).toBeVisible();
	const saved = panel.getByRole('listitem').filter({ hasText: 'Another plan' });
	await saved.getByRole('button', { name: 'Update from board' }).click();
	await panel.getByRole('button', { name: 'Confirm update' }).click();
	await expect(panel.getByRole('status')).toContainText('Cloud copy updated');
	await saved.getByRole('button', { name: 'Delete', exact: true }).click();
	await panel.getByRole('button', { name: 'Confirm delete' }).click();
	await expect(saved).toHaveCount(0);
	await panel.getByRole('button', { name: 'Sign out' }).click();
	await expect(panel.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
	await expect(panel.getByText('My cloud plan', { exact: true })).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('failed reads can be retried and stale updates leave the board intact', async ({ page }) => {
	let failRead = true;
	await page.route('https://kcal-test.supabase.co/rest/v1/plans**', (route) => {
		if (route.request().method() === 'PATCH') return route.fulfill({ json: [] });
		if (failRead) return route.fulfill({ status: 400, json: { message: 'Read failed' } });
		return route.fulfill({ json: [initial] });
	});
	await page.goto('/');
	await page.getByRole('button', { name: 'your degree', exact: true }).click();
	await page.getByRole('button', { name: 'settings', exact: true }).click();
	const panel = page.getByRole('region', { name: 'Cloud plans' });
	await expect(panel.getByRole('alert')).toBeVisible();
	failRead = false;
	await panel.getByRole('button', { name: 'Refresh' }).click();
	await expect(panel.getByText('My cloud plan', { exact: true })).toBeVisible();
	await panel.getByRole('button', { name: 'Update from board' }).click();
	await panel.getByRole('button', { name: 'Confirm update' }).click();
	await expect(panel.getByRole('alert')).toContainText('changed on another device');
	expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kcal-plan')!).placements)).toEqual({});
});
