// ─────────────────────────────────────────────
// Plan — all app state + the "laws" in one class.
// Instantiated once in +page.svelte, passed down as a prop.
// ─────────────────────────────────────────────

import {
	AUDIT_LIMIT,
	COURSES,
	DEGREE_TOTAL,
	HEAVY_TRIMS_ALLOWED,
	REQUIRED,
	ROLE_CREDITS,
	TRIM_HARD_MAX,
	TRIM_MIN,
	TRIM_NORMAL_MAX,
	byCode,
	subjectById
} from './data';
import {
	slotKey,
	parseSlot,
	type Course,
	type CourseType,
	type Hint,
	type Programme,
	type ProgrammeStat,
	type SlotKey,
	type StructureKind,
	type TrimNum
} from './types';

const TRIMS: TrimNum[] = [1, 2, 3];

// Demo seed: history + literature double major, with one deliberate
// prereq mess in Y3 (HIST201 before its prerequisite HIST101).
const SEED: Record<SlotKey, string[]> = {
	'2-1': ['LIT100', 'HIST100'],
	'2-2': ['LIT500', 'LIT200'],
	'2-3': ['HIST600', 'LIT5004'],
	'3-1': ['HIST201', 'PHYS100'],
	'3-2': ['HIST101', 'HIST202'],
	'3-3': ['HIST300', 'LIT300'],
	'4-1': ['HIST400', 'LIT490'],
	'4-3': ['LIT400', 'ARTS202']
};

export class Plan {
	// ── raw state ──
	fourYear = $state(true);
	structure = $state<StructureKind>('double-major');
	picks = $state({ major1: 'history', major2: 'literature', minor: 'math', conc: 'physics' });
	placements = $state<Record<SlotKey, string[]>>(structuredClone(SEED));
	zoom = $state<{ year: number; trim: TrimNum } | null>(null);
	search = $state('');
	filters = $state<string[]>([]); // checked catalogue subject filters
	flash = $state<string | null>(null); // transient "not offered" style message
	#flashTimer: ReturnType<typeof setTimeout> | undefined;

	// ── derived: structure ──
	years = $derived(this.fourYear ? [1, 2, 3, 4] : [1, 2, 3]);
	trims = TRIMS;

	programmes: Programme[] = $derived.by(() => {
		switch (this.structure) {
			case 'double-major':
				return [
					{ role: 'major', subject: this.picks.major1 },
					{ role: 'major', subject: this.picks.major2 }
				];
			case 'major-minor':
				return [
					{ role: 'major', subject: this.picks.major1 },
					{ role: 'minor', subject: this.picks.minor }
				];
			case 'major-minor-conc':
				return [
					{ role: 'major', subject: this.picks.major1 },
					{ role: 'minor', subject: this.picks.minor },
					{ role: 'concentration', subject: this.picks.conc }
				];
		}
	});

	selectedSubjects = $derived(this.programmes.map((p) => p.subject));
	degreeTotal = $derived(this.fourYear ? DEGREE_TOTAL.fourYear : DEGREE_TOTAL.threeYear);

	// ── derived: placements ──
	/** every placed course in a *visible* year, with its slot */
	placed = $derived.by(() => {
		const out: { code: string; key: SlotKey; year: number; trim: TrimNum }[] = [];
		for (const [key, codes] of Object.entries(this.placements)) {
			const { year, trim } = parseSlot(key);
			if (!this.years.includes(year)) continue;
			for (const code of codes) out.push({ code, key, year, trim });
		}
		return out;
	});

	placedCodes = $derived(new Set(this.placed.map((p) => p.code)));
	totalPlacedCredits = $derived(this.placed.reduce((sum, p) => sum + byCode(p.code).credits, 0));

	// ── laws: course type ──
	courseType(code: string): CourseType {
		const c = byCode(code);
		if (!this.selectedSubjects.includes(c.subject)) return 'audit';
		return REQUIRED[c.subject]?.includes(code) ? 'required' : 'elective';
	}

