import type { ProgrammeRole } from './types';
export const BATCH_EDITS_KEY = 'kcal-batch-edits';
export type BatchRule = { courses: Record<string, 'required' | 'elective'>; requiredCredits?: number };
export type BatchEdits = Record<string, BatchRule>;
export const batchKey = (year: number, subject: string, role: ProgrammeRole, fourYear: boolean, double: boolean) =>
	JSON.stringify([year, subject, role, fourYear, role === 'major' && double]);
export function parseBatchEdits(raw: unknown): BatchEdits {
	const out: BatchEdits = {};
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
	for (const [key, value] of Object.entries(raw)) {
		try {
			const [year, subject, role, fourYear, double] = JSON.parse(key);
			if (!Number.isInteger(year) || year < 2022 || year > 2026 || typeof subject !== 'string' ||
				!['major', 'minor', 'concentration'].includes(role) || typeof fourYear !== 'boolean' || typeof double !== 'boolean') continue;
			if (!value || typeof value !== 'object') continue;
			const rule = value as BatchRule;
			const courses: BatchRule['courses'] = {};
			for (const [code, type] of Object.entries(rule.courses ?? {})) {
				if (/^[A-Z]{3,5}\d{3}[A-Z]?$/.test(code) && (type === 'required' || type === 'elective')) courses[code] = type;
			}
			const next: BatchRule = { courses };
			if (Number.isInteger(rule.requiredCredits) && rule.requiredCredits! >= 0 && rule.requiredCredits! <= 176) next.requiredCredits = rule.requiredCredits;
			if (Object.keys(courses).length || next.requiredCredits !== undefined) out[key] = next;
		} catch { /* Ignore malformed entries without losing other batches. */ }
	}
	return out;
}
export function loadBatchEdits(): BatchEdits {
	try { return parseBatchEdits(JSON.parse(localStorage.getItem(BATCH_EDITS_KEY) ?? '{}')); }
	catch { return {}; }
}
export function saveBatchEdits(edits: BatchEdits) {
	localStorage.setItem(BATCH_EDITS_KEY, JSON.stringify(parseBatchEdits(edits)));
}
