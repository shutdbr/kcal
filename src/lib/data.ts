// ─────────────────────────────────────────────
// The curriculum at runtime: indexes over the compiled snapshot and the
// questions the planner asks of it. Nothing here reconciles source data —
// that is the compiler's job (curriculum/compiler.ts). Until /admin edits the
// database, this browser's admin drafts are laid over the snapshot here.
// ─────────────────────────────────────────────

import { browser } from '$app/environment';
import { batchKey, loadBatchEdits, type BatchRule } from './batchEdits';
import {
	loadCourseEdits,
	loadNewCourses,
	loadRuleEdits,
	loadShareDefault,
	resolveRules,
	ruleProblems,
	type CreditShare
} from './courseEdits';
import snapshotData from './data/curriculum.json';
import { loadPrereqEdits } from './prereqEdits';
import {
	variantOf,
	type ChoiceGroup,
	type CurriculumSnapshot,
	type Lecturer,
	type ProgrammeRequirements,
	type RequirementSet,
	type SnapshotCourse,
	type Variant
} from './curriculum/snapshot';
import type { Course, ProgrammeRole, Subject, TrimNum } from './types';

export type { ChoiceCourse, ChoiceGroup } from './curriculum/snapshot';

const snapshot = snapshotData as unknown as CurriculumSnapshot;
export const CURRICULUM_RELEASE = snapshot.release;

/** when the catalogue was last rebuilt from the term sheets */
export const DATA_UPDATED = snapshot.updatedOn ? new Date(snapshot.updatedOn) : null;

// ── Subjects ──

export const SUBJECTS: Subject[] = snapshot.subjects;
export const MAJOR_SUBJECTS: Subject[] = SUBJECTS.filter((s) => s.majorable);
/** what the minor/concentration pickers offer: every real subject — not the
 *  foundation core, nor the open minor (offered separately, minor slot only) */
export const PROGRAMME_SUBJECTS: Subject[] = SUBJECTS.filter((s) => s.id !== 'core' && s.id !== 'open');
export const OPEN_MINOR: Subject = SUBJECTS.find((s) => s.id === 'open')!;
export const OPEN_MINOR_CREDITS = 24; // a minor-sized allowance of free courses

export const subjectById = (id: string): Subject => {
	const s = SUBJECTS.find((s) => s.id === id);
	if (!s) throw new Error(`unknown subject: ${id}`);
	return s;
};

// ── The drop form's numbers, university-wide. /admin may override them; a
//    set of overrides that contradicts itself is ignored wholesale. ──

const ruleEdits = browser ? loadRuleEdits() : {};
const RULES = ruleProblems(ruleEdits).length ? snapshot.rules : resolveRules(ruleEdits);
export const TRIM_MIN = RULES.TRIM_MIN; // minimum credits per trimester (full-time status)
export const TRIM_NORMAL_MAX = RULES.TRIM_NORMAL_MAX; // recommended load — four 4-credit courses
export const TRIM_HARD_MAX = RULES.TRIM_HARD_MAX; // absolute cap (a fifth course) …
export const HEAVY_TRIMS_ALLOWED = RULES.HEAVY_TRIMS_ALLOWED; // … allowed this many terms in the whole tenure
export const AUDIT_LIMIT = RULES.AUDIT_LIMIT; // audits allowed over the whole degree
export const MIN_TOTAL_3YR = RULES.MIN_TOTAL_3YR; // credits to graduate, three-year programme
export const MIN_TOTAL_4YR = RULES.MIN_TOTAL_4YR; // credits to graduate, four-year programme
export const MAX_TOTAL_3YR = RULES.MAX_TOTAL_3YR; // total-credit ceiling, three-year programme
export const MAX_TOTAL_4YR = RULES.MAX_TOTAL_4YR; // total-credit ceiling, four-year programme

// ── Courses ──

/** how a course that satisfies more than one of a student's programmes is
 *  credited when it carries no override of its own — see Course.share */
export const CREDIT_SHARE_DEFAULT: CreditShare = browser ? loadShareDefault() : 'one';

