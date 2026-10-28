// Krea's grade scale, from the Examinations & Assessment Manual. A 10-point
// scale; the CGPA is the credit-weighted mean of grade points. Audited courses
// carry no grade and never count toward it.
export type GradeLetter = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'D' | 'E' | 'U';

export type GradeInfo = { letter: GradeLetter; points: number; range: string; label: string };

// high → low, exactly as the manual lists it
export const GRADE_SCALE: GradeInfo[] = [
	{ letter: 'A+', points: 10, range: '98–100', label: 'Outstanding' },
	{ letter: 'A', points: 9.6, range: '95–97', label: 'Excellent' },
	{ letter: 'A-', points: 9.2, range: '90–94', label: 'Excellent' },
	{ letter: 'B+', points: 8.7, range: '85–89', label: 'Proficient' },
	{ letter: 'B', points: 8.2, range: '80–84', label: 'Proficient' },
	{ letter: 'B-', points: 7.7, range: '75–79', label: 'Proficient' },
	{ letter: 'C+', points: 7.2, range: '70–74', label: 'Satisfactory' },
	{ letter: 'C', points: 6.7, range: '65–69', label: 'Satisfactory' },
	{ letter: 'D', points: 6.2, range: '60–64', label: 'Satisfactory' },
	{ letter: 'E', points: 5.5, range: '50–59', label: 'Satisfactory' },
	{ letter: 'U', points: 0, range: '0–49', label: 'Unsatisfactory' }
];

export const GRADE_POINTS = Object.fromEntries(GRADE_SCALE.map((g) => [g.letter, g.points])) as Record<
	GradeLetter,
	number
>;
export const GRADE_LETTERS: GradeLetter[] = GRADE_SCALE.map((g) => g.letter);
export const MAX_GRADE_POINT = GRADE_SCALE[0].points; // 10 (A+)
export const MIN_PASS_POINT = GRADE_POINTS['E']; // 5.5 — 'U' is the only fail

export const isGradeLetter = (v: unknown): v is GradeLetter =>
	typeof v === 'string' && (GRADE_LETTERS as string[]).includes(v);

// non-graded statuses a course can carry — they show on the course but earn no
// grade points and never enter the CGPA (Withdrawn / Incomplete). Audit is a
// fourth status, tracked separately since it also drives the drop-form rules.
export type GradeMark = GradeLetter | 'W' | 'I';
export const OTHER_MARKS: { mark: 'W' | 'I'; label: string }[] = [
	{ mark: 'W', label: 'Withdrawn' },
	{ mark: 'I', label: 'Incomplete' }
];
export const isGradeMark = (v: unknown): v is GradeMark => isGradeLetter(v) || v === 'W' || v === 'I';

// graduation thresholds from the manual's Graduation Requirements section
export const gradMinCredits = (fourYear: boolean): number => (fourYear ? 160 : 120);
export const gradMaxCredits = (fourYear: boolean): number => (fourYear ? 176 : 128);
export const GRAD_MIN_CGPA = 5.5; // and "E and above in all courses" — i.e. no U
// the manual's other two standing lines (CGPA Requirements section)
export const AID_MIN_CGPA = 6.5; // to keep receiving financial aid
export const EXIT_CGPA = 3.5; // below this the student is asked to leave

// CGPA → percentage, per the manual (CGPA / 10 × 100)
export const cgpaToPercent = (cgpa: number): number => (cgpa / 10) * 100;

/** credit-weighted mean grade point (a TGPA over one trimester, or a CGPA over
 *  the lot) — null when there's nothing graded to average */
export function weightedGpa(items: { points: number; credits: number }[]): number | null {
	let points = 0;
	let credits = 0;
	for (const it of items) {
		points += it.points * it.credits;
		credits += it.credits;
	}
	return credits > 0 ? points / credits : null;
}

/** the easiest letter that still clears a required average — for "you need at
 *  least a ___". The scale is high→low, so the smallest sufficient grade is the
 *  last one scanning from the bottom up. */
export function letterForAtLeast(points: number): GradeInfo | undefined {
	return [...GRADE_SCALE].reverse().find((g) => g.points >= points - 1e-9);
}

export type Recovery =
	| { kind: 'no-grades' } // nothing graded yet
	| { kind: 'complete'; cgpa: number } // every credit is graded — CGPA is final
	| { kind: 'secured' } // target already guaranteed, whatever comes next
	| { kind: 'reachable'; needed: number; letter: GradeInfo | undefined; remaining: number }
	| { kind: 'impossible'; needed: number; max: number }; // even all A+ falls short

/**
 * What average grade point the still-ungraded credits must earn for the FINAL
 * degree CGPA to reach `target`.
 *   earned = Σ points·credits over graded courses
 *   graded = Σ credits over graded courses
 *   total  = credits the CGPA is taken over at graduation (the degree total)
 *   needed = (target·total − earned) / (total − graded)
 */
export function recovery(target: number, earned: number, graded: number, total: number): Recovery {
	if (graded <= 0) return { kind: 'no-grades' };
	const remaining = total - graded;
	if (remaining <= 0) return { kind: 'complete', cgpa: earned / graded };
	const needed = (target * total - earned) / remaining;
	if (needed <= 0) return { kind: 'secured' };
	if (needed > MAX_GRADE_POINT + 1e-9) {
		return { kind: 'impossible', needed, max: (earned + MAX_GRADE_POINT * remaining) / total };
	}
	return { kind: 'reachable', needed, letter: letterForAtLeast(needed), remaining };
}
