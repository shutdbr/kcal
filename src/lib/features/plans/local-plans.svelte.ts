// ─────────────────────────────────────────────
// Saved schedules.
//
// The board holds ONE plan, autosaved as you work. This is the other thing a
// student needs: a way to keep a version of it. "What if I did a double major
// instead" is answered by saving what you have, changing the degree, and
// loading the old one back if you liked it better — no second grid to keep
// track of, no mode to be in, and nothing that can quietly overwrite work.
//
// Kept apart from the autosave key on purpose: a saved schedule must survive
// anything that happens to the live plan, including a reset.
// ─────────────────────────────────────────────

import { browser } from '$app/environment';

const SAVES_KEY = 'kcal-saved-plans';
// A snapshot is a whole plan (~10-30 KB of JSON). localStorage is a few MB, so
// this is nowhere near the ceiling — it is a list-length limit, to keep the
// settings panel readable and stop an accidental save loop filling the quota.
export const MAX_SAVES = 20;

export type SavedPlan = {
	id: string;
	name: string;
	savedAt: number; // epoch ms
	data: unknown; // a Plan.snapshot(), validated on load by Plan.applySave
};

function read(): SavedPlan[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(SAVES_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		// field by field, like the plan's own restore: one unreadable entry
		// costs you that entry, never the whole list
		return parsed.filter(
			(p): p is SavedPlan =>
				!!p &&
				typeof p === 'object' &&
				typeof p.id === 'string' &&
				typeof p.name === 'string' &&
				typeof p.savedAt === 'number' &&
				!!p.data
		);
	} catch {
		return [];
	}
}

/** The saved list, reactive so every surface answers at once. Exported as a
 *  single instance — there is one localStorage, so there is one list. */
class SavedPlans {
	items = $state<SavedPlan[]>([]);
	/** set when a write fails, so the panel can say so instead of silently
	 *  losing the save (quota full, or Safari private browsing) */
	error = $state<string | null>(null);

	constructor() {
		this.items = read();
	}

	#write() {
		try {
			localStorage.setItem(SAVES_KEY, JSON.stringify(this.items));
			this.error = null;
		} catch {
			this.error = "this browser wouldn't store that — it may be out of space";
		}
	}

	get full(): boolean {
		return this.items.length >= MAX_SAVES;
	}

	/** keep a snapshot under a name. Newest first, since that is the one you
	 *  are most likely to want back. */
	save(name: string, data: unknown) {
		if (this.full) {
			this.error = 'Delete a saved copy before adding another.';
			return;
		}
		const entry: SavedPlan = {
			id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
			name: name.trim() || 'untitled plan',
			savedAt: Date.now(),
			data: JSON.parse(JSON.stringify(data))
		};
		this.items = [entry, ...this.items];
		this.#write();
		return entry;
	}

	/** overwrite an existing save in place, keeping its name and position */
	update(id: string, data: unknown) {
		const copy: unknown = JSON.parse(JSON.stringify(data));
		this.items = this.items.map((p) => (p.id === id ? { ...p, data: copy, savedAt: Date.now() } : p));
		this.#write();
	}

	rename(id: string, name: string) {
		this.items = this.items.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p));
		this.#write();
	}

	remove(id: string) {
		this.items = this.items.filter((p) => p.id !== id);
		this.#write();
	}
}

export const savedPlans = new SavedPlans();
