// Page data for the public site (/courses, /lecturers, /programmes). Runs at
// build time only — those pages are prerendered and ship no JavaScript — so
// it may read the whole curriculum freely.
import descriptions from '$lib/data/course-descriptions.json';
import {
	COURSES,
	CURRENT_REQUIREMENTS,
	LECTURERS,
	PROGRAMME_SUBJECTS,
	byCode,
	choiceGroupsFor,
	creditsFor,
	electiveSetFor,
	facultyCourses,
	facultyOf,
	hasCode,
	lecturerById,
	pickSetFor,
	requiredCreditsFor,
	requiredSetFor,
	satisfiedBy,
	subjectById,
	taughtBy,
	termLabel,
	termsOffered,
	type Professor
} from '$lib/data';
import type { Course, ProgrammeRole, Subject } from '$lib/types';

// ── shared shapes ──

export type CourseLink = { code: string; title: string; credits: number };
export type LecturerLink = { id: string; name: string; title: string };

const courseLink = (code: string): CourseLink => {
	const c = byCode(code);
	return { code: c.code, title: c.title, credits: c.credits };
};
const lecturerLink = (p: Professor): LecturerLink => ({ id: p.id, name: p.name, title: p.position });
const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title);

export const subjectSlug = (id: string) => id.replace(/ /g, '-');
export const subjectFromSlug = (slug: string): Subject | undefined =>
	PROGRAMME_SUBJECTS.find((s) => subjectSlug(s.id) === slug);

/** "2024–2026" — the batches today's rules are for */
export const currentBatches = () => {
	const b = CURRENT_REQUIREMENTS.batches;
	return b.length ? `${Math.min(...b)}–${Math.max(...b)}` : '';
};

// ── programmes ──

type Variant = { key: string; label: string; role: ProgrammeRole; fourYear: boolean; double: boolean };
const VARIANTS: Variant[] = [
	{ key: 'single_major_4yr', label: '4-year major', role: 'major', fourYear: true, double: false },
	{ key: 'double_major_4yr', label: '4-year double major', role: 'major', fourYear: true, double: true },
	{ key: 'single_major_3yr', label: '3-year major', role: 'major', fourYear: false, double: false },
	{ key: 'double_major_3yr', label: '3-year double major', role: 'major', fourYear: false, double: true },
	{ key: 'minor_4yr', label: '4-year minor', role: 'minor', fourYear: true, double: false },
	{ key: 'minor_3yr', label: '3-year minor', role: 'minor', fourYear: false, double: false },
	{ key: 'concentration_4yr', label: 'concentration (4-year)', role: 'concentration', fourYear: true, double: false },
	{ key: 'concentration_3yr', label: 'concentration (3-year)', role: 'concentration', fourYear: false, double: false }
];
const variantsOf = (subject: Subject) => VARIANTS.filter((v) => v.role !== 'major' || subject.majorable);
const batch = () => CURRENT_REQUIREMENTS.batches[0];

export type ProgrammeView = {
	key: string;
	label: string;
	credits: { total: number; required: number | null; elective: number | null };
	required: CourseLink[];
	choices: { rule: string; pick: number; options: (CourseLink | { code: null; title: string })[] }[];
	electives: CourseLink[];
};

function programmeView(subject: Subject, v: Variant): ProgrammeView | null {
	const args = [subject.id, v.role, v.fourYear, v.double, batch()] as const;
	const total = creditsFor(...args);
	const required = requiredSetFor(...args).map(courseLink).sort(byTitle);
	const choices = choiceGroupsFor(...args).map((g) => ({
		rule: g.rule,
		pick: g.pick,
		options: g.courses.map((c) => (c.code && hasCode(c.code) ? courseLink(c.code) : { code: null, title: c.title }))
	}));
	if (!total && !required.length && !choices.length) return null;
	const named = new Set([...required.map((c) => c.code), ...pickSetFor(...args)]);
	return {
		key: v.key,
		label: v.label,
		credits: {
			total,
			required: requiredCreditsFor(...args) ?? null,
			elective: total - (requiredCreditsFor(...args) ?? total) || null
		},
		required,
		choices,
		electives: electiveSetFor(...args)
			.filter((code) => !named.has(code))
			.map(courseLink)
			.sort(byTitle)
	};
}

