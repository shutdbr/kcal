// ─────────────────────────────────────────────
// Plan — all app state + the "laws" in one class.
// Instantiated once in +page.svelte, passed down as a prop.
// ─────────────────────────────────────────────

import { browser } from '$app/environment';
import {
	AUDIT_LIMIT,
	COURSES,
	SUBJECTS,
	HEAVY_TRIMS_ALLOWED,
	TRIM_HARD_MAX,
	TRIM_MIN,
	TRIM_NORMAL_MAX,
	byCode,
	creditsFor,
	creditsOfCodes,
	electiveSetFor,
	hasCode,
	pickSetFor,
	reachableIn,
	recommendedFor,
	requiredCreditsFor,
	requiredSetFor,
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

const STORAGE_KEY = 'tracey-plan';

export class Plan {
	// ── raw state ──
	fourYear = $state(true);
	structure = $state<StructureKind>('major-minor');
	// mathematics is the one subject with a published pathway, so the
	// first-visit grid actually demonstrates the recommended order
	picks = $state({ major1: 'mathematics', major2: 'history', minor: 'physics', conc: 'physics' });
	placements = $state<Record<SlotKey, string[]>>({});
	audited = $state<string[]>([]); // codes the student has marked as audits
	showTitles = $state(false); // grid chips show titles instead of codes
	zoom = $state<{ year: number; trim: TrimNum } | null>(null);
	search = $state('');
	filters = $state<string[]>([]); // checked catalogue subject filters
	selected = $state<Course | null>(null); // course shown in the details bar
	dragging = $state<string | null>(null); // code mid-drag → grid shows where it fits
	flash = $state<string | null>(null); // transient "not offered" style message
	#flashTimer: ReturnType<typeof setTimeout> | undefined;

	constructor() {
		// default plan = the ideal order for the chosen programmes;
		// a saved plan (below) replaces it
		this.seedRecommended();
		if (!browser) return;
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (typeof parsed.fourYear === 'boolean') this.fourYear = parsed.fourYear;
				if (['single-major', 'double-major', 'major-minor', 'major-minor-conc'].includes(parsed.structure))
					this.structure = parsed.structure;
				// older saves stored subject codes ("BUSI") — only accept current ids,
				// and majors additionally must be subjects offered as a major
				const isSubject = (v: unknown) => SUBJECTS.some((s) => s.id === v);
				const isMajor = (v: unknown) => SUBJECTS.some((s) => s.id === v && s.majorable);
				for (const k of Object.keys(this.picks) as (keyof typeof this.picks)[]) {
					const ok = k === 'major1' || k === 'major2' ? isMajor : isSubject;
					if (ok(parsed.picks?.[k])) this.picks[k] = parsed.picks[k];
				}
				if (Array.isArray(parsed.filters)) this.filters = parsed.filters.filter(isSubject);
				if (parsed.placements && typeof parsed.placements === 'object') {
					const placements: Record<SlotKey, string[]> = {};
					for (const [key, codes] of Object.entries(parsed.placements)) {
						const { year, trim } = parseSlot(key);
						if (![1, 2, 3, 4].includes(year) || ![1, 2, 3].includes(trim)) continue;
						if (this.locked(year, trim)) continue;
						if (!Array.isArray(codes)) continue;
						const valid = codes.filter((c): c is string => typeof c === 'string' && hasCode(c));
						if (valid.length) placements[key] = valid;
					}
					this.placements = placements;
				}
				if (Array.isArray(parsed.audited))
					this.audited = parsed.audited.filter((c: unknown): c is string => typeof c === 'string' && hasCode(c));
			}
		} catch {
			// bad save → keep the seed
		}

		$effect(() => {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					placements: this.placements,
					audited: this.audited,
					fourYear: this.fourYear,
					structure: this.structure,
					picks: this.picks,
					filters: this.filters
				})
			);
		});
	}

	/** first-year T1/T2 are fixed core courses — nothing can be placed there */
	locked(year: number, trim: TrimNum): boolean {
		return year === 1 && trim !== 3;
	}

	// ── derived: structure ──
	years = $derived(this.fourYear ? [1, 2, 3, 4] : [1, 2, 3]);
	trims = TRIMS;

	programmes: Programme[] = $derived.by(() => {
		switch (this.structure) {
			case 'single-major':
				return [{ role: 'major', subject: this.picks.major1 }];
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
	isDouble = $derived(this.structure === 'double-major');
	// the degree total is the sum of whatever each chosen major/minor/concentration
	// actually requires (from programme.json), not a flat university-wide number
	degreeTotal = $derived(
		this.programmes.reduce((sum, p) => sum + creditsFor(p.subject, p.role, this.fourYear, this.isDouble), 0)
	);

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
	// per-programme required/elective sets for the exact variant on the plan
	// (a 3-year single major's list, not some other variant's), from the
	// scraped website structure (requirements.json). Required closes over
	// prerequisites: a hard prereq of a required course (Analysis 4 for
	// Topology 1) must be taken too, so it reads as required.
	programmeSets = $derived.by(() =>
		this.programmes.map((p) => {
			const required = new Set<string>();
			const queue = [...requiredSetFor(p.subject, p.role, this.fourYear, this.isDouble)];
			while (queue.length) {
				const code = queue.pop()!;
				if (required.has(code)) continue;
				required.add(code);
				queue.push(...byCode(code).prereqs.filter((pre) => reachableIn(pre, this.fourYear)));
			}
			return {
				subject: p.subject,
				required,
				// 'choose N from' pools — required choices, coloured as required
				pick: new Set(pickSetFor(p.subject, p.role, this.fourYear, this.isDouble)),
				elective: new Set(electiveSetFor(p.subject, p.role, this.fourYear, this.isDouble))
			};
		})
	);

	// role toward your chosen major/minor. Anything the programmes don't
	// list — a different department, or an in-department course that isn't a
	// stated requirement — is 'other', NOT an audit. Audits are a separate
	// flag the student sets.
	courseType(code: string): CourseType {
		const c = byCode(code);
		let role: CourseType = 'other';
		for (const s of this.programmeSets) {
			if (c.codes.some((x) => s.required.has(x) || s.pick.has(x))) return 'required';
			// in the variant's elective pool, OR simply a course in your
			// major/minor's own department (a general subject elective) —
			// either way it's not 'other'. 'other'/green is reserved for a
			// different department.
			if (c.codes.some((x) => s.elective.has(x)) || c.subjects.includes(s.subject)) role = 'elective';
		}
		return role;
	}

	isAudit(code: string): boolean {
		return this.audited.includes(code);
	}

	toggleAudit(code: string) {
		this.audited = this.audited.includes(code)
			? this.audited.filter((c) => c !== code)
			: [...this.audited, code];
	}

	/** the code a placed course should read as on the grid: the one from
	 *  the student's own programme (HIST235 for a historian) when the
	 *  cross-listed course belongs to exactly one of their subjects */
	shownCode(code: string): string {
		const c = byCode(code);
		const inProgramme = this.selectedSubjects.filter((s) => c.subjects.includes(s));
		return inProgramme.length === 1 ? (c.codesBySubject[inProgramme[0]] ?? c.code) : c.code;
	}

	/** grid chip label: the course title when the show-titles switch under
	 *  the grid is on, otherwise its (programme-contextual) code */
	gridLabel(code: string): string {
		return this.showTitles ? byCode(code).title : this.shownCode(code);
	}

	// ── slot helpers ──
	slotCourses(year: number, trim: TrimNum): string[] {
		return this.placements[slotKey(year, trim)] ?? [];
	}

	slotCredits(year: number, trim: TrimNum): number {
		return this.slotCourses(year, trim).reduce((sum, code) => sum + byCode(code).credits, 0);
	}

	// ── the drop laws: locked slots, trimester offering, eligible years, prereq order ──
	canDrop(code: string, year: number, trim: TrimNum): boolean {
		if (this.locked(year, trim)) return false;
		const course = byCode(code);
		// no term info → allow anywhere
		if (course.offered.length && !course.offered.includes(trim)) return false;
		// a 300-level course must not light up a year-2 slot
		if (course.eligibleYears.length && !course.eligibleYears.includes(year)) return false;
		// placed prereqs must stay strictly earlier (unplaced ones only warn);
		// a substitute (MATH191 ⇄ COMP201) placed earlier satisfies it too
		const order = year * 10 + trim;
		for (const pre of course.prereqs) {
			const sub = hasCode(pre) ? byCode(pre).crosslist : undefined;
			const ats = this.placed.filter((p) => p.code === pre || p.code === sub);
			if (ats.length && !ats.some((at) => at.year * 10 + at.trim < order)) return false;
		}
		return true;
	}

	// ── actions ──
	place(code: string, year: number, trim: TrimNum) {
		if (this.locked(year, trim)) {
			this.#setFlash(`year 1 t${trim} is fixed — nothing can be placed there`);
			return;
		}
		// a slot the course isn't offered in (or open to) still takes the
		// drop — the hints call it out instead of the drop bouncing
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

	clearSlot(year: number, trim: TrimNum) {
		delete this.placements[slotKey(year, trim)];
	}

	/** wipe everything back to the freshly-seeded recommended plan */
	reset() {
		this.audited = [];
		this.showTitles = false;
		this.selected = null;
		this.zoom = null;
		this.seedRecommended();
	}

	/**
	 * Fill the grid with the ideal order for the chosen programmes:
	 * the department's published pathway where one exists, otherwise the
	 * required courses scheduled into the earliest slot that satisfies
	 * offering, year eligibility, prereq order and the 20-credit load.
	 * Replaces whatever is on the grid — called when the programme changes.
	 */
	seedRecommended() {
		const placements: Record<SlotKey, string[]> = {};
		const pos = new Map<string, number>(); // code -> year*10+trim
		const load = (y: number, t: TrimNum) =>
			(placements[slotKey(y, t)] ?? []).reduce((s, c) => s + byCode(c).credits, 0);
		const put = (code: string, y: number, t: TrimNum) => {
			const key = slotKey(y, t);
			placements[key] = [...(placements[key] ?? []), code];
			pos.set(code, y * 10 + t);
		};

		// earliest slot that satisfies lock, eligibility, offering, ordering and load
		const findSlot = (code: string, after: number, before = Infinity): { y: number; t: TrimNum } | undefined => {
			const course = byCode(code);
			for (const y of this.years) {
				for (const t of TRIMS) {
					if (this.locked(y, t)) continue;
					if (course.eligibleYears.length && !course.eligibleYears.includes(y)) continue;
					if (course.offered.length && !course.offered.includes(t)) continue;
					if (y * 10 + t <= after || y * 10 + t >= before) continue;
					if (load(y, t) + course.credits > TRIM_NORMAL_MAX) continue;
					return { y, t };
				}
			}
			return undefined;
		};

		// the departments' published pathways first, where they exist
		for (const prog of this.programmes) {
			for (const { year, trim, code } of recommendedFor(prog.subject, prog.role, this.fourYear, this.isDouble)) {
				if (pos.has(code)) continue;
				// the published grid itself is not always feasible (it lists
				// MATH427 alongside its prerequisite MATH303) — never place a
				// course at or before a prerequisite already on the grid
				const after = Math.max(0, ...byCode(code).prereqs.map((p) => pos.get(p) ?? 0));
				if (this.years.includes(year) && !this.locked(year, trim) && year * 10 + trim > after) {
					put(code, year, trim);
				} else {
					// pathway claims a fixed/invisible slot (e.g. MATH191 in
					// y1 t1) or one that breaks prereq order — tuck it into
					// the earliest slot that actually works
					const slot = findSlot(code, after);
					if (slot) put(code, slot.y, slot.t);
				}
			}
		}

		// everything the programmes require that the pathways didn't place —
		// ONE greedy earliest-fit pass over all programmes together, so one
		// major's course never lands before a prerequisite the other major
		// requires (envs' BIOS241 must wait for biology's BIOS201)
		const remaining = new Set(
			this.programmes
				.flatMap((prog) => requiredSetFor(prog.subject, prog.role, this.fourYear, this.isDouble))
				.filter((code) => hasCode(code) && !pos.has(code))
		);
		let progress = true;
		while (remaining.size && progress) {
			progress = false;
			for (const code of [...remaining]) {
				const course = byCode(code);
				// wait until the prereqs that are also on the list have been placed
				if (course.prereqs.some((p) => remaining.has(p))) continue;
				const after = Math.max(0, ...course.prereqs.map((p) => pos.get(p) ?? 0));
				// and stay strictly before any already-placed dependent
				const before = Math.min(Infinity, ...course.unlocks.map((u) => pos.get(u) ?? Infinity));
				const slot = findSlot(code, after, before);
				if (slot) put(code, slot.y, slot.t);
				// placed or unplaceable — either way it's off the list
				remaining.delete(code);
				progress = true;
			}
		}

		// pull in prerequisites the programme lists don't mention (e.g. the
		// 1-credit tools courses) so the default plan starts without warnings
		let added = true;
		while (added) {
			added = false;
			const needed = new Map<string, number>(); // prereq -> earliest dependent's order
			for (const [code, order] of pos) {
				for (const pre of byCode(code).prereqs) {
					if (pos.has(pre) || !hasCode(pre)) continue;
					needed.set(pre, Math.min(needed.get(pre) ?? Infinity, order));
				}
			}
			for (const [pre, before] of needed) {
				const slot = findSlot(pre, 0, before);
				if (slot) {
					put(pre, slot.y, slot.t);
					added = true;
				}
			}
		}

		this.placements = placements;
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

		// law 0 — every trimester of the tenure must reach the minimum
		// credits (not just the one being zoomed — the default plan should
		// already own up to its thin trimesters). Year 1 is exempt: t1/t2
		// are the fixed core and t3 carries no min or max at all.
		for (const year of this.years) {
			if (year === 1) continue;
			for (const trim of TRIMS) {
				if (this.locked(year, trim)) continue;
				const c = this.slotCredits(year, trim);
				if (c < TRIM_MIN) {
					hints.push({
						kind: 'warn',
						text: `Y${year} T${trim} is under the ${TRIM_MIN}-credit minimum (${c}/${TRIM_MIN})`,
						codes: []
					});
				}
			}
		}

		// law 1 — prerequisites must come in an earlier trimester. A placed
		// substitute (MATH191 ⇄ COMP201) satisfies the prerequisite too.
		for (const p of this.placed) {
			const course = byCode(p.code);
			for (const pre of course.prereqs) {
				const sub = hasCode(pre) ? byCode(pre).crosslist : undefined;
				const placedAt = [pos.get(pre), sub ? pos.get(sub) : undefined].filter((x) => x !== undefined);
				const prePos = placedAt.length ? placedAt.reduce((a, b) => (a.order <= b.order ? a : b)) : undefined;
				if (!prePos) {
					hints.push({
						kind: 'warn',
						text: `${p.code} requires prerequisite ${pre}${sub ? ` (or ${sub})` : ''}`,
						codes: [p.code, pre]
					});
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

		// law 1.5 — a course should only be placed in a year it's actually
		// open to (from the CSVs' Year 1-4 columns). This is what used to
		// silently let e.g. a 300+ level course sit in a first-year slot.
		for (const p of this.placed) {
			const course = byCode(p.code);
			if (course.eligibleYears.length && !course.eligibleYears.includes(p.year)) {
				hints.push({
					kind: 'warn',
					text: `${p.code} is usually only open to Year ${course.eligibleYears.join('/')} — not Year ${p.year}`,
					codes: [p.code]
				});
			}
		}

		// law 1.6 — a drop into a trimester the course has never run in is
		// allowed (the grid takes it), but it must be called out
		for (const p of this.placed) {
			const course = byCode(p.code);
			if (course.offered.length && !course.offered.includes(p.trim)) {
				hints.push({
					kind: 'warn',
					text: `${p.code} is not offered in trimester ${p.trim} (runs in t${course.offered.join('/t')})`,
					codes: [p.code]
				});
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

		// law 3 — trimester credit caps: 18 normally, up to 20 at most twice
		// in the whole tenure (year 1 exempt, same as the minimum)
		const heavy: { year: number; trim: TrimNum; credits: number }[] = [];
		for (const year of this.years) {
			if (year === 1) continue;
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
				text: `only ${HEAVY_TRIMS_ALLOWED} trimesters in your whole tenure may go over ${TRIM_NORMAL_MAX} credits — you have ${heavy.length}`,
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

		// law 4 — audits are limited (only the ones the student marked)
		const audits = this.placed.filter((p) => this.audited.includes(p.code));
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
		this.programmes.map((prog, i) => {
			const total = creditsFor(prog.subject, prog.role, this.fourYear, this.isDouble);
			const sets = this.programmeSets[i];
			// everything that satisfies the required structure — the fixed
			// core CLOSED over prereqs plus the choice pools, i.e. exactly
			// the courses that read as 'required' on the grid. A prereq the
			// plan forces (COMP212 for the CS core) must count as done.
			const structure = new Set([...sets.required, ...sets.pick]);
			// credits that count toward this programme: its own department's
			// courses plus anything its structure/electives pull in from
			// other departments (MATH230 counts toward computer science)
			const placedCredits = this.placed
				.map((p) => byCode(p.code))
				.filter(
					(c) =>
						c.subjects.includes(prog.subject) ||
						c.codes.some((x) => structure.has(x) || sets.elective.has(x))
				)
				.reduce((s, c) => s + c.credits, 0);
			// what the degree *demands* comes from the site's own credit table
			// when stated — the course list overstates it when it's choice
			// pools (history: pick 3 of 5 methodology courses)
			const requiredNeeded =
				requiredCreditsFor(prog.subject, prog.role, this.fourYear, this.isDouble) ??
				creditsOfCodes(requiredSetFor(prog.subject, prog.role, this.fourYear, this.isDouble));
			const requiredDone = Math.min(
				requiredNeeded,
				this.placed
					.map((p) => byCode(p.code))
					.filter((c) => c.codes.some((x) => structure.has(x)))
					.reduce((s, c) => s + c.credits, 0)
			);
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
		if (checked.length > 0) list = list.filter((c) => c.subjects.some((s) => checked.includes(s)));
		const q = this.search.trim().toLowerCase();
		if (q) list = list.filter((c) => c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q));
		const rank: Record<CourseType, number> = { required: 0, elective: 1, other: 2 };
		return [...list].sort(
			(a, b) => rank[this.courseType(a.code)] - rank[this.courseType(b.code)] || a.code.localeCompare(b.code)
		);
	});
}
