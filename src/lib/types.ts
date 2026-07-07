export type TrimNum = 1 | 2 | 3;

export type Course = {
	code: string;
	title: string;
	faculty: string;
	subject: string; // primary subject id (the canonical code's discipline), see SUBJECTS in data.ts
	subjects: string[]; // every subject this course belongs to via its cross-listed codes (⊇ [subject])
	codes: string[]; // all cross-listed codes for this one course, e.g. ['ARTS229','HIST235','LITT235']
	codesBySubject: Record<string, string>; // subject id → the code that subject sees it under
	credits: number;
	required: boolean; // the university's own required/elective flag — anything not clearly elective is required
	offered: TrimNum[]; // which trimesters it has run in, derived from terms taught
	eligibleYears: number[]; // which of years 1-4 this is open to
	prereqs: string[]; // course codes that must come in an EARLIER trimester
	unlocks: string[]; // course codes this one is a prerequisite for
	desc: string; // catalogue description, shown in the details bar
	crosslist?: string; // course code this one is interchangeable with
};

export type Subject = {
	id: string;
	label: string; // full name shown in sidebar
	short: string; // short name shown as catalogue filter chip
	majorable: boolean; // some subjects are only offered as minor/concentration
};

export type ProgrammeRole = 'major' | 'minor' | 'concentration';

/** How the degree is structured — picked in the sidebar */
export type StructureKind = 'single-major' | 'double-major' | 'major-minor' | 'major-minor-conc';

export type Programme = {
	role: ProgrammeRole;
	subject: string;
};

// a course's role relative to your chosen major/minor. 'other' = anything
// outside those requirements (a different department, or an in-department
// course the programme doesn't list) — NOT automatically an audit; the
// student marks audits themselves.
export type CourseType = 'required' | 'elective' | 'other';

export type HintKind = 'warn' | 'info' | 'good';

export type Hint = {
	kind: HintKind;
	text: string;
	codes: string[]; // courses involved — these get bolded / tinted on the grid
};

export type ProgrammeStat = {
	role: ProgrammeRole;
	subject: string;
	label: string;
	totalCredits: number; // credits this programme demands
	creditsLeft: number;
	requiredDone: number; // credits of required courses placed
	requiredNeeded: number; // credits of required courses in total
};

/** "year-trim" e.g. "3-1" for Year 3, Trimester 1 */
export type SlotKey = string;

export const slotKey = (year: number, trim: TrimNum): SlotKey => `${year}-${trim}`;

export const parseSlot = (key: SlotKey): { year: number; trim: TrimNum } => {
	const [y, t] = key.split('-').map(Number);
	return { year: y, trim: t as TrimNum };
};
