const STORAGE_KEY = 'kcal-plan';
const BACKUP_KEY = 'kcal-plan-backup';

/** Keep the existing keys so upgrades retain every local plan. */
export function restoreBoard(storage: Pick<Storage, 'getItem'>, apply: (value: Record<string, unknown>) => void) {
	for (const key of [STORAGE_KEY, BACKUP_KEY]) {
		try {
			const raw = storage.getItem(key);
			if (!raw) continue;
			const value: unknown = JSON.parse(raw);
			if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
			apply(value as Record<string, unknown>);
			return;
		} catch { /* Keep unreadable data; attempt the backup. */ }
	}
}

export function saveBoard(storage: Pick<Storage, 'getItem' | 'setItem'>, json: string): boolean {
	try {
		const previous = storage.getItem(STORAGE_KEY);
		if (previous === json) return true;
		if (previous) {
			// Do not replace a recoverable backup with a corrupt primary value.
			try {
				const parsed: unknown = JSON.parse(previous);
				if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) storage.setItem(BACKUP_KEY, previous);
			} catch { /* The primary is unreadable or the backup write failed. */ }
		}
		storage.setItem(STORAGE_KEY, json);
		return true;
	} catch { return false; }
}
