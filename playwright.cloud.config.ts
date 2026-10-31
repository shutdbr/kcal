import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests/browser-cloud',
	workers: 1,
	use: {
		baseURL: 'http://127.0.0.1:4174',
		viewport: { width: 390, height: 844 },
		launchOptions: process.env.KCAL_TEST_BROWSER ? { executablePath: process.env.KCAL_TEST_BROWSER } : {}
	},
	webServer: {
		command: 'npm run dev -- --host 127.0.0.1 --port 4174 --strictPort',
		url: 'http://127.0.0.1:4174',
		reuseExistingServer: false,
		env: {
			PUBLIC_SUPABASE_URL: 'https://kcal-test.supabase.co',
			PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test'
		}
	}
});
