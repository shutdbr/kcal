import type { Course, ProgrammeRole, Subject, TrimNum } from '$lib/types';

/**
 * The curriculum as the app consumes it: every course, lecturer and programme
 * rule, already reconciled. The compiler (./compiler.ts) produces it from the
 * scrape and the department documents; Postgres stores it; the runtime
 * ($lib/data) only indexes and looks things up. JSON-serialisable throughout.
 */
export type CurriculumSnapshot = {
	format: 1;
	/** content hash, changes whenever anything in the snapshot does */
	release: string;
	/** when the catalogue was last scraped (YYYY-MM-DD), shown to students */
	updatedOn: string | null;
	subjects: Subject[];
	rules: PlannerRules;
	courses: SnapshotCourse[];
	lecturers: Lecturer[];
	equivalences: Equivalences;
	requirementSets: RequirementSet[];
	batchRules: BatchRuleRecord[];
};

/** A course as the catalogue ships it. `unlocks` and the equivalence edges
 *  are derived by the runtime from `prereqs` and `equivalences`. */
export type SnapshotCourse = Omit<Course, 'unlocks' | 'substitutes' | 'covers' | 'coveredBy' | 'added'> & {
	/** every term it ran, newest first: "25_T2" */
	terms: string[];
	/** lecturer ids, as the latest term listed them */
	lecturers: string[];
};

export type Lecturer = {
	id: string;
	name: string;
	email: string;
	position: string;
	office_hours: string;
	image_url: string;
	url: string;
	date_of_joining?: string;
};

export type PlannerRules = {
	TRIM_MIN: number;
	TRIM_NORMAL_MAX: number;
	TRIM_STANDARD_MAX: number;
	TRIM_HARD_MAX: number;
	HEAVY_TRIMS_ALLOWED: number;
	AUDIT_LIMIT: number;
	MIN_TOTAL_3YR: number;
	MIN_TOTAL_4YR: number;
	MAX_TOTAL_3YR: number;
	MAX_TOTAL_4YR: number;
};

export type Equivalences = {
	/** separate courses that satisfy one another (any one of a group) */
	substitutes: string[][];
	/** one-way: the maths course is accepted in place of the applied one */
	covers: { maths: string; applied: string }[];
	/** on the transcript, toward no programme */
	transcriptOnly: string[];
};

export type Variant =
	| 'single_major_4yr'
	| 'double_major_4yr'
	| 'single_major_3yr'
	| 'double_major_3yr'
	| 'minor_4yr'
	| 'minor_3yr'
	| 'concentration_4yr'
	| 'concentration_3yr';

/** The programme a student's choices describe. A concentration has one
 *  course list, but its credits can differ by degree length (CS: 16 or 20). */
export const variantOf = (role: ProgrammeRole, fourYear: boolean, isDouble: boolean): Variant => {
	const length = fourYear ? '4yr' : '3yr';
	if (role === 'major') return `${isDouble ? 'double' : 'single'}_major_${length}`;
	return `${role}_${length}`;
};

export type ChoiceCourse = { code: string | null; title: string };
export type ChoiceGroup = { rule: string; pick: number; courses: ChoiceCourse[] };

/** One programme variant's rules, fully resolved. */
export type ProgrammeRequirements = {
	subject: string;
	variant: Variant;
	credits: { total: number; required: number | null; elective: number | null };
	required: string[];
	/** courses in 'choose N' pools, they count toward the required credits */
	picks: string[];
	electives: string[];
	choices: ChoiceGroup[];
	/** the suggested placement of required courses */
	pathway: { year: number; trim: TrimNum; code: string }[];
};

/** The rules a run of batches graduates under. `batches: null` is the
 *  default set, for any batch no other set names. */
export type RequirementSet = {
	id: string;
	name: string;
	batches: number[] | null;
	programmes: ProgrammeRequirements[];
};

/** A rule for one batch only ("ENVS201 for the 2022 batch"). */
export type BatchRuleRecord = {
	batch: number;
	subject: string;
	variant: Variant;
	courses: Record<string, 'required' | 'elective'>;
	requiredCredits?: number;
};