export function programmeIndex() {
	return PROGRAMME_SUBJECTS.map((s) => ({
		slug: subjectSlug(s.id),
		label: s.label,
		hue: s.hue ?? null,
		offers: [s.majorable && 'major', 'minor', 'concentration'].filter(Boolean) as string[],
		courses: COURSES.filter((c) => c.subjects.includes(s.id)).length
	}));
}

export function programmePage(subject: Subject) {
	return {
		subject: { label: subject.label, hue: subject.hue ?? null },
		batches: currentBatches(),
		programmes: variantsOf(subject).flatMap((v) => programmeView(subject, v) ?? [])
	};
}

// ── courses ──

export function courseIndex() {
	return PROGRAMME_SUBJECTS.concat(subjectById('core'))
		.map((s) => ({
			slug: subjectSlug(s.id),
			label: s.label,
			hue: s.hue ?? null,
			courses: COURSES.filter((c) => c.subjects.includes(s.id))
				.map((c) => ({ ...courseLink(c.code), shownAs: c.codesBySubject[s.id] ?? c.code }))
				.sort((a, b) => a.shownAs.localeCompare(b.shownAs))
		}))
		.filter((s) => s.courses.length);
}

/** Which programmes name a course, for the batches today's rules cover. */
function programmesNaming(course: Course) {
	const out: { subject: string; slug: string; required: string[]; choice: string[]; elective: string[] }[] = [];
	for (const s of PROGRAMME_SUBJECTS) {
		const row = { subject: s.label, slug: subjectSlug(s.id), required: [] as string[], choice: [] as string[], elective: [] as string[] };
		for (const v of variantsOf(s)) {
			const args = [s.id, v.role, v.fourYear, v.double, batch()] as const;
			if (requiredSetFor(...args).includes(course.code)) row.required.push(v.label);
			else if (pickSetFor(...args).includes(course.code)) row.choice.push(v.label);
			else if (electiveSetFor(...args).includes(course.code)) row.elective.push(v.label);
		}
		if (row.required.length || row.choice.length || row.elective.length) out.push(row);
	}
	return out;
}

export function coursePage(code: string) {
	const c = byCode(code);
	return {
		code: c.code,
		requestedAs: code,
		title: c.title,
		credits: c.credits,
		creditsPending: !!c.pendingCredits,
		subject: subjectById(c.subject).label,
		// each code links to its subject's programmes — the foundation core has
		// none, so its courses link to their place in the catalogue
		listings: c.subjects.map((id) => ({
			subject: subjectById(id).label,
			href: PROGRAMME_SUBJECTS.some((s) => s.id === id) ? `/programmes/${subjectSlug(id)}` : `/courses#${subjectSlug(id)}`,
			code: c.codesBySubject[id] ?? c.code
		})),
		offered: c.offered,
		eligibleYears: c.eligibleYears,
		description: (descriptions as Record<string, string>)[c.code] ?? null,
		prerequisites: c.prereqs.map(courseLink),
		unlocks: c.unlocks.map(courseLink).sort(byTitle),
		equivalents: satisfiedBy(c.code).map(courseLink),
		lecturers: facultyOf(c.code).map(lecturerLink),
		terms: termsOffered(c.code),
		programmes: programmesNaming(c),
		batches: currentBatches()
	};
}

/** every code a course page answers to: canonical codes and their aliases */
export const courseCodes = () => COURSES.flatMap((c) => c.codes);

// ── lecturers ──

export function lecturerIndex() {
	return LECTURERS.map((p) => ({ ...lecturerLink(p), courses: facultyCourses(p).length }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function lecturerPage(id: string) {
	const p = lecturerById(id);
	if (!p) return null;
	return {
		...lecturerLink(p),
		email: p.email,
		officeHours: p.office_hours,
		imageUrl: p.image_url,
		profileUrl: p.url,
		recent: taughtBy(p, 4).map((t) => ({ term: termLabel(t.term), courses: t.codes.map(courseLink) })),
		courses: facultyCourses(p).map((c) => courseLink(c.code))
	};
}

export const lecturerIds = () => LECTURERS.map((p) => p.id);
