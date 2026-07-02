<script lang="ts">
	import { browser } from '$app/environment';
	import data from '$lib/data/courses.json';

	type CourseRec = {
		code: string;
		title: string;
		discp: string;
		credits: string;
		type: string;
		faculty: string;
		terms: string[];
		desc: string;
		prereqs: string[];
		unlocks: string[];
	};

	const courses: Record<string, CourseRec> = data.courses;
	const catalogue = Object.values(courses).sort((a, b) => a.code.localeCompare(b.code));

	const SUBJECT_LABELS: Record<string, string> = {
		ARTS: 'arts',
		BIOS: 'biological sciences',
		BUSI: 'business studies',
		CHEM: 'chemistry',
		COMP: 'computer science',
		CWPC: 'writing',
		DATA: 'data science',
		ECON: 'economics',
		ENVS: 'environmental studies',
		HIST: 'history',
		LITT: 'literature',
		MATH: 'mathematics',
		PHIL: 'philosophy',
		PHYS: 'physics',
		POLT: 'politics',
		PSYC: 'psychology',
		SOCL: 'sociology'
	};
	const SUBJECTS = [...new Set(catalogue.map((c) => c.discp))].sort();
	const label = (s: string) => SUBJECT_LABELS[s] ?? s.toLowerCase();

	// the laws' numbers
	const DEGREE_TOTAL = { threeYear: 84, fourYear: 96 };
	const ROLE_CREDITS: Record<string, number> = { major: 60, minor: 24, concentration: 16 };

	const credits = (c: CourseRec) => parseInt(c.credits) || 4;

	// slot order defines "earlier": y1t1 < y1t2 < y1t3 < y2t1 < ...
	const TRIMS = [1, 2, 3];
	const ALL_SLOTS = [1, 2, 3, 4].flatMap((y) => TRIMS.map((t) => `y${y}t${t}`));

	// first-year T1/T2 are fixed (core courses) — nothing can be placed there
	const LOCKED = new Set(['y1t1', 'y1t2']);

	type StructureKind = 'double-major' | 'major-minor' | 'major-minor-conc' | 'major-2conc';

	const STORAGE_KEY = 'tracey-plan';

	function emptyPlan(): Record<string, string[]> {
		return Object.fromEntries(ALL_SLOTS.map((s) => [s, []]));
	}

	const DEFAULTS = {
		fourYear: false,
		structure: 'major-minor' as StructureKind,
		picks: { major1: 'COMP', major2: 'ECON', minor: 'MATH', conc1: 'PHYS', conc2: 'DATA' },
		filters: [] as string[]
	};

	function loadState() {
		const state = { plan: emptyPlan(), ...structuredClone(DEFAULTS) };
		if (!browser) return state;
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return state;
			const parsed = JSON.parse(raw);
			const planSrc = parsed.plan ?? parsed; // older saves were the bare plan
			for (const s of ALL_SLOTS) {
				if (LOCKED.has(s)) continue;
				if (Array.isArray(planSrc[s])) state.plan[s] = planSrc[s].filter((c: string) => courses[c]);
			}
			if (typeof parsed.fourYear === 'boolean') state.fourYear = parsed.fourYear;
			if (['double-major', 'major-minor', 'major-minor-conc', 'major-2conc'].includes(parsed.structure))
				state.structure = parsed.structure;
			for (const k of Object.keys(state.picks) as (keyof typeof state.picks)[]) {
				if (SUBJECTS.includes(parsed.picks?.[k])) state.picks[k] = parsed.picks[k];
			}
			if (Array.isArray(parsed.filters)) state.filters = parsed.filters.filter((f: string) => SUBJECTS.includes(f));
			return state;
		} catch {
			return state;
		}
	}

	const initial = loadState();
	let plan = $state(initial.plan);
	let fourYear = $state(initial.fourYear);
	let structure = $state<StructureKind>(initial.structure);
	let picks = $state(initial.picks);
	let filters = $state<string[]>(initial.filters);
	let search = $state('');
	let selected = $state<CourseRec | null>(null);
	let dragging = $state<string | null>(null);

	// terms like "25_T2" → the course runs in the t2 column (T2/T5/T8/T11);
	// no term info → allow anywhere
	function offeredTrims(c: CourseRec): number[] {
		return [...new Set(c.terms.map((t) => Number(t.slice(-1))))].sort();
	}

	$effect(() => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ plan, fourYear, structure, picks, filters })
		);
	});

	let YEARS = $derived(fourYear ? [1, 2, 3, 4] : [1, 2, 3]);
	let SLOTS = $derived(YEARS.flatMap((y) => TRIMS.map((t) => `y${y}t${t}`)));
	let degreeTotal = $derived(fourYear ? DEGREE_TOTAL.fourYear : DEGREE_TOTAL.threeYear);

	let programmes = $derived.by(() => {
		switch (structure) {
			case 'double-major':
				return [
					{ role: 'major', subject: picks.major1 },
					{ role: 'major', subject: picks.major2 }
				];
			case 'major-minor':
				return [
					{ role: 'major', subject: picks.major1 },
					{ role: 'minor', subject: picks.minor }
				];
			case 'major-minor-conc':
				return [
					{ role: 'major', subject: picks.major1 },
					{ role: 'minor', subject: picks.minor },
					{ role: 'concentration', subject: picks.conc1 }
				];
			case 'major-2conc':
				return [
					{ role: 'major', subject: picks.major1 },
					{ role: 'concentration', subject: picks.conc1 },
					{ role: 'concentration', subject: picks.conc2 }
				];
		}
	});

	let selectedSubjects = $derived(programmes.map((p) => p.subject));

	let placedIn = $derived.by(() => {
		const m = new Map<string, number>(); // code -> slot index
		SLOTS.forEach((s, i) => {
			for (const code of plan[s]) m.set(code, i);
		});
		return m;
	});

	let totalPlacedCredits = $derived(
		[...placedIn.keys()].reduce((sum, code) => sum + credits(courses[code]), 0)
	);

	const isRequired = (c: CourseRec) => /required|core/i.test(c.type);

	let stats = $derived.by(() =>
		programmes.map((prog) => {
			const inSubject = [...placedIn.keys()]
				.map((code) => courses[code])
				.filter((c) => c.discp === prog.subject);
			const placedCredits = inSubject.reduce((s, c) => s + credits(c), 0);
			const requiredAll = catalogue.filter((c) => c.discp === prog.subject && isRequired(c));
			const requiredNeeded = requiredAll.reduce((s, c) => s + credits(c), 0);
			const requiredDone = inSubject.filter(isRequired).reduce((s, c) => s + credits(c), 0);
			const total = ROLE_CREDITS[prog.role];
			return {
				role: prog.role,
				label: label(prog.subject),
				totalCredits: total,
				creditsLeft: Math.max(0, total - placedCredits),
				placedCredits,
				requiredDone,
				requiredNeeded
			};
		})
	);

	let warnings = $derived.by(() => {
		const out: { text: string; codes: string[]; kind: 'warn' | 'info' }[] = [];
		SLOTS.forEach((s, i) => {
			const trim = Number(s.slice(-1));
			for (const code of plan[s]) {
				for (const pre of courses[code]?.prereqs ?? []) {
					const at = placedIn.get(pre);
					if (at === undefined || at >= i) {
						out.push({
							text: `${code} is missing prerequisite ${pre}`,
							codes: [code, pre],
							kind: 'warn'
						});
					}
				}
				const offered = offeredTrims(courses[code]);
				if (offered.length && !offered.includes(trim)) {
					out.push({
						text: `${code} only runs in ${offered.map((t) => `t${t}`).join('/')} — not t${trim}`,
						codes: [code],
						kind: 'warn'
					});
				}
			}
		});

		// credit caps: 20 normally, 28 at most, and only two heavy trimesters
		const heavy: { s: string; cr: number }[] = [];
		for (const s of SLOTS) {
			const cr = plan[s].reduce((sum, code) => sum + credits(courses[code]), 0);
			const at = `y${s[1]} t${s[3]}`;
			if (cr > 28) {
				out.push({ text: `${at} is over the 28-credit cap (${cr})`, codes: plan[s], kind: 'warn' });
			} else if (cr > 20) {
				heavy.push({ s, cr });
			}
		}
		if (heavy.length > 2) {
			out.push({
				text: `only 2 trimesters may go over 20 credits — you have ${heavy.length}`,
				codes: heavy.flatMap((h) => plan[h.s]),
				kind: 'warn'
			});
		} else {
			for (const h of heavy) {
				out.push({
					text: `y${h.s[1]} t${h.s[3]} is a heavy trimester (${h.cr}/28)`,
					codes: [],
					kind: 'info'
				});
			}
		}
		return out;
	});

	let flaggedCodes = $derived(
		new Set(warnings.filter((w) => w.kind === 'warn').flatMap((w) => w.codes))
	);

	let filtered = $derived.by(() => {
		let list = catalogue;
		const checked = filters.filter((f) => selectedSubjects.includes(f));
		if (checked.length > 0) list = list.filter((c) => checked.includes(c.discp));
		const q = search.trim().toLowerCase();
		if (!q) return list;
		return list.filter(
			(c) => c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
		);
	});

	// rough course-type fill: anything marked required/core gets the white
	// "required" card, the rest read as electives
	function fillType(c: CourseRec): string {
		return isRequired(c) ? 'required' : 'elective';
	}

	function toggleFilter(subject: string) {
		filters = filters.includes(subject)
			? filters.filter((f) => f !== subject)
			: [...filters, subject];
	}

	/** the drop laws: locked slots, trimester offering, prereq order */
	function canDrop(code: string, slot: string): boolean {
		if (LOCKED.has(slot)) return false;
		const c = courses[code];
		const trim = Number(slot.slice(-1));
		const offered = offeredTrims(c);
		if (offered.length && !offered.includes(trim)) return false;
		const i = SLOTS.indexOf(slot);
		if (i === -1) return false;
		// placed prereqs must stay strictly earlier (unplaced ones only warn)
		for (const pre of c.prereqs) {
			const at = placedIn.get(pre);
			if (at !== undefined && at >= i) return false;
		}
		return true;
	}

	function dragstart(e: DragEvent, code: string) {
		e.dataTransfer?.setData('text/plain', code);
		dragging = code;
	}

	function dragend() {
		dragging = null;
	}

	// dropping anywhere is allowed (the hints flag bad placements) —
	// except the fixed first-year slots, which take nothing
	function drop(e: DragEvent, slot: string) {
		e.preventDefault();
		dragging = null;
		const code = e.dataTransfer?.getData('text/plain');
		if (!code || !courses[code] || LOCKED.has(slot)) return;
		remove(code);
		plan[slot] = [...plan[slot], code];
	}

	function remove(code: string) {
		for (const s of ALL_SLOTS) {
			if (plan[s].includes(code)) plan[s] = plan[s].filter((c) => c !== code);
		}
	}
