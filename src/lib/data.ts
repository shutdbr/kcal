// ─────────────────────────────────────────────
// Dummy catalogue data — everything is made up.
// This is the ONLY file to touch to change
// courses / requirements / laws' numbers.
// ─────────────────────────────────────────────

import type { Course, Subject } from './types';

export const SUBJECTS: Subject[] = [
	{ id: 'history', label: 'history', short: 'his' },
	{ id: 'literature', label: 'literature', short: 'lit' },
	{ id: 'compsci', label: 'compuesc', short: 'cs' },
	{ id: 'math', label: 'math', short: 'math' },
	{ id: 'physics', label: 'physics', short: 'phy' },
	{ id: 'arts', label: 'arts', short: 'arts' },
	{ id: 'economics', label: 'economics', short: 'econ' }
];

// ── The laws' numbers ─────────────────────────
export const TRIM_MIN = 12; // minimum credits per trimester
export const TRIM_NORMAL_MAX = 20; // normal max per trimester
export const TRIM_HARD_MAX = 28; // absolute cap …
export const HEAVY_TRIMS_ALLOWED = 2; // … allowed above 20 only this many times
export const AUDIT_LIMIT = 3; // audits allowed over the whole degree

export const ROLE_CREDITS = { major: 46, minor: 24, concentration: 16 } as const;
export const DEGREE_TOTAL = { threeYear: 84, fourYear: 96 } as const;

// ── Required courses per subject ──────────────
export const REQUIRED: Record<string, string[]> = {
	history: ['HIST100', 'HIST101', 'HIST201', 'HIST300', 'HIST400', 'HIST202', 'HIST301'],
	literature: ['LIT100', 'LIT300', 'LIT500', 'LIT400', 'LIT200', 'LIT600'],
	compsci: ['CS101', 'CS102', 'CS201', 'CS202', 'CS301'],
	math: ['MAT101', 'MAT201', 'MAT202', 'MAT301'],
	physics: ['PHYS101', 'PHYS201', 'PHYS301'],
	arts: ['ARTS101', 'ARTS201'],
	economics: ['ECON101', 'ECON201']
};

