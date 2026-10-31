import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Server routes run as Vercel functions on Node 22; prerendered and
		// ISR pages are served from the edge cache (see each route's config).
		adapter: adapter({ runtime: 'nodejs22.x' }),
		prerender: {
			// canonical links and the sitemap name the real site, not the build host
			origin: process.env.PUBLIC_SITE_URL || 'http://localhost:5173'
		}
	}
};

export default config;