const toCourse = ({ terms: _terms, lecturers: _lecturers, ...c }: SnapshotCourse): Course => ({
	...c,
	subjects: [...c.subjects],
	codes: [...c.codes],
	codesBySubject: { ...c.codesBySubject },
	offered: [...c.offered],
	eligibleYears: [...c.eligibleYears],
	prereqs: [...c.prereqs],
	unlocks: []
});

/** every course, retired ones included — only /admin needs these */
export const ALL_COURSES: Course[] = snapshot.courses.map(toCourse);

// courses /admin added: a bare record, finished by the edits below
if (browser)
	for (const n of Object.values(loadNewCourses())) {
		if (ALL_COURSES.some((c) => c.code === n.code) || !SUBJECTS.some((s) => s.id === n.subject)) continue;
		ALL_COURSES.push({
			code: n.code,
			title: n.title,
			faculty: '',
			subject: n.subject,
			subjects: [n.subject],
			codes: [n.code],
			codesBySubject: { [n.subject]: n.code },
			credits: 4,
			required: false,
			offered: [1, 2, 3],
			eligibleYears: [1, 2, 3, 4],
			prereqs: [],
			unlocks: [],
			added: true
		});
	}

/** a course as the curriculum shipped it, before any /admin edit — what the
 *  admin shows as "was" and what a revert goes back to */
export type ShippedCourse = Pick<
	Course,
	'title' | 'credits' | 'required' | 'offered' | 'eligibleYears' | 'faculty' | 'codesBySubject'
>;
const shipped = new Map<string, ShippedCourse>(
	ALL_COURSES.map((c) => [
		c.code,
		{
			title: c.title,
			credits: c.credits,
			required: c.required,
			offered: [...c.offered],
			eligibleYears: [...c.eligibleYears],
			faculty: c.faculty,
			codesBySubject: { ...c.codesBySubject }
		}
	])
);
export const shippedCourse = (code: string): ShippedCourse | undefined => shipped.get(code);

// /admin's course edits, before anything below reads the catalogue
if (browser) {
	const all = new Map(ALL_COURSES.map((c) => [c.code, c]));
	for (const [code, edit] of Object.entries(loadCourseEdits())) {
		const course = all.get(code);
		if (!course) continue; // an edit for a course the curriculum no longer has
		const { codesBySubject, ...rest } = edit;
		Object.assign(course, rest);
		// a new cross-listing: the course keeps its own department and code;
		// subjects and codes are rebuilt from the map so the three agree
		if (codesBySubject) {
			const map = { ...codesBySubject, [course.subject]: course.code };
			course.codesBySubject = map;
			course.subjects = [course.subject, ...Object.keys(map).filter((s) => s !== course.subject)];
			course.codes = [course.code, ...new Set(Object.values(map).filter((c) => c !== course.code))];
		}
	}
}

/** the live catalogue — everything the planner can show and place */
export const COURSES: Course[] = ALL_COURSES.filter((c) => !c.retired);
const index = new Map(COURSES.map((c) => [c.code, c]));
const aliases = new Map(COURSES.flatMap((c) => c.codes.map((code) => [code, c] as const)));

// /admin's prerequisite edits win over the curriculum's; a retired course
// drops out of every list, or it would be a requirement no one could meet
if (browser)
	for (const [code, prereqs] of Object.entries(loadPrereqEdits())) {
		const course = index.get(code);
		if (course) course.prereqs = prereqs.filter((p) => p !== code);
	}
for (const c of COURSES) c.prereqs = c.prereqs.filter((p) => index.has(p));
// `unlocks` is exactly the inverse relation — derived, never stored
for (const c of COURSES) for (const p of c.prereqs) index.get(p)!.unlocks.push(c.code);

export const hasCode = (code: string): boolean => index.has(code) || aliases.has(code);

export const byCode = (code: string): Course => {
	const c = index.get(code) ?? aliases.get(code);
	if (!c) throw new Error(`unknown course code: ${code}`);
	return c;
};