</script>

<div class="app">
	<!-- ── structure form + hints ── -->
	<aside class="leftbar">
		<div class="controls">
			<label class="row">
				<span class="row-label">4yup</span>
				<input type="checkbox" class="tick" bind:checked={fourYear} />
			</label>

			<label class="row">
				<span class="row-label">plan</span>
				<select bind:value={structure}>
					<option value="double-major">double major</option>
					<option value="major-minor">major + minor</option>
					<option value="major-minor-conc">major + minor + conc.</option>
					<option value="major-2conc">major + 2 conc.</option>
				</select>
			</label>

			<label class="row">
				<span class="row-label">major</span>
				<select bind:value={picks.major1}>
					{#each SUBJECTS as s (s)}
						<option value={s}>{label(s)}</option>
					{/each}
				</select>
			</label>

			{#if structure === 'double-major'}
				<label class="row">
					<span class="row-label">major</span>
					<select bind:value={picks.major2}>
						{#each SUBJECTS as s (s)}
							<option value={s}>{label(s)}</option>
						{/each}
					</select>
				</label>
			{:else if structure === 'major-minor' || structure === 'major-minor-conc'}
				<label class="row">
					<span class="row-label">minor</span>
					<select bind:value={picks.minor}>
						{#each SUBJECTS as s (s)}
							<option value={s}>{label(s)}</option>
						{/each}
					</select>
				</label>
			{/if}

			{#if structure === 'major-minor-conc' || structure === 'major-2conc'}
				<label class="row">
					<span class="row-label">conc.</span>
					<select bind:value={picks.conc1}>
						{#each SUBJECTS as s (s)}
							<option value={s}>{label(s)}</option>
						{/each}
					</select>
				</label>
			{/if}

			{#if structure === 'major-2conc'}
				<label class="row">
					<span class="row-label">conc.</span>
					<select bind:value={picks.conc2}>
						{#each SUBJECTS as s (s)}
							<option value={s}>{label(s)}</option>
						{/each}
					</select>
				</label>
			{/if}
		</div>

		<div class="hints-bar">INFORMATION</div>

		<div class="stats">
			<div>total credits: {degreeTotal}</div>
			<div>credits left: {Math.max(0, degreeTotal - totalPlacedCredits)}</div>

			{#each stats as s, i (s.role + s.label + i)}
				<div class="prog-name">{s.label}</div>
				{#if s.role === 'major'}
					<div>total credits: {s.totalCredits}</div>
					<div>credits left: {s.creditsLeft}</div>
					<div>required : {s.requiredDone}/{s.requiredNeeded}</div>
				{:else}
					<div class="muted">{s.role}</div>
					<div>requirements: {s.totalCredits}</div>
					<div>done: {s.placedCredits}</div>
				{/if}
			{/each}
		</div>

		<div class="hints-bar">HINTS</div>

		<div class="chips">
			{#if warnings.length}
				{#each warnings as w, i (w.text + i)}
					<div class="hint {w.kind}">{w.text}</div>
				{/each}
			{:else}
				<div class="hint good">no problems — plan away</div>
			{/if}
		</div>
	</aside>

	<!-- ── catalogue sidebar ── -->
	<aside class="sidebar">
		<div class="brand">
			<span class="brand-big">catalogue</span>
		</div>

		<div class="search-row">
			<input type="search" placeholder="search course" bind:value={search} />
			<div class="filter-chips">
				{#each [...new Set(selectedSubjects)] as s (s)}
					<label class="filter-chip">
						<input
							type="checkbox"
							class="tick"
							checked={filters.includes(s)}
							onchange={() => toggleFilter(s)}
						/>
						{s.toLowerCase()}
					</label>
				{/each}
			</div>
		</div>

		<div class="catalogue" role="list">
			{#each filtered as c (c.code)}
				<div
					class="card"
					data-type={fillType(c)}
					class:placed={placedIn.has(c.code)}
					draggable={!placedIn.has(c.code)}
					role="listitem"
					ondragstart={(e) => dragstart(e, c.code)}
					ondragend={dragend}
					onclick={() => (selected = c)}
					title={placedIn.has(c.code)
						? `${c.code} is already on your plan`
						: `drag ${c.code} onto the grid`}
				>
					<span class="code">{c.code}</span>
					<span class="title">{c.title}</span>
					<span class="credits">credits : {credits(c)}</span>
				</div>
			{/each}
		</div>
	</aside>

	<!-- ── plan board ── -->
	<main class="board">
		<div class="overview" style="--cols: {TRIMS.length}">
			<div class="corner"></div>
			{#each TRIMS as t (t)}
				<div class="trim-head">t{t}</div>
			{/each}

			{#each YEARS as y (y)}
				<div class="year-head">y{y}</div>
				{#each TRIMS as t (t)}
					{@const slot = `y${y}t${t}`}
					{@const locked = LOCKED.has(slot)}
					{@const slotCredits = plan[slot].reduce((sum, code) => sum + credits(courses[code]), 0)}
					<div
						class="cell"
						class:locked
						class:problem={plan[slot].some((c) => flaggedCodes.has(c))}
						class:can-drop={dragging !== null && canDrop(dragging, slot)}
						class:no-drop={dragging !== null && !canDrop(dragging, slot)}
						role="list"
						aria-label="year {y} trimester {t}"
						ondragover={(e) => e.preventDefault()}
						ondrop={(e) => drop(e, slot)}
					>
						{#if locked}
							<span class="fixed-note">fixed</span>
						{/if}
						{#each plan[slot] as code (code)}
							<div
								class="chip"
								class:flagged={flaggedCodes.has(code)}
								data-type={fillType(courses[code])}
								draggable="true"
								role="listitem"
								ondragstart={(e) => dragstart(e, code)}
								ondragend={dragend}
								onclick={() => (selected = courses[code])}
							>
								{code}
								<button
									class="x"
									aria-label="remove {code}"
									onclick={(e) => {
										e.stopPropagation();
										remove(code);
									}}>×</button
								>
							</div>
						{/each}
						{#if slotCredits > 0}
							<span class="cell-credits" class:over={slotCredits > 20}>{slotCredits} cr</span>
						{/if}
					</div>
				{/each}
			{/each}
		</div>
	</main>

	<!-- ── course content ── -->
	<aside class="rightbar">
		<div class="hints-bar">COURSE</div>
		{#if selected}
			<div class="details">
				<div class="d-head">
					<span class="d-code">{selected.code}</span>
					<span class="d-title">{selected.title}</span>
				</div>

				<div class="d-meta">
					<div class="d-stat">
						<span class="d-stat-label">credits</span>
						<span class="d-stat-value">{credits(selected)}</span>
					</div>
					<div class="d-stat">
						<span class="d-stat-label">offered</span>
						<span class="d-stat-value"
							>{offeredTrims(selected).map((t) => `t${t}`).join(' ') || '—'}</span
						>
					</div>
					<div class="d-stat">
						<span class="d-stat-label">type</span>
						<span class="d-stat-value">{fillType(selected)}</span>
					</div>
				</div>

				{#if selected.prereqs.length}
					<div class="label">needs first</div>
					<div class="d-chips">
						{#each selected.prereqs as p (p)}
							<button class="d-chip" onclick={() => (selected = courses[p] ?? selected)}>{p}</button>
						{/each}
					</div>
				{/if}

				{#if selected.unlocks.length}
					<div class="label">unlocks</div>
					<div class="d-chips">
						{#each selected.unlocks as u (u)}
							<button class="d-chip" onclick={() => (selected = courses[u] ?? selected)}>{u}</button>
						{/each}
					</div>
				{/if}

				{#if selected.desc}
					<div class="label">about</div>
					<p class="d-desc">{selected.desc}</p>
				{/if}
			</div>
		{:else}
			<div class="details">
				<p class="empty">click a course to see its details</p>
			</div>
		{/if}
	</aside>
</div>


<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.app {
		display: grid;
		grid-template-columns: 26rem 30rem 1fr 28rem;
		height: 100vh;
		background: var(--color-bg);

		@include mobile {
			grid-template-columns: 1fr;
			height: auto;
		}
	}

	// ── leftmost: structure form + hints ──
	.leftbar {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow-y: auto;
		background: linear-gradient(to bottom, var(--color-bg-sidebar), var(--color-bg-sidebar-end));
		border-right: 1px solid var(--color-border-warm);
	}

	// ── left: brand + catalogue ──
	.sidebar {
		display: flex;
		flex-direction: column;
		min-height: 0;
		background: linear-gradient(to bottom, var(--color-bg-sidebar), var(--color-bg-sidebar-end));
		border-right: 1px solid var(--color-border-warm);
	}

	.brand {
		display: flex;
		flex-direction: column;
		padding: 1.6rem 2rem 1.8rem;
		background: linear-gradient(to bottom, var(--color-brand-start), var(--color-brand-end));
		color: var(--color-brand-text);
		@include card-shine;

		.brand-big {
			font-size: 3rem;
			font-weight: 400;
			line-height: 1.1;
		}
	}

	.search-row {
		padding: 1.2rem 1.2rem 0.6rem;

		input[type='search'] {
			width: 100%;
			padding: 0.8rem 1rem;
			font-size: 1.3rem;
			color: var(--color-text);
			background: var(--color-bg-light);
			border: 1px solid var(--color-border-card);
			border-radius: 4px;
			outline: none;
			@include card-shine;

			&::placeholder {
				color: var(--color-text-muted);
			}

			&:focus {
				border-color: var(--color-border-light);
			}
		}
	}

	.filter-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.4rem;
		padding: 0.8rem 0.2rem 0.2rem;
	}

	.filter-chip {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 1.3rem;
		cursor: pointer;
	}

	// square checkbox: grey when off, deep red when on
	.tick {
		appearance: none;
		width: 1.6rem;
		height: 1.6rem;
		background: var(--color-grid-cell);
		border: 1px solid var(--color-border-card);
		border-radius: 2px;
		cursor: pointer;

		&:checked {
			background: #a01414;
			border-color: #7c1010;
		}
	}

	.catalogue {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		padding: 1rem 1.2rem 1.6rem;
		overflow-y: auto;
	}

	.card {
		display: flex;
		flex-direction: column;
		padding: 1rem 1.2rem;
		border-radius: 4px;
		cursor: grab;
		@include course-type-fill;
		@include card-shine;

		&:hover {
			@include card-shine-hover;
		}

		&.placed {
			background: transparent;
			border: 1.5px dashed var(--color-border-card);
			box-shadow: none;
			color: var(--color-text-muted);
			cursor: default;
		}

		.code {
			font-size: 1.5rem;
			font-weight: 700;
		}

		.title {
			font-size: 1.3rem;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.credits {
			margin-top: 0.2rem;
			font-size: 1.2rem;
			color: var(--color-text-muted);
		}
	}

	// ── centre: the grid ──
	.board {
		overflow-y: auto;
		min-height: 0;
	}

	.overview {
		display: grid;
		grid-template-columns: 4rem repeat(var(--cols), 1fr);
		gap: 1rem;
		padding: 2.4rem 3.2rem;
	}

	.trim-head {
		font-size: 2.2rem;
		text-align: center;
		padding-bottom: 0.4rem;
	}

	.year-head {
		font-size: 2.2rem;
		align-self: center;
	}

	.cell {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		align-content: flex-start;
		gap: 0.8rem;
		min-height: 13rem;
		padding: 1rem 1rem 2.2rem;
		background: var(--color-grid-cell);
		border-radius: 3px;
		transition: background 0.15s ease;
		@include card-shine;

		&:hover {
			background: var(--color-drop-hint);
		}

		&.problem {
			background: var(--color-grid-cell-problem);
		}

		// while dragging: mint where the course fits, faded where it doesn't
		&.can-drop {
			background: var(--color-course-audit);
			outline: 2px dashed var(--color-border-audit);
			outline-offset: -2px;
		}

		&.no-drop {
			opacity: 0.45;
		}

		&.locked {
			background: transparent;
			border: 2px dashed var(--color-border-card);
			box-shadow: none;
			cursor: not-allowed;

			&:hover {
				background: transparent;
			}
		}
	}

	.cell-credits {
		position: absolute;
		bottom: 0.5rem;
		right: 0.8rem;
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--color-text-muted);

		&.over {
			color: #a01414;
		}
	}

	.fixed-note {
		@include section-label;
		width: 100%;
		text-align: center;
		align-self: center;
	}

	.chip {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		height: fit-content;
		padding: 0.7rem 1rem;
		font-size: 1.3rem;
		border-radius: 3px;
		cursor: grab;
		@include course-type-fill;
		@include card-shine;

		&.flagged {
			font-weight: 700;
		}

		.x {
			display: none;
			background: none;
			border: none;
			font-size: 1.3rem;
			line-height: 1;
			color: var(--color-text-muted);
			cursor: pointer;

			&:hover {
				color: var(--color-text);
			}
		}

		&:hover .x {
			display: block;
		}
	}

	// ── right: structure form + hints + details ──
	.rightbar {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow-y: auto;
		background: linear-gradient(to bottom, var(--color-bg-sidebar), var(--color-bg-sidebar-end));
		border-left: 1px solid var(--color-border-warm);
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.6rem 1.4rem;
		border-bottom: 1px solid var(--color-border-divider);
	}

	.row {
		display: grid;
		grid-template-columns: 5.4rem 1fr;
		align-items: center;
		gap: 1rem;
		font-size: 1.4rem;
		cursor: pointer;
	}

	.row-label {
		color: var(--color-text);
	}

	select {
		font-size: 1.3rem;
		color: var(--color-text);
		padding: 0.4rem 0.6rem;
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 3px;
		cursor: pointer;

		&:hover {
			background: var(--color-hover-medium);
		}
	}

	.hints-bar {
		padding: 0.8rem 1.6rem;
		background: var(--color-hints-bar);
		color: var(--color-hints-bar-text);
		font-size: 1.4rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		@include card-shine;
	}

	.stats {
		padding: 1.4rem 1.6rem;
		font-size: 1.35rem;
		line-height: 1.65;

		.prog-name {
			font-weight: 700;
			margin-top: 0.6rem;
		}

		.muted {
			color: var(--color-text-muted);
			font-size: 1.2rem;
		}
	}

	.chips {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		padding: 1.2rem;
	}

	.hint {
		padding: 0.8rem 1rem;
		font-size: 1.2rem;
		line-height: 1.4;
		border-radius: 3px;
		@include card-shine;

		&.warn {
			background: var(--color-hint-warn);
		}

		&.info {
			background: var(--color-hint-info);
		}

		&.good {
			background: var(--color-hint-good);
		}
	}

	.details {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		padding: 1.4rem;

		.label {
			@include section-label;
			margin-top: 0.6rem;
		}
	}

	.d-head {
		display: flex;
		flex-direction: column;
		@include card;

		.d-code {
			font-size: 1.8rem;
			font-weight: 700;
		}

		.d-title {
			font-size: 1.4rem;
			line-height: 1.35;
		}
	}

	.d-meta {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.8rem;
	}

	.d-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.8rem 0.4rem;
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 4px;
		@include card-shine;

		.d-stat-label {
			font-size: 1.1rem;
			color: var(--color-text-muted);
			text-transform: uppercase;
			letter-spacing: 0.05em;
		}

		.d-stat-value {
			font-size: 1.5rem;
			font-weight: 700;
		}
	}

	.d-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.d-chip {
		padding: 0.5rem 1rem;
		font-size: 1.3rem;
		font-weight: 600;
		color: var(--color-text);
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 3px;
		cursor: pointer;
		@include card-shine;

		&:hover {
			background: var(--color-hover-medium);
			@include card-shine-hover;
		}
	}

	.d-desc {
		font-size: 1.3rem;
		line-height: 1.55;
		padding: 1rem 1.2rem;
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-divider);
		border-radius: 4px;
		overflow-y: auto;
	}

	.empty {
		@include empty-text;
	}
</style>
