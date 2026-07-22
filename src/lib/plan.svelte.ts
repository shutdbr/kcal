// ─────────────────────────────────────────────
// Plan — all app state + the "laws" in one class.
// Instantiated once in +page.svelte, passed down as a prop.
// ─────────────────────────────────────────────

import { browser } from '$app/environment';
import {
	AUDIT_LIMIT,
	CORE_COURSES,
	CORE_CREDITS,
	COURSES,
	SUBJECTS,
	HEAVY_TRIMS_ALLOWED,
	MAX_TOTAL_3YR,
	MAX_TOTAL_4YR,
	TRIM_HARD_MAX,
	TRIM_MIN,
	TRIM_NORMAL_MAX,
	MAJOR_SUBJECTS,
	PROGRAMME_SUBJECTS,
	Y1_CORE_MAX,
	byCode,
	canAudit,
	isCore,
	choiceGroupsFor,
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

// a placements record with fresh arrays, so a kept snapshot can never be
// mutated through the live grid (remove() rewrites placements[key] in place)
const copyPlacements = (p: Record<SlotKey, string[]>): Record<SlotKey, string[]> =>
	Object.fromEntries(Object.entries(p).map(([k, v]) => [k, [...v]]));

// same courses in the same slots (order within a slot doesn't matter) —
// drives the "you have unsaved changes" save button
const samePlacements = (a: Record<SlotKey, string[]>, b: Record<SlotKey, string[]> | null): boolean => {
	if (!b) return false;
	const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
	for (const k of keys) {
		const av = [...(a[k] ?? [])].sort();
		const bv = [...(b[k] ?? [])].sort();
		if (av.length !== bv.length || av.some((c, i) => c !== bv[i])) return false;
	}
	return true;
};

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
	idealView = $state(false); // grid is previewing the recommended path, not the student's plan
	#idealStash: Record<SlotKey, string[]> | null = null; // the real plan, kept safe during the preview
	savedPlacements = $state<Record<SlotKey, string[]> | null>(null); // the explicit save-button checkpoint
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
			if (raw) this.applySave(JSON.parse(raw));
		} catch {
			// bad save → keep the seed
		}

		$effect(() => {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					// never persist the ideal-path preview — the stashed real
					// plan is what a reload should bring back
					placements: this.#idealStash ?? this.placements,
					saved: this.savedPlacements,
					audited: this.audited,
					fourYear: this.fourYear,
					structure: this.structure,
					picks: this.picks,
					filters: this.filters
				})
			);
		});
	}

	/** validate + apply a saved/imported plan object. Shared by the
	 *  localStorage restore and the import button — everything is checked
	 *  against the current catalogue, so a stale save can't break the app. */
	private applySave(parsed: {
		fourYear?: unknown;
		structure?: unknown;
		picks?: Record<string, unknown>;
		filters?: unknown;
		placements?: unknown;
		audited?: unknown;
	}) {
		if (typeof parsed.fourYear === 'boolean') this.fourYear = parsed.fourYear;
		if (
			typeof parsed.structure === 'string' &&
			['single-major', 'double-major', 'major-minor', 'major-minor-conc'].includes(parsed.structure)
		)
			this.structure = parsed.structure as StructureKind;
		// older saves stored subject codes ("BUSI") — only accept current ids,
		// and majors additionally must be subjects offered as a major
		const isSubject = (v: unknown) => SUBJECTS.some((s) => s.id === v);
		const isMajor = (v: unknown) => SUBJECTS.some((s) => s.id === v && s.majorable);
		for (const k of Object.keys(this.picks) as (keyof typeof this.picks)[]) {
			const ok = k === 'major1' || k === 'major2' ? isMajor : isSubject;
			const pick = parsed.picks?.[k];
			if (ok(pick)) this.picks[k] = pick as string;
		}
		if (Array.isArray(parsed.filters)) this.filters = parsed.filters.filter(isSubject);
		const placements = this.#cleanPlacements(parsed.placements);
		if (placements) this.placements = placements;
		const saved = this.#cleanPlacements((parsed as { saved?: unknown }).saved);
		if (saved) this.savedPlacements = saved;
		if (Array.isArray(parsed.audited))
			this.audited = parsed.audited.filter((c: unknown): c is string => typeof c === 'string' && hasCode(c));
		this.ensureDistinctPicks();
	}

	/** validate a raw placements object against the current catalogue —
	 *  null when it isn't one at all */
	#cleanPlacements(raw: unknown): Record<SlotKey, string[]> | null {
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
		const placements: Record<SlotKey, string[]> = {};
		for (const [key, codes] of Object.entries(raw)) {
			const { year, trim } = parseSlot(key);
			if (![1, 2, 3, 4].includes(year) || ![1, 2, 3].includes(trim)) continue;
			if (!Array.isArray(codes)) continue;
			let valid = codes.filter((c): c is string => typeof c === 'string' && hasCode(c));
			// year-1 t1/t2 hold only foundation courses (an over-max slot
			// is kept as-is — the hints flag it rather than dropping data)
			if (this.coreOnly(year, trim)) valid = valid.filter(isCore);
			if (valid.length) placements[key] = valid;
		}
		return placements;
	}

	/** the whole plan as pretty JSON — what the export button downloads */
	exportJSON(): string {
		return JSON.stringify(
			{
				app: 'tracey',
				exported: new Date().toISOString(),
				fourYear: this.fourYear,
				structure: this.structure,
				picks: this.picks,
				placements: this.placements,
				saved: this.savedPlacements,
				audited: this.audited
			},
			null,
			2
		);
	}

	/** load a previously exported plan; returns an error message, or null on success */
	importJSON(raw: string): string | null {
		try {
			const parsed = JSON.parse(raw);
			if (!parsed || typeof parsed !== 'object') return 'that file is not a tracey plan';
			this.applySave(parsed);
			this.selected = null;
			this.zoom = null;
			return null;
		} catch {
			return 'could not read that file — is it a tracey plan export?';
		}
	}

	/** first-year t1/t2 belong to the foundation core: ONLY common-core
	 *  (KCCS) courses may sit there, at most Y1_CORE_MAX per trimester */
	coreOnly(year: number, trim: TrimNum): boolean {
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
	// actually requires (from programme.json), not a flat university-wide number —
	// plus the foundation core every student completes on top
	degreeTotal = $derived(
		this.programmes.reduce((sum, p) => sum + creditsFor(p.subject, p.role, this.fourYear, this.isDouble), 0) +
			CORE_CREDITS
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
			// start from the stated required core, THEN close over prerequisites
			// — but a prereq whose interchangeable partner is already required
			// (COMP321 needs MATH191, and COMP201 ⇄ MATH191 is already in) is
			// already satisfied, so it must not be added as a separate course.
			// `required` = what reads as required (white); `requiredAll` also
			// carries cross-department prereqs for the credit budget.
			const required = new Set(requiredSetFor(p.subject, p.role, this.fourYear, this.isDouble));
			const requiredAll = new Set(required);
			// the degree's stated required-credit figure — prereqs only fill
			// the budget up to it, so a course's biology prereq (BIOS201 for an
			// env-studies major) doesn't inflate the requirement past the table
			const cap = requiredCreditsFor(p.subject, p.role, this.fourYear, this.isDouble);
			let sum = [...requiredAll].reduce((s, c) => s + byCode(c).credits, 0);
			const queue = [...required];
			while (queue.length) {
				const code = queue.pop()!;
				for (const pre of byCode(code).prereqs) {
					if (!reachableIn(pre, this.fourYear) || requiredAll.has(pre)) continue;
					if (byCode(pre).substitutes?.some((s) => requiredAll.has(s))) continue;
					if (cap !== undefined && sum + byCode(pre).credits > cap) continue;
					requiredAll.add(pre);
					sum += byCode(pre).credits;
					queue.push(pre);
					// it only READS as required (white) if it's a course of this
					// subject — a cross-department prereq stays a green 'other'
					// support course (it's on the site's list nowhere)
					if (byCode(pre).subjects.includes(p.subject)) required.add(pre);
				}
			}
			return {
				subject: p.subject,
				required,
				requiredAll,
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
		if (isCore(code)) return 'core'; // the foundation curriculum — everyone's requirement
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

	// true once more than one programme is on the plan — the grid then carries a
	// subtle per-programme accent so a double major / major+minor can tell which
	// requirement a course belongs to
	multiProgramme = $derived(this.programmes.length > 1);

	/** which chosen programme (by index) a course counts toward — drives the
	 *  subtle accent stripe. -1 when it belongs to none of them. A course is
	 *  attributed to the first programme whose requirement or department it is
	 *  part of, so the accents stay stable and each course wears one colour. */
	programmeOf(code: string): number {
		const c = byCode(code);
		for (let i = 0; i < this.programmeSets.length; i++) {
			const s = this.programmeSets[i];
			if (
				c.codes.some((x) => s.required.has(x) || s.pick.has(x) || s.elective.has(x)) ||
				c.subjects.includes(s.subject)
			)
				return i;
		}
		return -1;
	}

	/** the accent index to stamp on a chip/card: the programme it belongs to,
	 *  but only while several programmes share the plan (otherwise no accent) */
	accentOf(code: string): number | undefined {
		if (!this.multiProgramme) return undefined;
		const i = this.programmeOf(code);
		return i >= 0 ? i : undefined;
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

	// ── the drop laws: core-only slots, trimester offering, eligible years, prereq order ──
	canDrop(code: string, year: number, trim: TrimNum): boolean {
		// year-1 t1/t2: any foundation course drops anywhere here, always —
		// the max-4 rule is soft (the hints police it), nothing else applies
		if (this.coreOnly(year, trim)) return isCore(code);
		const course = byCode(code);
		// no term info → allow anywhere
		if (course.offered.length && !course.offered.includes(trim)) return false;
		// a 300-level course must not light up a year-2 slot
		if (course.eligibleYears.length && !course.eligibleYears.includes(year)) return false;
		// placed prereqs must stay strictly earlier (unplaced ones only warn);
		// a substitute (Proofs&Ideas ⇄ Discrete Maths ⇄ Maths Foundations)
		// placed earlier satisfies it too
		const order = year * 10 + trim;
		for (const pre of course.prereqs) {
			const subs = hasCode(pre) ? (byCode(pre).substitutes ?? []) : [];
			const ats = this.placed.filter((p) => p.code === pre || subs.includes(p.code));
			if (ats.length && !ats.some((at) => at.year * 10 + at.trim < order)) return false;
		}
		return true;
	}

	// ── actions ──
	place(code: string, year: number, trim: TrimNum) {
		if (this.coreOnly(year, trim) && !isCore(code)) {
			this.#setFlash(`year 1 t${trim} takes foundation (KCCS) courses only`);
			return;
		}
		// a 5th foundation course IS taken (so t1⇄t2 shuffles and retake
		// planning stay fluid even when both slots are full) — the hints
		// flag the over-max slot until it's resolved
		if (
			this.coreOnly(year, trim) &&
			this.slotCourses(year, trim).filter((c) => c !== code).length >= Y1_CORE_MAX
		) {
			this.#setFlash(`year 1 t${trim} is over the ${Y1_CORE_MAX}-course max now — move one out`);
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
		this.idealView = false;
		this.#idealStash = null;
		this.seedRecommended();
	}

	/** true while the grid differs from the last save — shows the save button */
	unsaved = $derived(!this.idealView && !samePlacements(this.placements, this.savedPlacements));

	/** the save button: keep the current grid as your plan (persists locally) */
	savePlan() {
		this.savedPlacements = copyPlacements(this.placements);
		this.#setFlash('plan saved ✓');
	}

	/** flip between your plan and a preview of the recommended path. Your
	 *  plan comes back exactly as you left it — the preview never touches it. */
	toggleIdealView() {
		if (this.idealView) {
			if (this.#idealStash) this.placements = this.#idealStash;
			this.#idealStash = null;
			this.idealView = false;
		} else {
			this.#idealStash = this.placements;
			this.seedRecommended();
			this.idealView = true;
		}
	}

	/** while previewing: take the ideal path as your own plan */
	adoptIdeal() {
		if (!this.idealView) return;
		this.#idealStash = null;
		this.idealView = false;
		this.#setFlash('the ideal path is now your plan — hit save to keep it');
	}

	/** no two active roles may point at the same subject — after a pick or
	 *  structure change, later roles bump off a collision (minor = cs when
	 *  the major just became cs → the minor moves to the first free subject) */
	ensureDistinctPicks() {
		const active: (keyof typeof this.picks)[] = ['major1'];
		if (this.structure === 'double-major') active.push('major2');
		if (this.structure === 'major-minor' || this.structure === 'major-minor-conc') active.push('minor');
		if (this.structure === 'major-minor-conc') active.push('conc');
		const taken = new Set<string>();
		for (const k of active) {
			const pool = k === 'major1' || k === 'major2' ? MAJOR_SUBJECTS : PROGRAMME_SUBJECTS;
			if (taken.has(this.picks[k])) {
				const free = pool.find((s) => !taken.has(s.id));
				if (free) this.picks[k] = free.id;
			}
			taken.add(this.picks[k]);
		}
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

		// A valid slot (lock, eligibility, offering, ordering, load all OK).
		// `spread` picks between two objectives:
		//   • spread=false → EARLIEST slot. Used for a course that still has
		//     dependents to place, so a prereq chain stays feasible (a t1-only
		//     course whose dependent is also t1-only must not land in the last
		//     year, or the dependent has nowhere to go).
		//   • spread=true → EMPTIEST slot (tie-break earliest). Used for a leaf
		//     course, so the required load fans out across the years — one or
		//     two per trimester — instead of stacking into year 2.
		const findSlot = (
			code: string,
			after: number,
			before = Infinity,
			spread = true
		): { y: number; t: TrimNum } | undefined => {
			const course = byCode(code);
			let best: { y: number; t: TrimNum } | undefined;
			let bestKey = [Infinity, Infinity];
			for (const y of this.years) {
				for (const t of TRIMS) {
					// year-1 t1/t2 are reserved for the foundation core (seeded below)
					if (this.coreOnly(y, t)) continue;
					if (course.eligibleYears.length && !course.eligibleYears.includes(y)) continue;
					if (course.offered.length && !course.offered.includes(t)) continue;
					const order = y * 10 + t;
					if (order <= after || order >= before) continue;
					const l = load(y, t);
					if (l + course.credits > TRIM_NORMAL_MAX) continue;
					// primary/secondary sort key: by load then order when spreading,
					// by order then load when packing a chain in early
					const key = spread ? [l, order] : [order, l];
					if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
						best = { y, t };
						bestKey = key;
					}
				}
			}
			return best;
		};

		// ── the foundation core seeds first ──
		// year-1 t1/t2 take ONLY these (4 per trimester), the rest fan into
		// y1 t3 / year 2, and the year-3-only Engaging with the Environment
		// lands in year 3. Most-constrained first (fewest offered trimesters),
		// so the t1-only courses claim y1 t1 before the flexible ones fill it.
		const coreSlots: { y: number; t: TrimNum }[] = this.years.flatMap((y) =>
			TRIMS.map((t) => ({ y, t: t as TrimNum }))
		);
		const cores = [...CORE_COURSES].sort(
			(a, b) => (a.offered.length || TRIMS.length) - (b.offered.length || TRIMS.length)
		);
		for (const course of cores) {
			for (const { y, t } of coreSlots) {
				if (course.eligibleYears.length && !course.eligibleYears.includes(y)) continue;
				if (course.offered.length && !course.offered.includes(t)) continue;
				if (this.coreOnly(y, t)) {
					if ((placements[slotKey(y, t)] ?? []).length >= Y1_CORE_MAX) continue;
				} else if (load(y, t) + course.credits > TRIM_NORMAL_MAX) {
					continue;
				}
				put(course.code, y, t);
				break;
			}
		}

		// the required set for every programme (already capped at the credit
		// table's required figure), unioned — the default plan seeds exactly
		// these, so the elective credits the table allows stay OPEN for the
		// student to fill (maths: 52 required placed, 8 left — not pre-filled)
		const requiredUnion = new Set(
			this.programmes.flatMap((prog) => requiredSetFor(prog.subject, prog.role, this.fourYear, this.isDouble))
		);

		// the departments' published pathways first, where they exist — but
		// only for the courses that are actually required, so a pathway's
		// recommended electives (maths Topology 1) aren't force-placed
		for (const prog of this.programmes) {
			for (const { year, trim, code } of recommendedFor(prog.subject, prog.role, this.fourYear, this.isDouble)) {
				if (pos.has(code) || !requiredUnion.has(code)) continue;
				// the published grid itself is not always feasible (it lists
				// MATH427 alongside its prerequisite MATH303) — never place a
				// course at or before a prerequisite already on the grid
				const after = Math.max(0, ...byCode(code).prereqs.map((p) => pos.get(p) ?? 0));
				if (this.years.includes(year) && !this.coreOnly(year, trim) && year * 10 + trim > after) {
					put(code, year, trim);
				} else {
					// pathway claims a core-only/invisible slot (e.g. MATH191 in
					// y1 t1) or one that breaks prereq order — tuck it into
					// the earliest slot that actually works
					const slot = findSlot(code, after);
					if (slot) put(code, slot.y, slot.t);
				}
			}
		}

		// a placed course, or one about to be scheduled, counts any of its
		// interchangeable substitutes as itself (Discrete Maths or Maths
		// Foundations satisfies a Proofs-and-Ideas prereq, and vice-versa)
		const subs = (code: string): string[] => (hasCode(code) ? (byCode(code).substitutes ?? []) : []);

		// Everything the programmes require that the pathways didn't place,
		// PLUS the prerequisites those courses depend on (the 1-credit tools
		// courses, BIOS207 which the required BIOS228 needs, …). Building the
		// closure up front and scheduling it in ONE prereq-ordered pass is
		// what keeps a pulled-in prereq ordered after ITS OWN prereqs — the
		// old separate "pull in prerequisites" loop dropped them into the
		// earliest free slot and put BIOS207 ahead of BIOS201.
		const remaining = new Set(requiredUnion);
		for (const code of [...remaining]) {
			const stack = hasCode(code) ? [...byCode(code).prereqs] : [];
			while (stack.length) {
				const pre = stack.pop()!;
				if (!hasCode(pre) || remaining.has(pre) || !reachableIn(pre, this.fourYear)) continue;
				if (subs(pre).some((s) => remaining.has(s))) continue; // a substitute already covers it
				// only pull in a prereq from one of the student's OWN departments.
				// A cross-department prereq (the computer-science courses behind a
				// data-science requirement, biology's BIOS201 behind an env-studies
				// course) isn't on the programme's list — seeding it buries the plan
				// in green 'other' support courses. The prereq LAW still flags the
				// ordering if the student chooses to add it.
				if (!byCode(pre).subjects.some((subj) => this.selectedSubjects.includes(subj))) continue;
				remaining.add(pre);
				stack.push(...byCode(pre).prereqs);
			}
		}
		for (const code of [...remaining]) if (!hasCode(code) || pos.has(code)) remaining.delete(code);

		// greedy earliest-fit over all programmes together; foundational
		// courses (the ones that unlock the most) go first so prereqs land
		// before their dependents
		let progress = true;
		while (remaining.size && progress) {
			progress = false;
			const order = [...remaining].sort((a, b) => byCode(b).unlocks.length - byCode(a).unlocks.length);
			for (const code of order) {
				const course = byCode(code);
				// wait until every prereq we're also scheduling (or one of its
				// substitutes) has been placed
				const preReady = course.prereqs.every(
					(p) => !(remaining.has(p) || subs(p).some((s) => remaining.has(s)))
				);
				if (!preReady) continue;
				const after = Math.max(
					0,
					...course.prereqs.map((p) => Math.max(pos.get(p) ?? 0, ...subs(p).map((s) => pos.get(s) ?? 0)))
				);
				// and stay strictly before any already-placed dependent
				const before = Math.min(Infinity, ...course.unlocks.map((u) => pos.get(u) ?? Infinity));
				// a course that still has a dependent to schedule is packed in as
				// early as possible (keeping the chain feasible); a leaf course
				// fans out to the emptiest trimester
				const hasDownstream = course.unlocks.some((u) => remaining.has(u));
				const slot = findSlot(code, after, before, !hasDownstream);
				if (slot) put(code, slot.y, slot.t);
				// placed or unplaceable — either way it's off the list
				remaining.delete(code);
				progress = true;
			}
		}

		this.placements = placements;
	}

	toggleFilter(subjectId: string) {
		if (this.filters.includes(subjectId)) {
			this.filters = this.filters.filter((f) => f !== subjectId);
			return;
		}
		// the foundation-core view is exclusive: checking kccs clears the
		// subject filters, checking any subject clears kccs — you browse
		// either the core or your programmes' departments, never a mix
		this.filters =
			subjectId === 'core' ? ['core'] : [...this.filters.filter((f) => f !== 'core'), subjectId];
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
		// are the foundation core and t3 carries no min or max at all.
		for (const year of this.years) {
			if (year === 1) continue;
			for (const trim of TRIMS) {
				const c = this.slotCredits(year, trim);
				if (c < TRIM_MIN) {
					hints.push({
						// a credit-count issue is a caution (yellow), not a hard
						// error — you top a light trimester up with other courses
						kind: 'caution',
						text: `Y${year} T${trim} is under the ${TRIM_MIN}-credit minimum (${c}/${TRIM_MIN})`,
						codes: []
					});
				}
			}
		}

		// law 0.5 — the foundation core: all twelve KCCS courses must be on
		// the plan (year-1 t1/t2 only ever hold them, max 4 each — the drop
		// laws enforce that; a stale save could still break it, so check too)
		const missingCore = CORE_COURSES.filter((c) => !this.placedCodes.has(c.code));
		if (missingCore.length) {
			hints.push({
				kind: 'caution',
				text: `${missingCore.length} foundation course${missingCore.length === 1 ? '' : 's'} still to place: ${missingCore
					.map((c) => c.code)
					.join(', ')}`,
				codes: missingCore.map((c) => c.code)
			});
		} else {
			hints.push({ kind: 'good', text: 'all foundation courses are on the plan', codes: [] });
		}
		for (const trim of [1, 2] as TrimNum[]) {
			const codes = this.slotCourses(1, trim);
			const nonCore = codes.filter((c) => !isCore(c));
			if (nonCore.length) {
				hints.push({
					kind: 'warn',
					text: `year 1 t${trim} can only hold foundation (KCCS) courses`,
					codes: nonCore
				});
			}
			if (codes.length > Y1_CORE_MAX) {
				hints.push({
					kind: 'warn',
					text: `year 1 t${trim} can hold at most ${Y1_CORE_MAX} foundation courses (${codes.length}/${Y1_CORE_MAX})`,
					codes
				});
			}
		}

		// law 1 — prerequisites must come in an earlier trimester. A placed
		// substitute (MATH191 ⇄ COMP201) satisfies the prerequisite too.
		for (const p of this.placed) {
			const course = byCode(p.code);
			for (const pre of course.prereqs) {
				const subs = hasCode(pre) ? (byCode(pre).substitutes ?? []) : [];
				const placedAt = [pos.get(pre), ...subs.map((s) => pos.get(s))].filter((x) => x !== undefined);
				const prePos = placedAt.length ? placedAt.reduce((a, b) => (a.order <= b.order ? a : b)) : undefined;
				if (!prePos) {
					hints.push({
						kind: 'warn',
						text: `${p.code} requires prerequisite ${pre}${subs.length ? ` (or ${subs.join('/')})` : ''}`,
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

		// law 2 — substitute courses are interchangeable (Proofs and Ideas,
		// Discrete Mathematics, Mathematical Foundations of Data Science)
		for (const p of this.placed) {
			const course = byCode(p.code);
			for (const otherCode of course.substitutes ?? []) {
				const other = byCode(otherCode);
				if (pos.has(other.code)) {
					// both placed — redundant, not wrong. Emit once per pair
					// (the lower code speaks) so a 3-way group isn't noisy.
					if (p.code < other.code) {
						hints.push({
							kind: 'info',
							text: `${p.code} and ${other.code} are interchangeable — you only need one`,
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
						kind: 'caution',
						text: `Y${year} T${trim} is over the ${TRIM_HARD_MAX}-credit cap (${credits}/${TRIM_HARD_MAX})`,
						codes: this.slotCourses(year, trim)
					});
				} else if (credits > TRIM_NORMAL_MAX) {
					heavy.push({ year, trim, credits });
				}
			}
		}
		if (heavy.length > HEAVY_TRIMS_ALLOWED) {
			hints.push({
				kind: 'caution',
				text: `only ${HEAVY_TRIMS_ALLOWED} trimesters in your whole tenure may go over ${TRIM_NORMAL_MAX} credits — you have ${heavy.length}`,
				codes: heavy.flatMap((h) => this.slotCourses(h.year, h.trim))
			});
		} else {
			for (const h of heavy) {
				hints.push({
					kind: 'info',
					text: `Y${h.year} T${h.trim} is a heavy trimester (${h.credits}/${TRIM_HARD_MAX}) — ${HEAVY_TRIMS_ALLOWED} allowed`,
					codes: []
				});
			}
		}

		// law 4 — audits are limited (only the ones the student marked), and
		// the drop form excludes KCCS / 391 / 490 / 491 and any course that
		// isn't 2 or 4 credits from being audited at all
		const badAudits = this.audited.filter((code) => !canAudit(code));
		if (badAudits.length) {
			hints.push({
				kind: 'warn',
				text: `${badAudits.join(', ')} can not be audited — audits must be 2- or 4-credit courses, never KCCS/391/490/491`,
				codes: badAudits
			});
		}
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

		// law 5 — degree credit total, and the drop form's hard ceiling on
		// extra credits (128 for a 3-year tenure, 176 for a 4-year one)
		const tenureCap = this.fourYear ? MAX_TOTAL_4YR : MAX_TOTAL_3YR;
		if (this.totalPlacedCredits > tenureCap) {
			hints.push({
				kind: 'warn',
				text: `total credits exceed the ${tenureCap}-credit ceiling for the ${this.fourYear ? 'four' : 'three'}-year programme (${this.totalPlacedCredits}/${tenureCap})`,
				codes: []
			});
		} else if (this.totalPlacedCredits > this.degreeTotal) {
			hints.push({
				kind: 'caution',
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
			// core closed over prereqs (incl. a cross-department prereq that
			// fills the credit budget, like BIOS201 for env studies) plus the
			// choice pools. requiredAll (not required) so those support courses
			// still count toward the degree's required credits.
			const structure = new Set([...sets.requiredAll, ...sets.pick]);
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

	// ── choice pools per programme (history's "any three of…" groups) ──
	// the website's 'choose N from' groups the seeded required core can't make
	// for the student — shown in the sidebar so the choices are visible
	choices = $derived.by(() =>
		this.programmes
			.map((prog) => ({
				role: prog.role,
				label: subjectById(prog.subject).label,
				groups: choiceGroupsFor(prog.subject, prog.role, this.fourYear, this.isDouble)
			}))
			.filter((p) => p.groups.length)
	);

	// ── catalogue (filtered + sorted) ──
	catalogue: Course[] = $derived.by(() => {
		let list = COURSES;
		if (this.zoom) {
			const trim = this.zoom.trim;
			list = list.filter((c) => c.offered.includes(trim));
		}
		// the foundation-core filter is always available, on top of whatever
		// subjects the chosen programmes bring — but its courses only show
		// while it's checked, so the everyday browse stays your departments
		const checked = this.filters.filter((f) => f === 'core' || this.selectedSubjects.includes(f));
		if (!checked.includes('core')) list = list.filter((c) => c.subject !== 'core');
		if (checked.length > 0) list = list.filter((c) => c.subjects.some((s) => checked.includes(s)));
		const q = this.search.trim().toLowerCase();
		if (q) list = list.filter((c) => c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q));
		const rank: Record<CourseType, number> = { core: 0, required: 1, elective: 2, other: 3 };
		return [...list].sort(
			(a, b) => rank[this.courseType(a.code)] - rank[this.courseType(b.code)] || a.code.localeCompare(b.code)
		);
	});
}
