// ─────────────────────────────────────────────
// Catalogue prose — the one big field that isn't in the first-load bundle.
// The descriptions are ~60% of the course data and are read by exactly one
// panel, so they arrive in their own chunk after the app is interactive
// (vite.config.ts builds the chunk). The details panel simply has no "about"
// paragraph for the second or two before it lands.
// ─────────────────────────────────────────────

import { browser } from '$app/environment';

let descriptions = $state<Record<string, string> | null>(null);
let started = false;

/** start fetching the descriptions chunk — safe to call as often as you like */
export function loadDescriptions() {
	if (started || !browser) return;
	started = true;
	import('virtual:course-descriptions')
		.then((m) => (descriptions = m.default))
		.catch(() => (started = false)); // offline / chunk 404 → try again next time
}

export const descriptionOf = (code: string): string | undefined => descriptions?.[code] ?? undefined;
