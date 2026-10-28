<script lang="ts">
	import { settings } from '$lib/settings.svelte';

	let {
		name,
		size = '1.5rem',
		snap = false
	}: {
		name: 'search' | 'gear' | 'code' | 'title' | 'grade' | 'link' | 'help';
		size?: string;
		snap?: boolean;
	} = $props();
	const paths = {
		search: 'M4 2h5v1H4zM2 4h1v5H2zM10 4h1v5h-1zM4 10h5v1H4zM3 3h1v1H3zM9 3h1v1H9zM3 9h1v1H3zM9 9h2v2H9zM11 11h2v2h-2zM13 13h2v2h-2z',
		gear: 'M6 1h4v1H6zM2 2h2v1H2zM6 2h4v1H6zM12 2h2v1H12zM2 3h12v1H2zM3 4h10v1H3zM3 5h3v1H3zM10 5h3v1H10zM1 6h4v1H1zM11 6h4v1H11zM1 7h4v1H1zM11 7h4v1H11zM1 8h4v1H1zM11 8h4v1H11zM1 9h4v1H1zM11 9h4v1H11zM3 10h3v1H3zM10 10h3v1H10zM3 11h10v1H3zM2 12h12v1H2zM2 13h2v1H2zM6 13h4v1H6zM12 13h2v1H12zM6 14h4v1H6z',
		code: 'M4 3h2v2H4zM2 5h2v2H2zM0 7h2v2H0zM2 9h2v2H2zM4 11h2v2H4zM10 3h2v2h-2zM12 5h2v2h-2zM14 7h2v2h-2zM12 9h2v2h-2zM10 11h2v2h-2z',
		title: 'M2 3h12v3h-2V5H9v8h2v1H5v-1h2V5H4v1H2z',
		grade: 'M2 2h12v12H2zM4 4v8h8V4zM5 8h2v3H5zM9 5h2v6H9z',
		link: 'M3 3h7V1l4 4-4 4V7H3zM13 9H6V7l-4 4 4 4v-2h7z',
		help: 'M4 2h7v2h2v4h-2v2H8v1H6V8h3V6h2V4H4v2H2V4h2zM6 13h2v2H6z'
	};

	// Pixel art only looks even when every art pixel covers the same whole
	// number of screen pixels. The app's rem is fluid (it follows the window
	// width and the text-size setting) and screens can be fractionally scaled,
	// so with `snap` the requested size is only a target: the icon renders at
	// the nearest whole multiple of its 16-unit grid in device pixels.
	const GRID = 16;
	let snapped = $state<string | null>(null);

	$effect(() => {
		if (!snap) return;
		void settings.textSize; // the root font size follows it
		let frame = 0;
		const measure = () => {
			cancelAnimationFrame(frame);
			// a frame later, so a text-size change has reached the root first
			frame = requestAnimationFrame(() => {
				const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
				const css = size.endsWith('rem') ? parseFloat(size) * root : parseFloat(size);
				const dpr = window.devicePixelRatio || 1;
				const n = Math.max(1, Math.round((css * dpr) / GRID));
				snapped = `${(n * GRID) / dpr}px`;
			});
		};
		measure();
		// zooming and moving between screens change the pixel ratio and fire resize
		window.addEventListener('resize', measure);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('resize', measure);
		};
	});
</script>
<svg width={snapped ?? size} height={snapped ?? size} viewBox="0 0 16 16" fill="currentColor" fill-rule="evenodd" shape-rendering="crispEdges" aria-hidden="true"><path d={paths[name]} /></svg>
<style>svg { flex-shrink: 0; vertical-align: middle; }</style>
