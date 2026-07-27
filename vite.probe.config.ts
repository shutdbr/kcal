import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const SCRATCH = '/tmp/claude-1000/-home-toad-code-kreabot-main-tracey/dde435db-9bc4-4a8d-86f7-d1b9dfa7ee5d/scratchpad';

export default defineConfig({
	plugins: [svelte()],
	resolve: { alias: { $lib: '/src/lib', '$app/environment': SCRATCH + '/app-environment.js' } },
	build: {
		outDir: SCRATCH + '/probe',
		emptyOutDir: true,
		minify: false,
		lib: { entry: 'src/lib/__probe.svelte.ts', formats: ['es'], fileName: 'probe' }
	}
});