// ── Catalogue ─────────────────────────────────
export const COURSES: Course[] = [
	// history
	{ code: 'HIST100', title: 'Writing in History', faculty: 'Prajwal', subject: 'history', credits: 4, offered: [1, 2], prereqs: [] },
	{ code: 'HIST101', title: 'Mughal History', faculty: 'Asshiq Iqbal', subject: 'history', credits: 4, offered: [1, 2], prereqs: [] },
	{ code: 'HIST201', title: 'Afghanistan rulers of India', faculty: 'Asshiq Iqbal', subject: 'history', credits: 4, offered: [1], prereqs: ['HIST101'] },
	{ code: 'HIST202', title: 'Colonial Archives', faculty: 'Meenakshi', subject: 'history', credits: 4, offered: [2], prereqs: ['HIST100'] },
	{ code: 'HIST300', title: 'Oral Histories', faculty: 'Prajwal', subject: 'history', credits: 4, offered: [3], prereqs: ['HIST101'] },
	{ code: 'HIST400', title: 'Israel, what?', faculty: 'Gongo', subject: 'history', credits: 4, offered: [1, 2], prereqs: ['HIST201'] },
	{ code: 'HIST301', title: 'Historiography', faculty: 'Meenakshi', subject: 'history', credits: 4, offered: [3], prereqs: ['HIST201'] },
	{ code: 'HIST600', title: 'Intro to Journalism', faculty: 'Barkha', subject: 'history', credits: 4, offered: [2, 3], prereqs: [] },

	// literature
	{ code: 'LIT100', title: 'Close Reading', faculty: 'Nicholas', subject: 'literature', credits: 4, offered: [1, 2], prereqs: [] },
	{ code: 'LIT200', title: 'Poetics', faculty: 'Sharanya', subject: 'literature', credits: 4, offered: [2], prereqs: ['LIT100'] },
	{ code: 'LIT300', title: 'Introductory Notes', faculty: 'Nicholas', subject: 'literature', credits: 4, offered: [1, 3], prereqs: [] },
	{ code: 'LIT400', title: 'The Novel', faculty: 'Sharanya', subject: 'literature', credits: 4, offered: [3], prereqs: ['LIT200'] },
	{ code: 'LIT490', title: 'Wimpy Kids', faculty: 'George', subject: 'literature', credits: 2, offered: [1, 2, 3], prereqs: [] },
	{ code: 'LIT500', title: 'Shakespeare', faculty: 'George', subject: 'literature', credits: 4, offered: [2], prereqs: ['LIT100'] },
	{ code: 'LIT600', title: 'Literary Theory', faculty: 'Amitava', subject: 'literature', credits: 4, offered: [2], prereqs: ['LIT200'] },
	{ code: 'LIT5004', title: 'Creative Writing', faculty: 'Amitava', subject: 'literature', credits: 4, offered: [1, 3], prereqs: [] },

	// compsci
	{ code: 'CS101', title: 'Intro to Programming', faculty: 'Sudarshan', subject: 'compsci', credits: 4, offered: [1, 2, 3], prereqs: [] },
	{ code: 'CS102', title: 'Data Structures', faculty: 'Sudarshan', subject: 'compsci', credits: 4, offered: [2, 3], prereqs: ['CS101'] },
	{ code: 'CS201', title: 'Algorithms', faculty: 'Vandana', subject: 'compsci', credits: 4, offered: [1, 3], prereqs: ['CS102'] },
	{ code: 'CS202', title: 'Linear Algebra for CS', faculty: 'Vandana', subject: 'compsci', credits: 4, offered: [2], prereqs: ['CS101'], crosslist: 'MAT201' },
	{ code: 'CS301', title: 'Operating Systems', faculty: 'Ranjan', subject: 'compsci', credits: 4, offered: [1], prereqs: ['CS201'] },

	// math
	{ code: 'MAT101', title: 'Calculus 1', faculty: 'Ashwin', subject: 'math', credits: 4, offered: [1, 2], prereqs: [] },
	{ code: 'MAT201', title: 'Linear Algebra', faculty: 'Ashwin', subject: 'math', credits: 4, offered: [1, 3], prereqs: ['MAT101'], crosslist: 'CS202' },
	{ code: 'MAT202', title: 'Analysis 1', faculty: 'Radhika', subject: 'math', credits: 4, offered: [2], prereqs: ['MAT101'] },
	{ code: 'MAT301', title: 'Probability', faculty: 'Radhika', subject: 'math', credits: 4, offered: [3], prereqs: ['MAT202'] },

	// physics
	{ code: 'PHYS100', title: 'Electronics 1', faculty: 'Farhan', subject: 'physics', credits: 2, offered: [1, 3], prereqs: [] },
	{ code: 'PHYS101', title: 'Mechanics', faculty: 'Farhan', subject: 'physics', credits: 4, offered: [1], prereqs: [] },
	{ code: 'PHYS201', title: 'Electromagnetism', faculty: 'Ila', subject: 'physics', credits: 4, offered: [2], prereqs: ['PHYS101'] },
	{ code: 'PHYS301', title: 'Quantum 1', faculty: 'Ila', subject: 'physics', credits: 4, offered: [3], prereqs: ['PHYS201'] },

	// arts
	{ code: 'ARTS101', title: 'Studio Drawing', faculty: 'Kavita', subject: 'arts', credits: 4, offered: [1, 2], prereqs: [] },
	{ code: 'ARTS201', title: 'Shakespeare on Stage', faculty: 'Kavita', subject: 'arts', credits: 4, offered: [2, 3], prereqs: [] },
	{ code: 'ARTS202', title: 'Sculpture', faculty: 'Bose', subject: 'arts', credits: 4, offered: [3], prereqs: [] },

	// economics
	{ code: 'ECON101', title: 'Micro 1', faculty: 'Abhijit', subject: 'economics', credits: 4, offered: [1, 2], prereqs: [] },
	{ code: 'ECON201', title: 'Macro 1', faculty: 'Esther', subject: 'economics', credits: 4, offered: [3], prereqs: ['ECON101'] },
	{ code: 'ECON708', title: 'Hip-hop Economics', faculty: 'Dr Dre', subject: 'economics', credits: 2, offered: [1, 2, 3], prereqs: [] }
];

const index = new Map(COURSES.map((c) => [c.code, c]));

export const byCode = (code: string): Course => {
	const c = index.get(code);
	if (!c) throw new Error(`unknown course code: ${code}`);
	return c;
};

export const subjectById = (id: string): Subject => {
	const s = SUBJECTS.find((s) => s.id === id);
	if (!s) throw new Error(`unknown subject: ${id}`);
	return s;
};
