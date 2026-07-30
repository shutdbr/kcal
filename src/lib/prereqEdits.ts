// ─────────────────────────────────────────────
// Hand-edited prerequisite edges — what /admin writes.
//
// The shipped edges come out of the term CSVs' free-text "prerequisite"
// column (misc/generate.py), and that text is not reliable: it names merely
// *recommended* courses as hard gates, occasionally points the wrong way
// (POLT317 listed as a prerequisite for the intro course it follows — see
// SOFT_PREREQS in data.ts), and misses edges departments enforce in practice.
// /admin is where a maintainer fixes that by hand.
//
// An edit REPLACES a course's prerequisite list outright — an empty array is
// a meaningful edit ("this course has no prerequisites"), which is why the
// key's presence, not its length, is what counts as overridden.
//
// tracey has no server, so edits live in this browser: data.ts applies them
// at load, so the planner, the hints, the seeder and the tree all answer to
// them at once, and the admin page can export them as JSON to be folded back
// into the pipeline.
//
// Kept free of any import from data.ts — data.ts imports THIS.
// ─────────────────────────────────────────────

export const PREREQ_EDITS_KEY = 'tracey-prereq-edits';

/** course code → its full replacement prerequisite list */
export type PrereqEdits = Record<string, string[]>;

/** Validate a parsed object into edits. Anything malformed is dropped field
 *  by field rather than rejecting the lot — same rule the plan's save uses. */
export function parsePrereqEdits(raw: unknown): PrereqEdits {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
	const out: PrereqEdits = {};
	for (const [code, list] of Object.entries(raw as Record<string, unknown>)) {
		if (typeof code !== 'string' || !Array.isArray(list)) continue;
		out[code] = [...new Set(list.filter((p): p is string => typeof p === 'string' && p !== code))];
	}
	return out;
}

export function loadPrereqEdits(): PrereqEdits {
	try {
		const raw = localStorage.getItem(PREREQ_EDITS_KEY);
		return raw ? parsePrereqEdits(JSON.parse(raw)) : {};
	} catch {
		return {}; // unreadable or blocked storage — the shipped edges stand
	}
}

export function savePrereqEdits(edits: PrereqEdits) {
	try {
		localStorage.setItem(PREREQ_EDITS_KEY, JSON.stringify(edits));
	} catch {
		// storage full or blocked; the edit still applies for this session
	}
}