/** the code a course is shown under when browsing a subject (HIST235 under
 *  history) — its canonical code otherwise */
export const codeFor = (course: Course, subject?: string): string =>
	(subject && course.codesBySubject[subject]) || course.code;

export const creditsOfCodes = (codes: string[]): number =>
	codes.reduce((sum, code) => sum + (index.get(code)?.credits ?? 0), 0);

/** can a course be taken at all within a 3- or 4-year plan? */
export const reachableIn = (code: string, fourYear: boolean): boolean => {
	const c = index.get(code);
	if (!c || (c.pendingCredits && c.credits === 0)) return false;
	return !c.eligibleYears.length || c.eligibleYears.some((y) => y <= (fourYear ? 4 : 3));
};

// ── Equivalences ──

// Separate courses that satisfy one another, any one of a group (the
// discrete-maths core taught by three departments)…
for (const group of snapshot.equivalences.substitutes) {
	const present = group.filter((code) => index.has(code));
	for (const code of present) index.get(code)!.substitutes = present.filter((other) => other !== code);
}
// …and one-way: the maths course clears the applied one, not the reverse.
export const MATHS_COVERS = snapshot.equivalences.covers;
for (const { maths, applied } of MATHS_COVERS) {
	const m = index.get(maths);
	const a = index.get(applied);
	if (!m || !a) continue;
	m.covers = [...new Set([...(m.covers ?? []), applied])];
	a.coveredBy = [...new Set([...(a.coveredBy ?? []), maths])];
}

/** codes accepted in place of `code` — ask this wherever a requirement or
 *  prerequisite needs "is this already satisfied?" */
export const satisfiedBy = (code: string): string[] => {
	const c = index.get(code);
	return c ? [...new Set([...(c.substitutes ?? []), ...(c.coveredBy ?? [])])] : [];
};

const TRANSCRIPT_ONLY = new Set(snapshot.equivalences.transcriptOnly);
/** on the transcript, toward no programme (matched on the canonical code) */
export const isTranscriptOnly = (code: string): boolean => TRANSCRIPT_ONLY.has(index.get(code)?.code ?? code);

// ── The KCCS foundation core: every student, years 1–2 (KCCS190 in year 3);
//    year 1 t1/t2 hold only these, at most Y1_CORE_MAX per trimester ──

export const CORE_COURSES: Course[] = COURSES.filter((c) => c.subject === 'core');
export const CORE_CREDITS = CORE_COURSES.reduce((sum, c) => sum + c.credits, 0);
export const Y1_CORE_MAX = 4;
export const isCore = (code: string): boolean => index.get(code)?.subject === 'core';

// The drop form's audit rules: a 2- or 4-credit course, never KCCS/391/490/491.
const AUDIT_EXCLUDED_RE = /(?:391|490|491)$/;
export const canAudit = (code: string): boolean => {
	const c = index.get(code);
	if (!c || c.subject === 'core') return false;
	if (c.codes.some((x) => AUDIT_EXCLUDED_RE.test(x))) return false;
	return c.credits === 2 || c.credits === 4;
};

// ── Lecturers ──

export type Professor = Lecturer;
/** everyone in the directory, plus lecturers the term sheets name */
export const LECTURERS: Professor[] = snapshot.lecturers;
const lecturers = new Map(snapshot.lecturers.map((l) => [l.id, l]));
export const lecturerById = (id: string): Professor | undefined => lecturers.get(id);
const courseRecords = new Map(snapshot.courses.map((c) => [c.code, c]));

/** who has taught a course — position, office hours, photo where known */
export function facultyOf(code: string): Professor[] {
	return (courseRecords.get(byCode(code).code)?.lecturers ?? []).flatMap((id) => lecturers.get(id) ?? []);
}

/** who teaches a course, as the search bar reads it: the names lecturers go
 *  by and the spellings the term sheets used */
export const facultySearchText = (c: Course): string =>
	[c.faculty, ...facultyOf(c.code).map((p) => p.name)].join(' ').toLowerCase();

