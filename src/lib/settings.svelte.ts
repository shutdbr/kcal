// ─────────────────────────────────────────────
// Settings, how the app LOOKS, kept apart from Plan (what's on the grid).
// A single module-level instance; the settings dialog is its only UI.
// ─────────────────────────────────────────────
//
// Anything here is also read by the inline script in app.html before first
// paint, so a dark-mode reload never flashes white. If the stored shape
// changes, change it there too.

import { browser } from '$app/environment';

const STORAGE_KEY = 'kcal-settings';

export type ThemeChoice = 'light' | 'dark' | 'system';

/** the app's rem base is responsive (see _reset.scss); each text size is a
 *  multiplier on it, applied through the --text-scale custom property */
export const TEXT_SIZES = [
	{ id: 'small', label: 'small', scale: 0.9 },
	{ id: 'normal', label: 'normal', scale: 1 },
	{ id: 'large', label: 'large', scale: 1.1 },
	{ id: 'huge', label: 'huge', scale: 1.2 }
] as const;

export type TextSize = (typeof TEXT_SIZES)[number]['id'];

const scaleFor = (id: TextSize) => TEXT_SIZES.find((s) => s.id === id)?.scale ?? 1;

class Settings {
	theme = $state<ThemeChoice>('light');
	textSize = $state<TextSize>('normal');
	/** what the OS is asking for, tracked so 'system' stays live */
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

	/** what's actually on screen, 'system' resolved against the OS */
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
	// size is the rem base on the same element, so both are one write each
	#apply() {
		if (!browser) return;
		document.documentElement.dataset.theme = this.resolved;
		document.documentElement.style.setProperty('--text-scale', String(scaleFor(this.textSize)));
	}

	#persist() {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: this.theme, textSize: this.textSize }));
		} catch {
			// private mode / full quota, the app still works, it just forgets
		}
	}
}

export const settings = new Settings();
