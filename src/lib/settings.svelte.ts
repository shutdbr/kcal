// ─────────────────────────────────────────────
// Settings — how the app LOOKS, kept apart from Plan (what's on the grid).
// A single module-level instance; the settings dialog is its only UI.
// ─────────────────────────────────────────────
//
// Anything here is also read by the inline script in app.html before first
// paint, so a dark-mode reload never flashes white. If the stored shape
// changes, change it there too.

import { browser } from '$app/environment';

const STORAGE_KEY = 'tracey-settings';

export type ThemeChoice = 'light' | 'dark' | 'system';

/** the app is built on a 10px rem base — text size just moves that base,
 *  so every rem in the stylesheet scales with it */
export const TEXT_SIZES = [
	{ id: 'small', label: 'small', pct: '56.25%' },
	{ id: 'normal', label: 'normal', pct: '62.5%' },
	{ id: 'large', label: 'large', pct: '68.75%' },
	{ id: 'huge', label: 'huge', pct: '75%' }
] as const;

export type TextSize = (typeof TEXT_SIZES)[number]['id'];

const pctFor = (id: TextSize) => TEXT_SIZES.find((s) => s.id === id)?.pct ?? '62.5%';

class Settings {
	theme = $state<ThemeChoice>('system');
	textSize = $state<TextSize>('normal');
	/** what the OS is asking for — tracked so 'system' stays live */
	systemDark = $state(false);

	constructor() {
		if (!browser) return;
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const saved = JSON.parse(raw) as { theme?: unknown; textSize?: unknown };
				if (saved.theme === 'light' || saved.theme === 'dark' || saved.theme === 'system')
					this.theme = saved.theme;
				if (TEXT_SIZES.some((s) => s.id === saved.textSize)) this.textSize = saved.textSize as TextSize;
			}
		} catch {
			// unreadable save → defaults
		}

		const media = window.matchMedia('(prefers-color-scheme: dark)');
		this.systemDark = media.matches;
		media.addEventListener('change', (e) => {
			this.systemDark = e.matches;
			this.#apply();
		});
		this.#apply();
	}

	/** what's actually on screen — 'system' resolved against the OS */
	get resolved(): 'light' | 'dark' {
		return this.theme === 'system' ? (this.systemDark ? 'dark' : 'light') : this.theme;
	}

	setTheme(theme: ThemeChoice) {
		this.theme = theme;
		this.#persist();
		this.#apply();
	}

	setTextSize(size: TextSize) {
		this.textSize = size;
		this.#persist();
		this.#apply();
	}

	// the whole theme is CSS variables keyed off <html data-theme>, and text
	// size is the rem base on the same element — so both are one write each
	#apply() {
		if (!browser) return;
		document.documentElement.dataset.theme = this.resolved;
		document.documentElement.style.fontSize = pctFor(this.textSize);
	}

	#persist() {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: this.theme, textSize: this.textSize }));
		} catch {
			// private mode / full quota — the app still works, it just forgets
		}
	}
}

export const settings = new Settings();