/** "24_T1" → "2024 T1" */
export const termLabel = (term: string): string => {
	const [year, trim] = term.split('_');
	return year && trim ? `20${year} ${trim.toUpperCase()}` : term;
};

/** the terms a course ran, newest first: "2026 T2", "2025 T2", … */
export const termsOffered = (code: string): string[] =>
	(courseRecords.get(byCode(code).code)?.terms ?? []).map(termLabel);

// A lecturer is credited with every term a course of theirs ran — the data
// keeps each course's latest lecturers, so close enough to show what someone
// teaches and how recently.
const taught = new Map<string, string[]>();
for (const c of snapshot.courses) {
	if (!index.has(c.code)) continue;
	for (const id of c.lecturers) taught.set(id, [...(taught.get(id) ?? []), c.code]);
}

/** a lecturer's courses by term, newest first — the latest `terms` terms */
export function taughtBy(prof: Professor, terms = 3): { term: string; codes: string[] }[] {
	const byTerm = new Map<string, string[]>();
	for (const code of taught.get(prof.id) ?? [])
		for (const term of courseRecords.get(code)?.terms ?? []) byTerm.set(term, [...(byTerm.get(term) ?? []), code]);
	return [...byTerm]
		.sort(([a], [b]) => b.localeCompare(a))
		.slice(0, terms)
		.map(([term, codes]) => ({ term, codes }));
}

/** every course a lecturer is associated with — not a promise of future teaching */
export function facultyCourses(prof: Professor): Course[] {
	return [...new Set(taught.get(prof.id) ?? [])].map(byCode).sort((a, b) => a.title.localeCompare(b.title));
}

// ── Programme requirements ──
// The snapshot holds every programme variant, resolved, for each requirement
// set; a batch follows the set that names it, else the default (the website).
// With no batch given, the newest set. Rules for one batch only, and this
// browser's /admin batch drafts, are applied on top.

const defaultSet = snapshot.requirementSets.find((s) => s.batches === null)!;
const latestSet = snapshot.requirementSets.findLast((s) => s.batches !== null) ?? defaultSet;
const programmes = new Map(
	snapshot.requirementSets.flatMap((set) => set.programmes.map((p) => [`${set.id}|${p.subject}|${p.variant}`, p] as const))
);
/** the newest requirement set: its name and the batches it governs */
export const CURRENT_REQUIREMENTS = { name: latestSet.name, batches: latestSet.batches ?? [] };
const setFor = (batch: number | undefined): RequirementSet =>
	batch === undefined ? latestSet : (snapshot.requirementSets.find((s) => s.batches?.includes(batch)) ?? defaultSet);

function programmeFor(subject: string, role: ProgrammeRole, fourYear: boolean, isDouble: boolean, batch?: number) {
	return programmes.get(`${setFor(batch).id}|${subject}|${variantOf(role, fourYear, isDouble)}`) as
		| ProgrammeRequirements
		| undefined;
}

const VARIANT_SHAPE: Record<Variant, [ProgrammeRole, boolean, boolean]> = {
	single_major_4yr: ['major', true, false],
	double_major_4yr: ['major', true, true],
	single_major_3yr: ['major', false, false],
	double_major_3yr: ['major', false, true],
	minor_4yr: ['minor', true, false],
	minor_3yr: ['minor', false, false],
	concentration_4yr: ['concentration', true, false],
	concentration_3yr: ['concentration', false, false]
};
const batchEdits: Record<string, BatchRule> = {
	...Object.fromEntries(
		snapshot.batchRules.map(({ batch, subject, variant, courses, requiredCredits }) => {
			const [role, fourYear, isDouble] = VARIANT_SHAPE[variant];
			return [batchKey(batch, subject, role, fourYear, isDouble), { courses, requiredCredits }];
		})
	),
	...(browser ? loadBatchEdits() : {})
};

