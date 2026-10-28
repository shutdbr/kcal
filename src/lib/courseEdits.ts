// ─────────────────────────────────────────────
// Hand-edited course properties and university rules — what /admin writes,
// alongside the prerequisite edges in prereqEdits.ts.
//
// Same model as those: relay has no server, so an edit lives in this
// browser, data.ts applies it at load (so the planner, the hints and the
// seeder all answer to it at once), and /admin exports the lot as one JSON
// file to be folded back into the pipeline.
//
// A course edit only carries the fields that were changed; anything absent
// keeps the shipped value. Rule edits are the same: a missing key is the
// drop-form default.
//
// Kept free of any import from data.ts — data.ts imports THIS.
// ─────────────────────────────────────────────

import type { TrimNum } from './types';

export const COURSE_EDITS_KEY = 'relay-course-edits';
export const RULE_EDITS_KEY = 'relay-rule-edits';
export const NEW_COURSES_KEY = 'relay-new-courses';
export const SHARE_DEFAULT_KEY = 'relay-credit-sharing';

/** how a course that counts toward more than one of a student's programmes
 *  is credited: to ONE of them (the first that claims it — majors before
 *  minors before concentrations), or to ALL of them at once */
export type CreditShare = 'one' | 'all';

export type CourseEdit = {
	title?: string;
	credits?: number;
	offered?: TrimNum[];
	eligibleYears?: number[];
	required?: boolean;
	faculty?: string;
	/** department → the code the course goes by there; replaces the course's
	 *  whole cross-listing (its own department is always kept) */
	codesBySubject?: Record<string, string>;
	share?: CreditShare;
	/** taken out of the catalogue — students can no longer find or place it */
	retired?: boolean;
};

/** a course that exists only because /admin added it */
export type NewCourse = { code: string; title: string; subject: string };
export type NewCourses = Record<string, NewCourse>;

/** what a course code looks like: four letters and three digits, maybe a
 *  letter suffix (MATH191, KCCS101, BIOS207L) */
export const CODE_RE = /^[A-Z]{3,5}\d{3}[A-Z]?$/;

/** the editable fields, in the order the admin shows them */
export const COURSE_FIELDS = ['title', 'credits', 'required', 'offered', 'eligibleYears', 'faculty'] as const;
export type CourseField = (typeof COURSE_FIELDS)[number];

export type CourseEdits = Record<string, CourseEdit>;

const isTrim = (v: unknown): v is TrimNum => v === 1 || v === 2 || v === 3;
const isYear = (v: unknown): v is number => v === 1 || v === 2 || v === 3 || v === 4;
const sortedUnique = <T extends number>(list: T[]) => [...new Set(list)].sort((a, b) => a - b);

/** Validate a parsed object into edits, field by field — one bad field is
 *  dropped, never the whole file. */
export function parseCourseEdits(raw: unknown): CourseEdits {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
	const out: CourseEdits = {};
	for (const [code, e] of Object.entries(raw as Record<string, Record<string, unknown>>)) {
		if (!e || typeof e !== 'object') continue;
		const edit: CourseEdit = {};
		if (typeof e.title === 'string' && e.title.trim()) edit.title = e.title.trim();
		if (typeof e.credits === 'number' && Number.isInteger(e.credits) && e.credits >= 0 && e.credits <= 24)
			edit.credits = e.credits;
		if (Array.isArray(e.offered)) edit.offered = sortedUnique(e.offered.filter(isTrim));
		if (Array.isArray(e.eligibleYears)) edit.eligibleYears = sortedUnique(e.eligibleYears.filter(isYear));
		if (typeof e.required === 'boolean') edit.required = e.required;
		if (typeof e.faculty === 'string') edit.faculty = e.faculty.trim();
		if (e.codesBySubject && typeof e.codesBySubject === 'object' && !Array.isArray(e.codesBySubject)) {
			const map: Record<string, string> = {};
			for (const [subject, c] of Object.entries(e.codesBySubject as Record<string, unknown>))
				if (typeof c === 'string' && CODE_RE.test(c)) map[subject] = c;
			edit.codesBySubject = map;
		}
		if (e.share === 'one' || e.share === 'all') edit.share = e.share;
		if (e.retired === true) edit.retired = true;
		if (Object.keys(edit).length) out[code] = edit;
	}
	return out;
}

// ── university-wide rules (the ERP drop form's numbers) ──

export const RULE_DEFAULTS = {
	TRIM_MIN: 12,
	TRIM_NORMAL_MAX: 16,
	TRIM_HARD_MAX: 20,
	HEAVY_TRIMS_ALLOWED: 2,
	AUDIT_LIMIT: 2,
	MAX_TOTAL_3YR: 128,
	MAX_TOTAL_4YR: 176
};

export type RuleKey = keyof typeof RULE_DEFAULTS;
export type RuleEdits = Partial<Record<RuleKey, number>>;

