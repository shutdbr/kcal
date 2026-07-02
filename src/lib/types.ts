export type TrimNum = 1 | 2 | 3;

export type Course = {
	code: string;
	title: string;
	faculty: string;
	subject: string; // subject id, see SUBJECTS in data.ts
	credits: number; // 2 or 4
	offered: TrimNum[]; // which trimesters it runs (t1/t2/t3 pattern every year)
	prereqs: string[]; // course codes that must come in an EARLIER trimester
	crosslist?: string; // course code this one is interchangeable with
};

export type Subject = {
	id: string;
	label: string; // full name shown in sidebar
	short: string; // short name shown as catalogue filter chip
};

export type ProgrammeRole = 'major' | 'minor' | 'concentration';

/** How the degree is structured — picked in the sidebar */
export type StructureKind = 'double-major' | 'major-minor' | 'major-minor-conc';

export type Programme = {
	role: ProgrammeRole;
	subject: string;
};

export type CourseType = 'required' | 'elective' | 'audit';

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