	// ── slot helpers ──
	slotCourses(year: number, trim: TrimNum): string[] {
		return this.placements[slotKey(year, trim)] ?? [];
	}

	slotCredits(year: number, trim: TrimNum): number {
		return this.slotCourses(year, trim).reduce((sum, code) => sum + byCode(code).credits, 0);
	}

	// ── actions ──
	place(code: string, year: number, trim: TrimNum) {
		const course = byCode(code);
		if (!course.offered.includes(trim)) {
			this.#setFlash(`${code} is not offered in trimester ${trim}`);
			return;
		}
		this.remove(code); // moving = remove from wherever it was first
		const key = slotKey(year, trim);
		this.placements[key] = [...(this.placements[key] ?? []), code];
	}

	remove(code: string) {
		for (const key of Object.keys(this.placements)) {
			if (this.placements[key].includes(code)) {
				this.placements[key] = this.placements[key].filter((c) => c !== code);
				if (this.placements[key].length === 0) delete this.placements[key];
			}
		}
	}

	toggleFilter(subjectId: string) {
		this.filters = this.filters.includes(subjectId)
			? this.filters.filter((f) => f !== subjectId)
			: [...this.filters, subjectId];
	}

	#setFlash(msg: string) {
		this.flash = msg;
		clearTimeout(this.#flashTimer);
		this.#flashTimer = setTimeout(() => (this.flash = null), 2500);
	}

	// ── the laws → hints ──
	hints: Hint[] = $derived.by(() => {
		const hints: Hint[] = [];
		const pos = new Map<string, { year: number; trim: TrimNum; order: number }>();
		for (const p of this.placed) pos.set(p.code, { year: p.year, trim: p.trim, order: p.year * 10 + p.trim });

		// law 0 — zoomed trimester must reach the minimum credits
		if (this.zoom) {
			const c = this.slotCredits(this.zoom.year, this.zoom.trim);
			if (c < TRIM_MIN) {
				hints.push({ kind: 'warn', text: `${TRIM_MIN - c} credits remaining !`, codes: [] });
			}
		}

		// law 1 — prerequisites must come in an earlier trimester
		for (const p of this.placed) {
			const course = byCode(p.code);
			for (const pre of course.prereqs) {
				const prePos = pos.get(pre);
				if (!prePos) {
					hints.push({ kind: 'warn', text: `${p.code} requires prerequisite ${pre}`, codes: [p.code, pre] });
				} else if (prePos.order === p.year * 10 + p.trim) {
					hints.push({
						kind: 'warn',
						text: `you can not do the prerequisite and the required in the same trimester [Y${p.year} T${p.trim}]`,
						codes: [p.code, pre]
					});
				} else if (prePos.order > p.year * 10 + p.trim) {
					hints.push({ kind: 'warn', text: `${pre} must come before ${p.code}`, codes: [p.code, pre] });
				}
			}
		}

		// law 2 — crosslisted courses are interchangeable
		for (const p of this.placed) {
			const course = byCode(p.code);
			if (!course.crosslist) continue;
			const other = byCode(course.crosslist);
			if (pos.has(other.code)) {
				// avoid emitting the pair twice
				if (p.code < other.code) {
					hints.push({
						kind: 'warn',
						text: `${p.code} and ${other.code} are crosslisted — you only need one`,
						codes: [p.code, other.code]
					});
				}
			} else if (this.courseType(other.code) === 'required') {
				hints.push({
					kind: 'info',
					text: `you can switch ${p.code} ${course.title} for ${other.code}`,
					codes: [p.code, other.code]
				});
			}
		}

		// law 3 — trimester credit caps: 20 normally, 28 at most twice
		const heavy: { year: number; trim: TrimNum; credits: number }[] = [];
		for (const year of this.years) {
			for (const trim of TRIMS) {
				const credits = this.slotCredits(year, trim);
				if (credits > TRIM_HARD_MAX) {
					hints.push({
						kind: 'warn',
						text: `Y${year} T${trim} is over the ${TRIM_HARD_MAX}-credit cap`,
						codes: this.slotCourses(year, trim)
					});
				} else if (credits > TRIM_NORMAL_MAX) {
					heavy.push({ year, trim, credits });
				}
			}
		}
		if (heavy.length > HEAVY_TRIMS_ALLOWED) {
			hints.push({
				kind: 'warn',
				text: `only ${HEAVY_TRIMS_ALLOWED} trimesters may go over ${TRIM_NORMAL_MAX} credits — you have ${heavy.length}`,
				codes: heavy.flatMap((h) => this.slotCourses(h.year, h.trim))
			});
		} else {
			for (const h of heavy) {
				hints.push({
					kind: 'info',
					text: `Y${h.year} T${h.trim} is a heavy trimester (${h.credits}/${TRIM_HARD_MAX})`,
					codes: []
				});
			}
		}

		// law 4 — audits are limited
		const audits = this.placed.filter((p) => this.courseType(p.code) === 'audit');
		if (audits.length > AUDIT_LIMIT) {
			hints.push({
				kind: 'warn',
				text: `too many audits — only ${AUDIT_LIMIT} allowed`,
				codes: audits.map((a) => a.code)
			});
		} else if (audits.length === AUDIT_LIMIT) {
			hints.push({ kind: 'info', text: 'you are out of audits', codes: [] });
		} else {
			const left = AUDIT_LIMIT - audits.length;
			hints.push({ kind: 'good', text: `${left} audit${left === 1 ? '' : 's'} remaining`, codes: [] });
		}

		// law 5 — degree credit total
		if (this.totalPlacedCredits > this.degreeTotal) {
			hints.push({
				kind: 'warn',
				text: `you will exceed the required total credits (${this.totalPlacedCredits}/${this.degreeTotal})`,
				codes: []
			});
		}

		return hints;
	});