/** what each rule means, for the admin form — and the range it may take.
 *  The trimester numbers top out at 24: the zoomed trimester canvas is a
 *  24-credit grid. */
export const RULE_INFO: Record<RuleKey, { label: string; help: string; unit: string; min: number; max: number }> = {
	TRIM_MIN: {
		label: 'minimum per trimester',
		help: 'below this a student drops out of full-time status; the planner flags any trimester under it',
		unit: 'credits',
		min: 0,
		max: 24
	},
	TRIM_NORMAL_MAX: {
		label: 'recommended load',
		help: 'the normal registration; going above it counts as a heavy trimester',
		unit: 'credits',
		min: 0,
		max: 24
	},
	TRIM_HARD_MAX: {
		label: 'hard cap per trimester',
		help: 'no trimester may go above this, ever',
		unit: 'credits',
		min: 0,
		max: 24
	},
	HEAVY_TRIMS_ALLOWED: {
		label: 'heavy trimesters allowed',
		help: 'how many trimesters across the whole tenure may go above the recommended load',
		unit: 'trimesters',
		min: 0,
		max: 12
	},
	AUDIT_LIMIT: {
		label: 'audits allowed',
		help: 'audited courses allowed across the whole degree',
		unit: 'audits',
		min: 0,
		max: 12
	},
	MAX_TOTAL_3YR: {
		label: 'tenure ceiling, 3-year',
		help: 'the most credits a three-year student may register in total',
		unit: 'credits',
		min: 0,
		max: 400
	},
	MAX_TOTAL_4YR: {
		label: 'tenure ceiling, 4-year',
		help: 'the most credits a four-year student may register in total',
		unit: 'credits',
		min: 0,
		max: 400
	}
};

export function parseRuleEdits(raw: unknown): RuleEdits {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
	const out: RuleEdits = {};
	for (const key of Object.keys(RULE_DEFAULTS) as RuleKey[]) {
		const v = (raw as Record<string, unknown>)[key];
		const { min, max } = RULE_INFO[key];
		if (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max && v !== RULE_DEFAULTS[key])
			out[key] = v;
	}
	return out;
}

/** the effective rules — defaults with the edits laid over them */
export const resolveRules = (edits: RuleEdits): Record<RuleKey, number> => ({ ...RULE_DEFAULTS, ...edits });

/** problems that would make the planner's rules contradict each other —
 *  shown in the admin, and a reason data.ts falls back to the defaults */
export function ruleProblems(edits: RuleEdits): string[] {
	const r = resolveRules(edits);
	const out: string[] = [];
	if (r.TRIM_MIN > r.TRIM_NORMAL_MAX) out.push('the minimum is above the recommended load');
	if (r.TRIM_NORMAL_MAX > r.TRIM_HARD_MAX) out.push('the recommended load is above the hard cap');
	if (r.MAX_TOTAL_3YR > r.MAX_TOTAL_4YR) out.push('the 3-year ceiling is above the 4-year one');
	return out;
}

// ── storage ──

function load<T>(key: string, parse: (raw: unknown) => T, empty: T): T {
	try {
		const raw = localStorage.getItem(key);
		return raw ? parse(JSON.parse(raw)) : empty;
	} catch {
		return empty; // unreadable or blocked storage — the shipped data stands
	}
}

function save(key: string, value: unknown) {
	try {
		if (value && typeof value === 'object' && !Object.keys(value).length) localStorage.removeItem(key);
		else localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// storage full or blocked; the edit still applies for this session
	}
}

export function parseNewCourses(raw: unknown): NewCourses {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
	const out: NewCourses = {};
	for (const [code, c] of Object.entries(raw as Record<string, Record<string, unknown>>)) {
		if (!CODE_RE.test(code) || !c || typeof c !== 'object') continue;
		if (typeof c.title !== 'string' || !c.title.trim() || typeof c.subject !== 'string') continue;
		out[code] = { code, title: c.title.trim(), subject: c.subject };
	}
	return out;
}

export const parseShare = (raw: unknown): CreditShare => (raw === 'all' ? 'all' : 'one');

export const loadCourseEdits = () => load(COURSE_EDITS_KEY, parseCourseEdits, {});
export const loadNewCourses = () => load(NEW_COURSES_KEY, parseNewCourses, {});
export const saveNewCourses = (courses: NewCourses) => save(NEW_COURSES_KEY, courses);
export const loadShareDefault = () => load(SHARE_DEFAULT_KEY, parseShare, 'one' as CreditShare);
export const saveShareDefault = (share: CreditShare) => save(SHARE_DEFAULT_KEY, share);
export const saveCourseEdits = (edits: CourseEdits) => save(COURSE_EDITS_KEY, edits);
export const loadRuleEdits = () => load(RULE_EDITS_KEY, parseRuleEdits, {});
export const saveRuleEdits = (edits: RuleEdits) => save(RULE_EDITS_KEY, edits);