export function batchRuleFor(subject: string, role: ProgrammeRole, fourYear: boolean, isDouble: boolean, batch?: number) {
	return batch === undefined ? undefined : batchEdits[batchKey(batch, subject, role, fourYear, isDouble)];
}

export function creditsFor(subject: string, role: ProgrammeRole, fourYear: boolean, isDouble: boolean, batch?: number): number {
	if (subject === 'open') return role === 'minor' ? OPEN_MINOR_CREDITS : 0;
	return programmeFor(subject, role, fourYear, isDouble, batch)?.credits.total ?? 0;
}

/** the required credits the programme states — the honest denominator when
 *  its required list is choice pools */
export const requiredCreditsFor = (subject: string, role: ProgrammeRole, fourYear: boolean, isDouble: boolean, batch?: number) =>
	batchRuleFor(subject, role, fourYear, isDouble, batch)?.requiredCredits ??
	programmeFor(subject, role, fourYear, isDouble, batch)?.credits.required ??
	undefined;

/** a batch rule's verdict on a course, by its canonical code */
const batchVerdict = (edits: BatchRule['courses'], code: string) => edits[byCode(code).code];

export function requiredSetFor(subject: string, role: ProgrammeRole, fourYear: boolean, isDouble: boolean, batch?: number): string[] {
	const base = (programmeFor(subject, role, fourYear, isDouble, batch)?.required ?? []).filter((code) => index.has(code));
	const rule = batchRuleFor(subject, role, fourYear, isDouble, batch);
	if (!rule) return base;
	const result = new Set(base.map((code) => byCode(code).code));
	for (const [alias, type] of Object.entries(rule.courses)) {
		if (!hasCode(alias)) continue;
		const code = byCode(alias).code;
		if (type === 'required' && reachableIn(code, fourYear)) result.add(code);
		else result.delete(code);
	}
	return [...result];
}

export function electiveSetFor(subject: string, role: ProgrammeRole, fourYear: boolean, isDouble: boolean, batch?: number): string[] {
	const result = new Set((programmeFor(subject, role, fourYear, isDouble, batch)?.electives ?? []).filter((code) => index.has(code)));
	for (const [alias, type] of Object.entries(batchRuleFor(subject, role, fourYear, isDouble, batch)?.courses ?? {})) {
		if (!hasCode(alias)) continue;
		const code = byCode(alias).code;
		if (type === 'elective') result.add(code);
		else result.delete(code);
	}
	return [...result];
}

/** 'choose N from' pools — they count toward the required credits */
export function pickSetFor(subject: string, role: ProgrammeRole, fourYear: boolean, isDouble: boolean, batch?: number): string[] {
	const edits = batchRuleFor(subject, role, fourYear, isDouble, batch)?.courses ?? {};
	return (programmeFor(subject, role, fourYear, isDouble, batch)?.picks ?? []).filter(
		(code) => index.has(code) && !batchVerdict(edits, code)
	);
}

/** the 'choose N from …' groups the student still has to decide */
export function choiceGroupsFor(subject: string, role: ProgrammeRole, fourYear: boolean, isDouble: boolean, batch?: number): ChoiceGroup[] {
	const edits = batchRuleFor(subject, role, fourYear, isDouble, batch)?.courses ?? {};
	const verdict = (code: string | null) => (code && hasCode(code) ? batchVerdict(edits, code) : undefined);
	return (programmeFor(subject, role, fourYear, isDouble, batch)?.choices ?? [])
		.map((group) => ({
			...group,
			pick: Math.max(0, group.pick - group.courses.filter((c) => verdict(c.code) === 'required').length),
			courses: group.courses.filter((c) => !verdict(c.code))
		}))
		.filter((group) => group.pick > 0);
}

/** the department's suggested placement of the required courses */
export function recommendedFor(
	subject: string,
	role: ProgrammeRole,
	fourYear: boolean,
	isDouble: boolean,
	batch?: number
): { year: number; trim: TrimNum; code: string }[] {
	return (programmeFor(subject, role, fourYear, isDouble, batch)?.pathway ?? []).filter(({ code }) => index.has(code));
}