	/** codes named in any hint → bold on the grid */
	flaggedCodes = $derived(new Set(this.hints.flatMap((h) => h.codes)));
	/** codes named in a WARN hint → their cell gets tinted */
	warnCodes = $derived(new Set(this.hints.filter((h) => h.kind === 'warn').flatMap((h) => h.codes)));

	slotHasProblem(year: number, trim: TrimNum): boolean {
		return this.slotCourses(year, trim).some((code) => this.warnCodes.has(code));
	}

	// ── programme stats for the hints panel ──
	stats: ProgrammeStat[] = $derived.by(() =>
		this.programmes.map((prog) => {
			const total = ROLE_CREDITS[prog.role];
			const inSubject = this.placed
				.map((p) => byCode(p.code))
				.filter((c) => c.subject === prog.subject);
			const placedCredits = inSubject.reduce((s, c) => s + c.credits, 0);
			const requiredList = REQUIRED[prog.subject] ?? [];
			const requiredDone = requiredList
				.filter((code) => this.placedCodes.has(code))
				.reduce((s, code) => s + byCode(code).credits, 0);
			const requiredNeeded = requiredList.reduce((s, code) => s + byCode(code).credits, 0);
			return {
				role: prog.role,
				subject: prog.subject,
				label: subjectById(prog.subject).label,
				totalCredits: total,
				creditsLeft: Math.max(0, total - placedCredits),
				requiredDone,
				requiredNeeded
			};
		})
	);

	// ── catalogue (filtered + sorted) ──
	catalogue: Course[] = $derived.by(() => {
		let list = COURSES;
		if (this.zoom) {
			const trim = this.zoom.trim;
			list = list.filter((c) => c.offered.includes(trim));
		}
		const checked = this.filters.filter((f) => this.selectedSubjects.includes(f));
		if (checked.length > 0) list = list.filter((c) => checked.includes(c.subject));
		const q = this.search.trim().toLowerCase();
		if (q) list = list.filter((c) => c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q));
		const rank: Record<CourseType, number> = { required: 0, elective: 1, audit: 2 };
		return [...list].sort(
			(a, b) => rank[this.courseType(a.code)] - rank[this.courseType(b.code)] || a.code.localeCompare(b.code)
		);
	});
}
