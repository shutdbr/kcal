<script lang="ts">
	import PixelIcon from '../PixelIcon.svelte';
	import { MAX_YEARS, type Plan } from '$lib/plan.svelte';
	import type { TrimNum } from '$lib/types';
	import { byCode, isCore, subjectById } from '$lib/data';
	import { flip } from 'svelte/animate';
	import { fade, fly, scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import { courseIn, courseOut, courseShift, reducedMotion, roll } from '$lib/transitions';
	import { tick } from 'svelte';
	import { GRAD_MIN_CGPA } from '$lib/grades';
	import CreditRules from './CreditRules.svelte';
	import GradesPanel from '../grades/GradesPanel.svelte';

	let { plan, touchLayout = false }: { plan: Plan; touchLayout?: boolean } = $props();

	let gridEl: HTMLDivElement;
	let dropTarget = $state<string | null>(null);
	let showCredits = $state(false);
	let showGrades = $state(false);
	// a year's GPA capsule opens the grades window on just that year
	let gradesYear = $state<number | undefined>(undefined);

	// grade view changes what the whole board means — credits become TGPA, chips
	// take a mark — so the first time it's switched on, say so. Once dismissed
	// (or once they've read it and turned grade view off) it stays gone.
	const GRADE_HINT_KEY = 'kcal-grade-hint-seen';
	let showGradeHint = $state(false);
	function dismissGradeHint() {
		showGradeHint = false;
		localStorage.setItem(GRADE_HINT_KEY, '1');
	}

	// the colour key's dropdown: shuts on a click anywhere else or Escape,
	// and lets go of any chips it had lit
	const TYPE_KEYS = [
		{ type: 'core', label: 'kccs', note: 'the foundation core every student takes, mostly in year 1' },
		{ type: 'required', label: 'required', note: 'required by your major, minor or concentration' },
		{ type: 'elective', label: 'elective', note: 'an elective that counts toward your programme' },
		{ type: 'other', label: 'other dept.', note: 'counts toward none of your programmes' }
	] as const;
	let keyEl: HTMLDivElement;
	let keyOpen = $state(false);
	function setKeyOpen(open: boolean) {
		keyOpen = open;
		if (!open) plan.highlight = [];
	}

	// The eligible cell nearest the cursor. Drops are resolved against the whole
	// grid, so releasing anywhere over it — even in the gap between cells — lands
	// the course in the closest slot instead of snapping back to the catalogue.
	// The year-1 core-only cells only attract a foundation course. The dropped
	// code is passed in — plan.dragging is already cleared by drop time.
	function nearestSlot(x: number, y: number, code: string): { year: number; trim: TrimNum } | null {
		if (!gridEl) return null;
		const draggingCore = isCore(code);
		let best: HTMLElement | null = null;
		let bestDist = Infinity;
		for (const el of gridEl.querySelectorAll<HTMLElement>('.cell')) {
			if (!draggingCore && el.dataset.coreOnly) continue;
			const r = el.getBoundingClientRect();
			const dx = Math.max(r.left - x, 0, x - r.right);
			const dy = Math.max(r.top - y, 0, y - r.bottom);
			const d = dx * dx + dy * dy;
			if (d < bestDist) {
				bestDist = d;
				best = el;
			}
		}
		if (!best) return null;
		return { year: Number(best.dataset.year), trim: Number(best.dataset.trim) as TrimNum };
	}

	// Where in the target cell a course would go: its position among the
	// cell's other courses, read off the chips under the cursor — before a
	// chip if the cursor is above its row, or in its row and short of its
	// middle (its vertical middle when titles stack the chips in rows). The
	// dashed landing slot opens up right there. Dropping a course back where
	// it already sits is a no-op and opens nothing.
	type Aim = { index: number; noop: boolean };
	let aimed = $state<Aim | null>(null);

	const cellAt = (key: string) => {
		const [year, trim] = key.split('-');
		return gridEl?.querySelector<HTMLElement>(`.cell[data-year="${year}"][data-trim="${trim}"]`) ?? null;
	};

	function aimAt(slot: { year: number; trim: TrimNum }, x: number, y: number, code: string): Aim | null {
		const cell = cellAt(`${slot.year}-${slot.trim}`);
		if (!cell) return null;
		// offsetTop/Left are the chips' resting layout, so a chip mid-glide
		// (stepping aside for the slot) can't make the aim flicker
		const c = cell.getBoundingClientRect();
		const cx = x - c.left;
		const cy = y - c.top;
		const chips = [...cell.querySelectorAll<HTMLElement>(':scope > .chip')].filter((el) => el.dataset.code !== code);
		let index = 0;
		for (; index < chips.length; index++) {
			const { offsetLeft: left, offsetTop: top, offsetWidth: w, offsetHeight: h } = chips[index];
			if (cy < top) break;
			if (cy <= top + h && (plan.showTitles ? cy < top + h / 2 : cx < left + w / 2)) break;
		}
		return { index, noop: plan.slotCourses(slot.year, slot.trim).indexOf(code) === index };
	}

	// aim at a cell; when the slot opens, moves or closes, every chip and
	// suggestion in the cells involved glides from where it was to where it
	// is now (FLIP, on `translate` so a chip's own hover transform is left be)
	async function aimTo(key: string | null, next: Aim | null) {
		if (key === dropTarget && next?.index === aimed?.index && next?.noop === aimed?.noop) return;
		const keys = [dropTarget, key].filter((k): k is string => k !== null);
		const els = [...new Set(keys)].flatMap((k) => [
			...(cellAt(k)?.querySelectorAll<HTMLElement>(':scope > .chip, :scope > .ghost') ?? [])
		]);
		const before = els.map((el) => [el, el.getBoundingClientRect()] as const);
		dropTarget = key;
		aimed = next;
		await tick();
		if (reducedMotion()) return;
		for (const [el, r] of before) {
			if (!el.isConnected) continue;
			const now = el.getBoundingClientRect();
			const dx = r.left - now.left;
			const dy = r.top - now.top;
			if (dx || dy)
				el.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], {
					duration: 200,
					easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
				});
		}
	}

	// a chip's place in its cell, as a CSS `order` (so the DOM never
	// reshuffles): its index, spaced by four so the landing slot (at index × 4)
	// fits between two chips, and the dragged course's own empty outline
	// keeps its spot just ahead of the chip that followed it
	function chipOrder(key: string, codes: string[], code: string, i: number): number {
		if (!plan.dragging || dropTarget !== key || !aimed || aimed.noop) return i * 4 + 2;
		if (code === plan.dragging) return i * 4 + 1;
		const from = codes.indexOf(plan.dragging);
		return (from !== -1 && from < i ? i - 1 : i) * 4 + 2;
	}

	function drop(e: DragEvent) {
		e.preventDefault();
		// land where the open slot is showing — re-measuring now would read
		// chips that have already stepped aside for it
		const shown = aimed;
		const shownIn = dropTarget;
		dropTarget = null;
		aimed = null;
		plan.dragging = null;
		const code = e.dataTransfer?.getData('text/plain');
		if (!code) return;
		const slot = nearestSlot(e.clientX, e.clientY, code);
		if (!slot) return;
		const at = shown && shownIn === `${slot.year}-${slot.trim}` ? shown.index : aimAt(slot, e.clientX, e.clientY, code)?.index;
		plan.place(code, slot.year, slot.trim, at);
	}

	function chipDragstart(e: DragEvent, code: string) {
		e.dataTransfer?.setData('text/plain', code);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
		plan.dragging = code;
	}

	// clearing the grid discards work, so it asks twice
	let clearing = $state(false);
	let clearTimer: ReturnType<typeof setTimeout>;
	function clearGrid() {
		if (!clearing) {
			clearing = true;
			clearTimer = setTimeout(() => (clearing = false), 3500);
			return;
		}
		clearTimeout(clearTimer);
		clearing = false;
		plan.clearPlan();
	}

	// "1 required course", "3 required courses" — the bulk actions' labels
	const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

	function open(year: number, trim: TrimNum) {
		plan.zoom = { year, trim };
	}

	// a press that starts on a course, a suggestion or a clear button is about
	// that thing: if the pointer slips off it before release (the chip shrinks
	// under the press), the click lands on the cell — it mustn't zoom
	let pressOnItem = false;

	// a cell takes on the colours of the courses in it, weighted by how many
	// of each (4 psychology + 2 environmental studies → ⅔ psych, ⅓ env).
	// KCCS brings its blush; other-department courses the plain cell grey.
	function cellTone(codes: string[]): string | undefined {
		const counts = new Map<string, number>();
		for (const code of codes) {
			const type = plan.courseType(code);
			const hue = type === 'other' ? undefined : plan.hueOf(code);
			const tone =
				type === 'core'
					? 'color-mix(in oklab, var(--color-course-core) 45%, var(--color-grid-cell))'
					: hue !== undefined
						? `oklch(var(--tone-cell-l) var(--tone-cell-c) ${hue})`
						: 'var(--color-grid-cell)';
			counts.set(tone, (counts.get(tone) ?? 0) + 1);
		}
		const entries = [...counts];
		if (!entries.length) return undefined;
		// color-mix takes two colours at a time, so fold from the back: each
		// step mixes one tone in at its share of what's left
		let [mix, rest] = entries[entries.length - 1];
		for (let i = entries.length - 2; i >= 0; i--) {
			const [tone, n] = entries[i];
			rest += n;
			mix = `color-mix(in oklab, ${tone} ${((n / rest) * 100).toFixed(1)}%, ${mix})`;
		}
		return mix;
	}

	// the year controls under the grid. Taking a year off that has courses on
	// it asks twice, like clearing the grid does.
	let lastYear = $derived(plan.years.length);
	let lastYearCourses = $derived(plan.trims.reduce((n, t) => n + plan.slotCourses(lastYear, t).length, 0));
	let droppingYear = $state(false);
	let dropYearTimer: ReturnType<typeof setTimeout>;
	function dropYear() {
		if (lastYearCourses && !droppingYear) {
			droppingYear = true;
			dropYearTimer = setTimeout(() => (droppingYear = false), 3500);
			return;
		}
		clearTimeout(dropYearTimer);
		droppingYear = false;
		plan.removeYear();
	}
	// a year added just now drops into place; the ones already there don't
	let freshYear = $state<number | null>(null);
	function addYear() {
		plan.addYear();
		freshYear = plan.years.length;
	}

</script>

<svelte:window
	onpointerdown={(e) => keyOpen && !keyEl.contains(e.target as Node) && setKeyOpen(false)}
	onkeydown={(e) => keyOpen && e.key === 'Escape' && setKeyOpen(false)}
/>

<div class="board-bar" data-tour="board-toggles">
	<!-- undo / redo a whole planning step (also ⌘Z / ⇧⌘Z) -->
	<div class="keys history" role="group" aria-label="history">
		<button disabled={!plan.canUndo} title="undo (Ctrl+Z)" aria-label="undo" onclick={() => plan.undo()}>↶</button>
		<button disabled={!plan.canRedo} title="redo (Ctrl+Shift+Z)" aria-label="redo" onclick={() => plan.redo()}>↷</button>
	</div>

	<span class="bar-rule" aria-hidden="true"></span>

	<!-- grade view: unlocks grade entry on chips, in the details panel, and the
	     CGPA / recovery panel -->
	<div class="keys">
	<button
		class:active={plan.gradeMode}
		aria-pressed={plan.gradeMode}
		title="grade view — enter grades and track your CGPA"
		onclick={() => {
			plan.gradeMode = !plan.gradeMode;
			if (plan.gradeMode && !localStorage.getItem(GRADE_HINT_KEY)) showGradeHint = true;
			else showGradeHint = false;
		}}
	>
		<PixelIcon name="grade" /> grade view
	</button>
	</div>

	<span class="bar-rule" aria-hidden="true"></span>

	<!-- how the chips are drawn: what they're labelled with, and what their
	     colours mean -->
	<div class="keys" role="group" aria-label="course labels">
		<button class:active={plan.showCodes} aria-pressed={plan.showCodes} onclick={() => plan.toggleLabel('code')}><PixelIcon name="code" />codes</button>
		<button class:active={plan.showTitles} aria-pressed={plan.showTitles} onclick={() => plan.toggleLabel('title')}><PixelIcon name="title" />titles</button>
		{#if plan.gradeMode}<button class:active={plan.showGradeLabels} aria-pressed={plan.showGradeLabels} onclick={() => (plan.showGradeLabels = !plan.showGradeLabels)}><PixelIcon name="grade" />grades</button>{/if}
	</div>

	<span class="bar-rule" aria-hidden="true"></span>

	<!-- what the chip colours mean, folded into one key: laid out along the
	     bar it read as a row of checkboxes and pushed the credit count onto
	     a line of its own. Hovering a row lights its chips on the board, the
	     way hovering a hint does. -->
	<div class="colour-key" bind:this={keyEl} style:--hue={plan.programmes[0] && subjectById(plan.programmes[0].subject).hue}>
		<div class="keys">
			<button class:active={keyOpen} aria-expanded={keyOpen} aria-controls="colour-key" onclick={() => setKeyOpen(!keyOpen)}>
				<!-- just the essentials: a square per subject in the hue its courses
				     wear, then required and elective — kccs and other dept. wait
				     in the dropdown -->
				{#if plan.programmes.some((p) => p.subject !== 'open')}
					<span class="key-swatches" aria-hidden="true">
						{#each plan.programmes as prog (prog.role + prog.subject)}
							{#if prog.subject !== 'open'}<i data-type="required" style:--hue={subjectById(prog.subject).hue}></i>{/if}
						{/each}
					</span>
				{/if}
				<span class="key-swatches" aria-hidden="true"><i data-type="required"></i><i data-type="elective"></i></span>
				colours <span class="caret" aria-hidden="true">▾</span>
			</button>
		</div>
		{#if keyOpen}
			<div id="colour-key" class="key-pop" in:scale={{ start: 0.94, duration: reducedMotion() ? 0 : 260, easing: backOut }} out:fade={{ duration: reducedMotion() ? 0 : 100 }}>
				<!-- the type rows wear the major's hue, the colour you'll see most -->
				<ul class="legend" aria-label="course colour legend">
					{#each TYPE_KEYS as k (k.type)}
						<li class="key" title={k.note} onmouseenter={() => (plan.highlight = [...plan.placedCodes].filter((c) => plan.courseType(c) === k.type))} onmouseleave={() => (plan.highlight = [])}>
							<i data-type={k.type}>{#if k.type === 'required'}<b class="req-dot"></b>{/if}</i>{k.label}
						</li>
					{/each}
				</ul>
				<!-- which hue is which subject — each keeps its colour on every plan -->
				{#if plan.programmes.some((p) => p.subject !== 'open')}
					<ul class="legend" aria-label="subject colour legend">
						{#each plan.programmes as prog, i (prog.role + prog.subject)}
							{#if prog.subject !== 'open'}
								<li class="key" onmouseenter={() => (plan.highlight = [...plan.placedCodes].filter((c) => plan.programmeOf(c) === i))} onmouseleave={() => (plan.highlight = [])}>
									<i data-type="required" style:--hue={subjectById(prog.subject).hue}></i>{subjectById(prog.subject).label}<em>{prog.role === 'concentration' ? 'concentration' : prog.role}</em>
								</li>
							{/if}
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	</div>

	<!-- where the plan stands, at the far end: the CGPA in grade view,
	     otherwise the credit count -->
	{#if plan.gradeMode}
		<button
			class="cgpa-btn bar-end"
			title="enter grades, see your CGPA and what you need to recover"
			onclick={() => {
				gradesYear = undefined;
				showGrades = true;
			}}
		>
			{#if plan.cgpa === null}enter grades{:else}<span class="cgpa-lbl">CGPA</span> {plan.cgpa.toFixed(2)}{/if}
		</button>
	{:else}
		<!-- the count and what it counts against, as one capsule: the number
		     first, then the switch for its denominator — the minimum the degree
		     needs, or the most you may register across your tenure -->
		<div class="credit-goal bar-end">
			<button
				class="placed-total"
				class:over={plan.totalPlacedCredits > plan.creditTarget}
				class:conflict={plan.creditsConflict}
				title={plan.creditsConflict
					? `your programmes need ${plan.creditMinimum} credits, more than the ${plan.creditCeiling} a ${plan.fourYear ? 'four' : 'three'}-year degree allows — only courses counting for two programmes can make it fit. Click for the credit rules`
					: `${plan.totalPlacedCredits} placed of the ${plan.creditTarget} ${plan.creditTargetMode === 'minimum' ? 'you need to graduate' : 'you may register at most'} — click for the credit rules`}
				onclick={() => (showCredits = true)}
			>
				{plan.totalPlacedCredits}<em>/</em>{plan.creditTarget} cr
			</button>
			<!-- one switch, not two buttons: a click anywhere on it flips sides -->
			<button
				class="goal-seg"
				class:maximum={plan.creditTargetMode === 'maximum'}
				title={plan.creditTargetMode === 'minimum'
					? `counting against the credits you need to graduate (${plan.creditMinimum}) — click for the maximum`
					: `counting against the most you may register over your tenure (${plan.creditCeiling}) — click for the minimum`}
				aria-label="count credits against the {plan.creditTargetMode} — click to switch"
				onclick={() =>
					(plan.creditTargetMode = plan.creditTargetMode === 'minimum' ? 'maximum' : 'minimum')}
			>
				<span class:active={plan.creditTargetMode === 'minimum'}>min</span>
				<span class:active={plan.creditTargetMode === 'maximum'}>max</span>
			</button>
		</div>
	{/if}
</div>

{#if showGradeHint}
	<div class="grade-hint" transition:fly={{ y: -8, duration: 180 }}>
		<button class="hint-close" onclick={dismissGradeHint} aria-label="dismiss">×</button>
		<strong>grade view</strong>
		<ul>
			<li>click a course on the grid, then set its <b>grade</b> in the course panel on the right</li>
			<li>each trimester shows its <b>TGPA</b> instead of credits; the button above shows your <b>CGPA</b></li>
			<li>open <b>CGPA</b> for the full breakdown and what you'd need to pull an average back up</li>
			<li><b>audits</b> carry no grade and stay out of the maths</li>
		</ul>
		<button class="hint-go" onclick={dismissGradeHint}>got it</button>
	</div>
{/if}

{#if showCredits}
	<CreditRules {plan} onclose={() => (showCredits = false)} />
{/if}


{#if showGrades && plan.gradeMode}
	<GradesPanel {plan} year={gradesYear} onclose={() => (showGrades = false)} />
{/if}

{#if !plan.touched && !plan.gradeMode}
	<p class="example-note">
		<b>this is the suggested path for your degree, filled in to start you off.</b> change anything and it's
		yours — until then, picking a different degree on the left lays it out again.
	</p>
{/if}

<div
	class="overview"
	class:dragging={plan.dragging !== null}
	class:graded={plan.gradeMode}
	style="--cols: {plan.trims.length}"
	role="list"
	aria-label="course plan grid"
	bind:this={gridEl}
	ondragover={(e) => {
		e.preventDefault();
		const slot = plan.dragging ? nearestSlot(e.clientX, e.clientY, plan.dragging) : null;
		void aimTo(
			slot ? `${slot.year}-${slot.trim}` : null,
			slot && plan.dragging ? aimAt(slot, e.clientX, e.clientY, plan.dragging) : null
		);
	}}
	ondragleave={(e) => {
		if (!gridEl.contains(e.relatedTarget as Node)) void aimTo(null, null);
	}}
	ondrop={drop}
>
	<div class="corner"></div>
	{#each plan.trims as t (t)}
		<div class="trim-head">t{t}</div>
	{/each}

	{#each plan.years as y (y)}
		<div class="year-head" class:fresh={y === freshYear}>
			{#if plan.gradeMode}
				<!-- the year's GPA on a little glossy readout; the digits roll
				     over when a grade changes, and it opens the full breakdown -->
				{@const yg = plan.yearGpa(y)}
				{@const shown = yg === null ? '—' : yg.toFixed(2)}
				<button
					class="yh-gpa"
					class:empty={yg === null}
					class:low={yg !== null && yg < GRAD_MIN_CGPA}
					title={yg === null ? `no grades in year ${y} yet — grade its courses` : `year ${y} GPA ${shown} — grade its courses`}
					onclick={() => {
						gradesYear = y;
						showGrades = true;
					}}
				>
					{#key shown}
						<span in:roll={{ dir: 1 }} out:roll={{ dir: -1 }}>{shown}</span>
					{/key}
				</button>
				<span class="yh-year">y{y}</span>
			{:else}
				<span class="year-short">y{y}</span><span class="year-long">year {y}</span>
			{/if}
		</div>
		{#each plan.trims as t (t)}
			{@const coreSlot = plan.coreOnly(y, t)}
			{@const slotCredits = plan.slotCredits(y, t)}
			{@const codes = plan.slotCourses(y, t)}
			<div
				class="cell"
				class:fresh={y === freshYear}
				class:lit={plan.highlight.length > 0 && codes.some((c) => plan.highlight.includes(c))}
				style="--t: {t}"
				style:--mix={cellTone(codes)}
				class:core-slot={coreSlot}
				class:drop-target={plan.dragging !== null && dropTarget === `${y}-${t}`}
				class:problem={plan.slotHasProblem(y, t)}
				class:can-drop={plan.dragging !== null && plan.canDrop(plan.dragging, y, t)}
				class:no-fit={plan.dragging !== null && !plan.canDrop(plan.dragging, y, t)}
				data-year={y}
				data-trim={t}
				data-core-only={coreSlot || undefined}
				role="button"
				tabindex="0"
				aria-label="open year {y} trimester {t}"
				onpointerdown={(e) => (pressOnItem = !!(e.target as Element).closest('.chip, .ghost, .cell-credits'))}
				onclick={() => !pressOnItem && open(y, t)}
				onkeydown={(e) => {
					if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
						e.preventDefault(); open(y, t);
					}
				}}
			>
				<button class="mobile-term" aria-label="view year {y} trimester {t}" onclick={(e) => { e.stopPropagation(); open(y, t); }}>trimester {t}<span>view trimester →</span></button>
				<!-- the core-only rule, named only while there's nothing in the
				     cell at all — not over the suggestions waiting in it -->
				{#if coreSlot && plan.slotCourses(y, t).length === 0 && (plan.gradeMode || plan.suggestionsFor(y, t).length === 0)}
					<span class="core-note">kccs courses</span>
				{/if}
				{#each codes as code, i (code)}
					{@const type = plan.courseType(code)}
					<div
						class="chip"
						class:flagged={plan.flaggedCodes.has(code)}
						class:is-audit={plan.isAudit(code)}
						class:showing-title={plan.showTitles}
						class:dragging={plan.dragging === code}
						class:lit={plan.highlight.includes(code)}
						data-code={code}
						style="order: {chipOrder(`${y}-${t}`, codes, code, i)}"
						data-type={type}
						style:--hue={plan.hueOf(code)}
						draggable={!touchLayout}
						role="listitem"
						animate:flip={courseShift}
						in:courseIn={{ key: code }}
						out:courseOut={{ key: code }}
						ondragstart={(e) => chipDragstart(e, code)}
						ondragend={() => (plan.dragging = null)}

					>
						<button class="chip-open" onclick={(e) => { e.stopPropagation(); plan.selected = byCode(code); }} aria-label="view {plan.courseLabel(code)}">
						{#if plan.gradeMode && plan.showGradeLabels && plan.gradeOf(code)}
							<span class="chip-grade" class:fail={plan.gradeOf(code) === 'U'}>{plan.gradeOf(code)}</span>
						{/if}
						<!-- a course named in a hint leads with that hint's severity
						     mark, the way a required one leads with its dot -->
						{#if plan.flagKinds.has(code)}<span class="flag" data-kind={plan.flagKinds.get(code)} role="img" aria-label="named in a hint" title="named in a hint — see hints"></span>{/if}
						{#if type === 'required'}<span class="req-dot" role="img" aria-label="required"></span>{/if}
						<span class="label"
							>{#if plan.showCodes}<b class="chip-code">{plan.shownCode(code)}</b>{/if}{#if plan.showCodes && plan.showTitles}{' · '}{/if}{#if plan.showTitles}{byCode(code).title}{/if}{#if !plan.showTitles}<span class="mobile-title">{byCode(code).title}</span>{/if}</span
						>
						</button>
						<button
							class="x"
							aria-label="remove {plan.courseLabel(code)}"
							onclick={(e) => {
								e.stopPropagation();
								plan.remove(code);
							}}>×</button
						>
					</div>
				{/each}

				<!-- where the course in hand would land: an empty dashed slot the
				     size of its chip, opening up right where it would drop — between
				     two courses or after the last (placed by CSS order, see chipOrder) -->
				{#if plan.dragging && dropTarget === `${y}-${t}` && aimed && !aimed.noop}
					<span
						class="landing"
						class:showing-title={plan.showTitles}
						style="order: {aimed.index * 4}"
						aria-hidden="true"
					>
						<span class="label">{plan.courseLabel(plan.dragging)}</span>
						<span class="plus">+</span>
					</span>
				{/if}

				<!-- The recommended path, shown where it would go. Not a second plan
				     and not a mode: a course the department would put in this
				     trimester that isn't anywhere on your grid yet. Click it to take
				     it; ignore it and it just sits there. Hidden in grade view, which
				     is about what you HAVE taken. -->
				{#if !plan.gradeMode}
					{#each plan.suggestionsFor(y, t) as code (code)}
						<button
							class="ghost"
							class:showing-title={plan.showTitles}
							data-type={plan.courseType(code)}
							title="suggested here — click to add {plan.courseLabel(code)}"
							animate:flip={courseShift}
							onclick={(e) => {
								e.stopPropagation();
								plan.acceptSuggestion(code);
							}}
						>
							<span class="label">{plan.courseLabel(code)}</span>
							<span class="plus" aria-hidden="true">+</span>
						</button>
					{/each}
				{/if}

				{#if slotCredits > 0}
					{@const load = plan.slotLoad(y, t)}
					<span class="cell-credits" data-status={plan.gradeMode ? undefined : load.status}>
						{#if plan.gradeMode}
							{@const tg = plan.slotTgpa(y, t)}
							<span class="cell-tgpa" title="term GPA — this trimester's grade average">TGPA {tg === null ? '—' : tg.toFixed(2)}</span>
						{:else}
							<!-- the load as a fraction of the bound that matters: 4/12 under the
							     minimum, 14/16 within the normal load, 20/16 heavy, 24/20 over
							     the cap — in words on hover, colour only a second cue -->
							<span class="credits-text" title={load.note || undefined}
								>{slotCredits}{#if load.limit !== null}<span class="load-limit">/{load.limit}</span>{/if} cr</span
							>
						{/if}
						<button
							class="clear"
							title="clear this trimester"
							aria-label="clear year {y} trimester {t}"
							onclick={(e) => {
								e.stopPropagation();
								plan.clearSlot(y, t);
							}}>×</button
						>
					</span>
				{/if}
			</div>
		{/each}
	{/each}

	<!-- grow or shrink the grid by a year: a dashed row waiting to exist, and
	     the way back off the last one (never below the degree's own length) -->
	{#if !plan.gradeMode && (plan.years.length < MAX_YEARS || plan.canRemoveYear)}
		<div class="year-acts">
			{#if plan.years.length < MAX_YEARS}
				<button class="add-year" onclick={addYear}>+ add year {plan.years.length + 1}</button>
			{/if}
			{#if plan.canRemoveYear}
				<button
					class="drop-year"
					class:confirming={droppingYear}
					title={lastYearCourses
						? `take year ${lastYear} off the grid, with its ${lastYearCourses} course${lastYearCourses === 1 ? '' : 's'}`
						: `take year ${lastYear} off the grid`}
					onclick={dropYear}
				>
					{droppingYear
						? `click again — ${lastYearCourses} course${lastYearCourses === 1 ? ' comes' : 's come'} off`
						: `− remove year ${lastYear}`}
				</button>
			{/if}
		</div>
	{/if}
</div>

<!-- Bulk grid actions. Changing the degree never moves a course on its own —
     the new recommendation shows as dotted ghosts, and these are how the
     student brings the grid in line with it, all at once or not at all.
     Each shows only while it has something to do and says what it will move
     in plain words — greyed-out buttons reading "0" confused people. Adding
     first, taking away after; clearing sits apart at the far end. -->
{#if !plan.gradeMode}
	<div class="acts-row" data-tour="board-actions">
		{#if plan.missingRequiredCodes.length}
			<button
				class="fill"
				title="place each required course of your programmes in its usual trimester"
				onclick={() => plan.addRequiredCourses()}
				transition:fade={{ duration: reducedMotion() ? 0 : 150 }}
			>+ add {count(plan.missingRequiredCodes.length, 'required course')}</button>
		{/if}

		{#if plan.suggestionCount}
			<button
				class="strip"
				title="take every dotted suggestion on the grid"
				onclick={() => plan.acceptAllSuggestions()}
				transition:fade={{ duration: reducedMotion() ? 0 : 150 }}
			>+ accept {count(plan.suggestionCount, 'suggestion')}</button>
		{/if}

		{#if plan.otherPlacedCodes.length}
			<button
				class="strip"
				title="take off every course that counts toward none of your major, minor or concentration"
				onclick={() => plan.removeOtherCourses()}
				transition:fade={{ duration: reducedMotion() ? 0 : 150 }}
			>− drop {plan.otherPlacedCodes.length} that {plan.otherPlacedCodes.length === 1 ? 'doesn’t' : 'don’t'} count</button>
		{/if}

		{#if plan.placed.length}
			<button
				class="strip clear"
				class:confirming={clearing}
				title="take every course off the grid"
				onclick={clearGrid}
				transition:fade={{ duration: reducedMotion() ? 0 : 150 }}
			>{clearing ? 'sure? click again' : 'empty the grid'}</button>
		{/if}
	</div>
{/if}

<style lang="scss">
	@use '$lib/styles/mixins' as *;
	.cell.drop-target {
		outline: 2px solid var(--color-accent);
		outline-offset: -3px;
		box-shadow: inset 0 0 0 5px color-mix(in srgb, var(--color-accent) 10%, transparent);
	}

	.overview {
		position: relative;
		display: grid;
		grid-template-columns: var(--head, 4rem) repeat(var(--cols), 1fr);
		gap: 1rem;
		padding: 2.4rem 3.2rem;
		transition: grid-template-columns 0.4s var(--ease-out);

		// grade view: the year column widens to seat its GPA readout
		&.graded {
			--head: 6rem;
		}
	}


	.trim-head {
		font-size: 2.2rem;
		text-align: center;
		padding-bottom: 0.4rem;
	}

	.year-head {
		font-size: 2.2rem;
		align-self: center;
		text-align: center;
	}

	// grade view: the year's GPA on a small glossy capsule — a readout from an
	// old desktop app — with the y-tag underneath. It springs up under the
	// cursor and squeezes when pressed, and its digits roll on change.
	.yh-gpa {
		display: inline-grid;
		place-items: center;
		min-width: 5.2rem;
		padding: 0.35rem 0.6rem 0.3rem;
		overflow: hidden; // clips the rolling digits to the capsule
		font: inherit;
		font-size: 1.5rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.01em;
		color: var(--color-text);
		background-color: var(--color-bg-light);
		background-image: var(--gloss-face);
		border: 1px solid var(--color-border-card);
		border-radius: 8px;
		box-shadow: var(--shadow-inset), var(--shadow-card);
		cursor: pointer;
		transition:
			transform 0.4s var(--spring),
			box-shadow 0.2s ease,
			background-color 0.25s ease;

		// old and new digits share the one cell, so they cross as they roll
		> span {
			grid-area: 1 / 1;
		}

		&:hover {
			transform: translateY(-1px) scale(1.05);
			box-shadow: var(--shadow-inset-hover), var(--shadow-card-hover);
		}

		&:active {
			transform: scale(0.95);
			transition-duration: 0.08s;
		}

		// nothing graded yet: an empty slot set into the board, not a raised key
		&.empty {
			color: var(--color-text-muted);
			background-color: transparent;
			background-image: none;
			border-style: dashed;
			box-shadow: none;
		}

		// under the standing line — tinted the warning red, still legible
		&.low {
			color: var(--color-danger-deep);
			background-color: var(--color-hint-warn);
			border-color: var(--color-hint-warn-deep);
		}
	}

	.yh-year {
		display: block;
		margin-top: 0.4rem;
		font-size: 1.1rem;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
	}

	.cell {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		align-content: flex-start;
		gap: 0.8rem;
		min-height: 13rem;
		padding: 1rem 1rem 2.6rem;
		background: var(--mix, var(--color-grid-cell));
		border-radius: 8px;
		cursor: zoom-in;
		// every cell carries the same inset dashed rule; the states below only
		// recolour it
		outline: 1px dashed color-mix(in srgb, var(--color-board-text) 35%, transparent);
		outline-offset: -4px;
		transition:
			background 0.25s ease,
			box-shadow 0.25s ease,
			opacity 0.25s ease,
			outline-color 0.25s ease;
		@include card-shine;
		// drop only the outer shadow, keep the inset shine
		box-shadow: var(--shadow-inset);

		// hovering darkens whatever the cell already is — its course colours,
		// the KCCS blush — by laying 10% black over it
		&:hover {
			box-shadow: var(--shadow-inset), inset 0 0 0 100vmax rgba(0, 0, 0, 0.1);
		}

		// year-1 t1/t2: reserved for the foundation core — tinted like the
		// core chips so the pairing is obvious at a glance
		&.core-slot {
			background: var(--mix, color-mix(in srgb, var(--color-course-core) 45%, var(--color-grid-cell)));
			outline-color: var(--color-course-core-deep);
		}

		// a cell holding a course involved in a warning keeps its course
		// colours — the warning rides on the red dashed rule instead
		&.problem {
			outline-color: var(--color-hint-warn-deep);
		}

		// while dragging: mint, ringed solid, where the course fits cleanly,
		// and every trimester it doesn't fit (not offered then, wrong year,
		// prerequisite after it) fades back. Still, not pulsing — the whole
		// grid breathing at once was noise. A faded slot still takes the drop;
		// the hints flag it.
		&.can-drop {
			background: var(--color-drop-ok);
			outline: 2px solid var(--color-drop-ok-edge);
		}

		&.no-fit {
			opacity: 0.4;
			filter: saturate(0.4);
		}
	}

	// the trimester's credits, in its bottom-right corner
	.cell-credits {
		position: absolute;
		bottom: 0.7rem;
		right: 0.9rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--color-text-muted);

		&[data-status='under'],
		&[data-status='heavy'] {
			color: color-mix(in srgb, var(--color-hint-caution-deep) 60%, var(--color-text));
		}

		&[data-status='over'] {
			color: var(--color-danger);
		}

		.credits-text {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.load-limit {
			font-weight: 500;
		}

		.clear {
			background: none;
			border: none;
			padding: 0 0.2rem;
			font-size: 1.3rem;
			line-height: 1;
			color: var(--color-text-muted);
			opacity: 0;
			cursor: pointer;
			-webkit-tap-highlight-color: transparent;
			transition:
				opacity 0.2s ease,
				color 0.2s ease;

			&:hover {
				color: var(--color-text);
			}
		}
	}

	.cell:hover .cell-credits .clear {
		opacity: 1;
	}

	// the core-only rule, named only while the cell is EMPTY — once courses
	// are in, the pink core tint alone marks the slot and the text goes
	.core-note {
		@include section-label;
		position: absolute;
		top: 50%;
		left: 0;
		right: 0;
		transform: translateY(-50%);
		text-align: center;
		font-size: 1rem;
		pointer-events: none;
	}

	// grade badge on a chip (grade view only) — a small fixed-size capsule so
	// every grade (A+, B, U) is the same width and the chip never bulks up when
	// a grade is entered. Faded and lowkey; red for a U.
	.chip-grade {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.9rem;
		padding: 0 0.4rem;
		font-size: 1.05rem;
		font-weight: 700;
		line-height: 1.4;
		border-radius: 999px;
		color: var(--color-text);
		background: var(--color-bg-light);
		border: 1px solid color-mix(in srgb, var(--color-text) 14%, transparent);
		font-variant-numeric: tabular-nums;

		&.fail {
			color: var(--color-danger);
			border-color: color-mix(in srgb, var(--color-danger) 40%, transparent);
		}
	}

	.chip {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		height: fit-content;
		overflow: hidden; // nothing spills past the rounded corners
		// extra right padding reserves the top-right corner for the × button,
		// which sits in the corner for every chip rather than beside the label
		padding: 0.7rem 2.2rem 0.7rem 1rem;
		font-size: 1.3rem;
		border-radius: 5px; // a touch rounder, so the shine reads as a curved face
		cursor: grab;
		transition:
			transform 0.15s ease,
			opacity 0.15s ease,
			box-shadow 0.15s ease;
		@include course-type-fill;
		@include card-shine;

		&:hover {
			transform: translateY(-1px);
			@include card-shine-hover;
		}

		&:active {
			cursor: grabbing;
			transform: scale(0.97);
		}

		// the source of an in-flight drag leaves its outline behind — an empty
		// dashed slot the size of the course, so you can see where it came from
		// (and where it snaps back to if the drop is cancelled)
		&.dragging {
			transform: none;
			background: color-mix(in srgb, var(--color-board-text) 6%, transparent);
			border: 1px dashed color-mix(in srgb, var(--color-board-text) 60%, transparent);
			box-shadow: none;

			> * {
				visibility: hidden;
			}
		}

		// involved in a hint → bold, like the mockups
		.flag {
			@include severity-mark;
		}

		.req-dot {
			@include required-dot;
		}

		.label {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		// the code reads first: a touch bolder than the title beside it
		.chip-code {
			font-weight: 650;
		}

		// the show-titles switch is on → take the row and wrap
		&.showing-title {
			flex-basis: 100%;

			.label {
				white-space: normal;
			}
		}

		// remove button, anchored to the chip's top-right corner (not inline
		// after the label) so it sits in the same place for every chip — code
		// chips and full-width title chips alike
		.x {
			position: absolute;
			top: 50%;
			right: 0.3rem;
			transform: translateY(-50%);
			display: flex;
			align-items: center;
			justify-content: center;
			width: 1.6rem;
			height: 1.6rem;
			padding: 0;
			background: none;
			border: none;
			font-size: 1.4rem;
			line-height: 1;
			color: var(--color-text-muted);
			opacity: 0.35; // always there, so removing a course isn't a secret
			cursor: pointer;
			-webkit-tap-highlight-color: transparent;
			transition:
				opacity 0.15s ease,
				color 0.15s ease,
				transform 0.2s var(--spring);

			&:hover {
				color: var(--color-text);
				transform: translateY(-50%) scale(1.1);
			}
		}

		&:hover .x,
		&:focus-within .x {
			opacity: 1;
		}

		// a course a hint is about, while that hint is pointed at
		&.lit {
			transform: translateY(-1px);
			box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 80%, transparent), var(--shadow-card);
		}
	}

	// the trimester holding a pointed-at hint's courses
	.cell.lit {
		outline: 2px solid color-mix(in srgb, var(--color-accent) 60%, transparent);
		outline-offset: -3px;
	}

	// until the student changes something, the grid is the suggested path
	// filled in for them — say so, so it doesn't read as someone else's plan
	.example-note {
		margin: 1.6rem 3.2rem 0;
		padding: 0.9rem 1.4rem;
		font-size: 1.3rem;
		line-height: 1.5;
		color: var(--color-text-muted);
		border: 1px dashed color-mix(in srgb, var(--color-board-text) 45%, transparent);
		border-radius: 8px;

		b {
			color: var(--color-text);
		}
	}

	// the bar above the grid: the titles switch (one switch for every chip,
	// instead of tapping them one by one), the colour legend, and the
	// placed-credits total — sticky so it stays readable while scrolling
	// the board's header strip — the exact aesthetic of the column headers
	// (same gradient shape, card shadow, border), recoloured grey / greyish-blue
	// so the middle reads as its own grayed zone
	// sits under the board bar the first time grade view is switched on
	.grade-hint {
		position: relative;
		margin: 1.6rem 3.2rem 0;
		padding: 1.2rem 3rem 1.4rem 1.6rem;
		background: color-mix(in srgb, var(--color-accent) 12%, var(--color-bg-light));
		border: 1px solid var(--color-control);
		border-radius: 6px;

		strong {
			display: block;
			font-size: 1.35rem;
			color: var(--color-text);
		}

		ul {
			margin-top: 0.5rem;
			padding-left: 1.6rem;
			font-size: 1.25rem;
			line-height: 1.6;
			color: var(--color-text-muted);

			li {
				list-style: disc;
			}

			b {
				color: var(--color-text);
				font-weight: 600;
			}
		}
	}

	.hint-close {
		position: absolute;
		top: 0.3rem;
		right: 0.5rem;
		padding: 0.2rem 0.5rem;
		font-size: 1.6rem;
		line-height: 1;
		color: var(--color-text-muted);
		background: none;
		border: none;
		cursor: pointer;

		&:hover {
			color: var(--color-text);
		}
	}

	.hint-go {
		margin-top: 1rem;
		padding: 0.5rem 1.6rem;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-on-accent);
		background-color: var(--color-accent);
		border: 1px solid var(--color-control-deep);
		border-radius: 5px;
		cursor: pointer;
		@include glossy-accent;

		&:hover {
			filter: brightness(1.07);
		}
	}

	.board-bar {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 1.6rem;
		flex-wrap: wrap;
		min-height: 5.6rem;
		padding: 0.8rem 3.2rem;
		background: linear-gradient(to bottom, var(--bar-top), var(--bar-bottom));
		box-shadow: inset 0 1px 0 var(--bar-hi);
		border-bottom: 1px solid var(--bar-edge);

		// everything inside takes the bar's own palette (see --bar-* in
		// _variables) — the legend swatches keep theirs, since they're a key
		--color-text: var(--bar-text);
		--color-text-muted: var(--bar-text-muted);
		--color-accent: var(--bar-key-on);
		--color-on-accent: var(--bar-key-on-text);
		--color-bg-light: var(--bar-top);
		--color-border-card: var(--bar-edge); // steel hairlines; only the toggles go pink
		--gloss-face: linear-gradient(
			to bottom,
			var(--bar-hi) 0%,
			transparent 50%,
			rgba(40, 56, 84, 0.05) 51%,
			rgba(40, 56, 84, 0.12) 100%
		);
		--shadow-inset: inset 0 1px 0 var(--bar-hi);
		--shadow-card: 0 0 0 transparent;
		--key-pressed: inset 0 2px 3px rgba(20, 30, 50, 0.32), inset 0 1px 1px rgba(20, 30, 50, 0.2);
	}

	// the bar's toggles: an old-iPhone segmented control — joined glossy
	// segments with a hard crease across the middle, light pink when off,
	// dark pink and sunk in when on, embossed labels. A single key (grade
	// view) is just a one-segment control.
	.keys {
		display: flex;
		overflow: hidden; // clips the end segments to the rounded corners
		border: 1px solid var(--bar-key-edge);
		border-radius: 6px;
		box-shadow: 0 1px 0 var(--bar-hi);

		button {
			display: flex;
			align-items: center;
			gap: 0.6rem;
			min-height: 2.8rem;
			padding: 0.3rem 1.2rem;
			font: inherit;
			font-size: 1.2rem;
			font-weight: 700;
			color: var(--bar-key-text);
			text-shadow: 0 1px 0 var(--bar-hi); // embossed — faint on the dark theme
			background-color: var(--bar-key);
			// lit top half, hard crease, deeper bottom half that lifts again
			background-image: linear-gradient(
				rgba(255, 255, 255, 0.6),
				rgba(255, 255, 255, 0.22) 50%,
				rgba(120, 40, 80, 0.06) 50%,
				rgba(255, 255, 255, 0.08)
			);
			border: 0;
			border-radius: 0;
			box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
			cursor: pointer;
			transition:
				background-color 160ms ease,
				color 160ms ease,
				box-shadow 120ms ease;

			// a hairline groove between segments, lit on its right side
			& + button {
				border-left: 1px solid var(--bar-key-edge);
				box-shadow:
					inset 0 1px 0 rgba(255, 255, 255, 0.7),
					inset 1px 0 0 rgba(255, 255, 255, 0.45);
			}

			&:hover {
				background-color: color-mix(in srgb, var(--bar-key) 88%, var(--bar-key-on));
			}

			&.active {
				color: var(--bar-key-on-text);
				text-shadow: 0 -1px 0 rgba(60, 10, 35, 0.45);
				background-color: var(--bar-key-on);
				background-image: linear-gradient(
					rgba(255, 255, 255, 0.24),
					rgba(255, 255, 255, 0.07) 50%,
					rgba(60, 10, 35, 0.1) 50%,
					rgba(60, 10, 35, 0)
				);
				box-shadow:
					inset 0 1px 3px rgba(60, 10, 35, 0.5),
					inset 0 0 0 1px rgba(60, 10, 35, 0.12);
			}

			& + button.active,
			&.active + button {
				border-left-color: var(--bar-key-on-edge);
			}
		}
	}

	// the colour key: shaped like the bar's keys, but plain white with a steel
	// edge — it opens a menu rather than switching anything, so it doesn't
	// wear the toggles' pink. Its face previews the colours it explains.
	.colour-key {
		position: relative;

		.keys {
			border-color: var(--bar-edge);
		}

		.keys button,
		.keys button.active {
			color: var(--bar-text);
			text-shadow: none;
			background: var(--color-bg-card-start);
			box-shadow: none;
		}

		.keys button:hover {
			background: color-mix(in srgb, var(--color-bg-card-start) 90%, var(--bar-edge));
		}

		// open, it stays white and just sits pressed in
		.keys button.active {
			box-shadow: inset 0 1px 3px rgba(20, 30, 50, 0.22);
		}

		.caret {
			font-size: 1rem;
			transition: transform 260ms var(--spring);
		}

		.active .caret {
			transform: rotate(180deg);
		}
	}

	.key-swatches {
		display: flex;
		gap: 2px;

		// the subjects' squares and the roles' sit a little apart
		& + & {
			margin-left: -0.2rem;
		}

		// only required and elective appear here, so only their fills
		i {
			width: 0.9rem;
			height: 0.9rem;
			border-radius: 2px;

			&[data-type='required'] {
				background: subject-tone(required);
				border: 1px solid subject-tone(required-deep);
			}

			&[data-type='elective'] {
				background: subject-tone(elective);
				border: 1px solid subject-tone(elective-deep);
			}
		}
	}

	.key-pop {
		position: absolute;
		top: calc(100% + 0.6rem);
		left: 0;
		z-index: 3;
		width: max-content;
		padding: 0.5rem;
		background: var(--color-bg-card-start);
		border: 1px solid var(--bar-edge);
		border-radius: 6px;
		box-shadow: 0 6px 18px rgba(20, 30, 50, 0.18);
		transform-origin: top left;
	}

	// A suggestion wears the same shape as the real chip it would become, at a
	// fraction of the weight — so the grid reads as "your plan, plus what's
	// missing" rather than as two different kinds of thing.
	.ghost {
		order: 9999; // after every placed chip (and the landing slot), whatever their order
		// the dashed edge takes the colour of the course type it suggests
		--ghost-edge: color-mix(in srgb, var(--color-text-muted) 45%, transparent);
		position: relative;
		display: flex;
		align-items: center;
		height: fit-content;
		padding: 0.7rem 2.2rem 0.7rem 1rem; // the chip's own box, so it's the same size
		font: inherit;
		font-size: 1.3rem;
		text-align: left;
		color: var(--color-text-muted);
		background: transparent; // just the dashed outline — it isn't on the plan yet
		border: 1px dashed var(--ghost-edge);
		border-radius: 5px;
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			color 0.15s ease,
			border-color 0.15s ease,
			transform 0.25s var(--spring);

		&[data-type='core'] {
			--ghost-edge: var(--color-course-core-deep);
		}
		&[data-type='required'] {
			--ghost-edge: var(--color-course-required-deep);
		}
		&[data-type='elective'] {
			--ghost-edge: var(--color-course-elective-deep);
		}
		&[data-type='other'] {
			--ghost-edge: var(--color-border-audit);
		}

		.label {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		// where a placed chip keeps its ×
		.plus {
			position: absolute;
			top: 50%;
			right: 0.7rem;
			translate: 0 -50%;
			font-weight: 700;
			opacity: 0.55;
		}

		// titles on → a row of its own, exactly like a placed chip
		&.showing-title {
			flex-basis: 100%;

			.label {
				white-space: normal;
			}
		}

		// on hover only the edge firms up: a solid line, a shade deeper
		&:hover {
			border-style: solid;
			border-color: color-mix(in srgb, var(--ghost-edge) 60%, var(--color-text));
		}

		&:active {
			transform: scale(0.97);
		}
	}

	// the drop preview — the chip's own footprint, dashed, popping in on a
	// spring wherever the course would land
	.landing {
		position: relative;
		display: flex;
		align-items: center;
		height: fit-content;
		padding: 0.7rem 2.2rem 0.7rem 1rem; // the chip's own box, so the sizes match
		font-size: 1.3rem;
		background: color-mix(in srgb, var(--color-accent) 8%, transparent);
		border: 1px dashed var(--color-accent);
		border-radius: 5px;
		pointer-events: none;
		animation: landing-pop 240ms var(--spring) both;

		.label {
			visibility: hidden;
			white-space: nowrap;
		}

		.plus {
			position: absolute;
			inset: 0;
			display: flex;
			align-items: center;
			justify-content: center;
			font-weight: 700;
			color: var(--color-accent);
		}

		&.showing-title {
			flex-basis: 100%;

			.label {
				white-space: normal;
			}
		}
	}

	@keyframes landing-pop {
		from {
			opacity: 0;
			transform: scale(0.6);
		}
	}

	// under the last year, spanning the trimester columns
	.year-acts {
		grid-column: 2 / -1;
		display: flex;
		gap: 1rem;
	}

	.add-year,
	.drop-year {
		padding: 1rem 1.6rem;
		font: inherit;
		font-size: 1.25rem;
		color: var(--color-text-muted);
		background: transparent;
		border: 1px dashed color-mix(in srgb, var(--color-board-text) 45%, transparent);
		border-radius: 8px;
		cursor: pointer;
		transition:
			color 0.15s ease,
			background-color 0.15s ease,
			border-color 0.15s ease,
			transform 0.14s var(--spring);

		&:hover {
			color: var(--color-text);
			background-color: var(--color-drop-hint);
			border-color: var(--color-control);
		}

		&:active {
			transform: scale(0.98);
		}
	}

	// the empty zone a new year would fill
	.add-year {
		flex: 1;
	}

	.drop-year.confirming {
		color: var(--color-on-accent);
		background-color: var(--color-danger);
		border-style: solid;
		border-color: var(--color-danger-deep);
	}

	// a year added just now drops into its row, trimester by trimester
	.fresh {
		animation: year-in 0.45s var(--spring) both;
		animation-delay: calc(var(--t, 0) * 45ms);
	}

	@keyframes year-in {
		from {
			opacity: 0;
			transform: translateY(-10px) scale(0.97);
		}
	}

	// the bulk actions: one quiet row with room above and below, so it
	// doesn't crowd the grid or the footer. Only the fill colour marks the
	// one that matters most.
	.acts-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.8rem;
		margin: 1.6rem 0 2.4rem;
		padding: 0 8.2rem;
	}

	.fill,
	.strip {
		min-height: 3.6rem;
		padding: 0.7rem 1.6rem;
		font: inherit;
		font-size: 1.3rem;
		border: 1px solid var(--color-border-card);
		border-radius: 6px;
		cursor: pointer;
	}

	// wiping the grid is a different kind of thing — off at the far end
	.clear {
		margin-left: auto;
	}

	// the one that fills the board in — accent, so it reads as the primary
	// without being any bigger
	.fill {
		font-weight: 600;
		color: var(--color-on-accent);
		background-color: var(--color-accent);
		border-color: var(--color-control-deep);
		@include glossy-accent;

		&:hover {
			filter: brightness(1.07);
		}
	}

	// the tidy-ups — App Store price-tag buttons, so they never compete with
	// the plum one beside them
	.strip {
		@include store-button($armable: true);
	}

	.fill {
		transition:
			background-color 140ms ease,
			box-shadow 140ms ease,
			transform 140ms var(--spring);

		&:active:not(:disabled) {
			transform: translateY(1px) scale(0.98);
			transition-duration: 70ms;
		}
	}


	// undo / redo: glyphs, a touch larger than the bar's labels
	.history button {
		min-width: 3.2rem;
		justify-content: center;
		font-size: 1.6rem;
		line-height: 1;

		&:disabled {
			opacity: 0.4;
			cursor: default;
		}
	}

	// the dotted rule between the bar's groups
	.bar-rule {
		align-self: stretch;
		margin: 0.6rem 0;
		border-left: 1px dotted color-mix(in srgb, var(--bar-text-muted) 55%, transparent);
	}

	// the status pushes to the far end
	.bar-end {
		margin-left: auto;
	}

	// the roles, then a dotted rule, then the subjects
	.legend + .legend {
		margin-top: 0.4rem;
		padding-top: 0.4rem;
		border-top: 1px dotted color-mix(in srgb, var(--bar-text-muted) 55%, transparent);
	}

	.legend .key {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		padding: 0.5rem 1rem 0.5rem 0.6rem;
		font-size: 1.25rem;
		color: var(--color-text);
		border-radius: 4px;
		cursor: default;

		&:hover {
			background: var(--bar-well);
		}

		em {
			margin-left: -0.3rem;
			font-style: normal;
			color: var(--color-text-muted);
		}
	}

	.legend {
		.key {
			// a swatch shaped like the chip it stands for, not a checkbox
			i {
				display: grid;
				place-items: center;
				width: 1.8rem;
				height: 1.1rem;
				border-radius: 3px;
				@include course-type-fill($audits: false);
			}

			.req-dot {
				@include required-dot;
				width: 0.5rem;
				height: 0.5rem;
			}
		}
	}

	// the count and its switch share one recessed capsule, so they read as
	// one thing: "104 of 128, counting to the minimum"
	.credit-goal {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 3px;
		background: var(--bar-well);
		border: 0; // the recess alone frames it — no ring around the rings
		border-radius: 999px;
		box-shadow: inset 0 1px 2px rgba(20, 30, 50, 0.14), 0 1px 0 var(--bar-hi);
	}

	.goal-seg {
		position: relative;
		isolation: isolate;
		display: inline-grid;
		grid-template-columns: 1fr 1fr;
		// the knob: slides across on a spring, and squashes under the finger
		// while the switch is held — released, it springs over and back to shape
		--knob-x: 0%;
		--knob-s: 1;
		&::before {
			content: '';
			position: absolute;
			z-index: -1;
			inset: 2px auto 2px 2px;
			width: calc((100% - 4px) / 2);
			border-radius: 999px;
			background: var(--color-accent);
			box-shadow: var(--shadow-inset);
			transform: translateX(var(--knob-x)) scale(calc(2 - var(--knob-s)), var(--knob-s));
			transition: transform 320ms var(--spring);
		}
		&.maximum { --knob-x: 100%; }
		&:active { --knob-s: 0.88; }
		&:active::before { transition-duration: 90ms; }
		padding: 2px;
		font: inherit;
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 999px;
		box-shadow: var(--shadow-well);
		cursor: pointer;

		span {
			padding: 0.25rem 0.8rem;
			font-size: 1.1rem;
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: var(--color-text-muted);
			transition: color 0.2s ease;

			&.active {
				color: var(--color-on-accent);
			}
		}

		// the side a click would switch to brightens, so it reads as one control
		&:hover span:not(.active) {
			color: var(--color-text);
		}
	}

	.placed-total {
		// the programmes can't fit under the ceiling at all
		&.conflict {
			color: var(--color-danger);
			border-color: var(--color-danger);
			border-style: dashed;
		}

		&.over {
			color: var(--color-danger);
			border-color: var(--color-danger);
		}

		padding: 0.4rem 1rem;
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
		background-color: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 999px;
		cursor: pointer;
		@include glossy;

		em {
			font-style: normal;
			color: var(--color-text-muted);
			padding: 0 0.2rem;
		}
	}

	.cgpa-btn {
		padding: 0.4rem 1rem;
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
		background-color: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 999px;
		cursor: pointer;
		@include glossy;

		.cgpa-lbl {
			font-size: 1.1rem;
			font-weight: 600;
			letter-spacing: 0.03em;
			color: var(--color-text-muted);
		}
	}

	.year-long,
	.mobile-term,
	.mobile-title {
		display: none;
	}
	.chip-open {
		display: flex;
		align-items: center;
		flex: 1;
		min-width: 0;
		gap: 0.4rem;
		text-align: left;
		color: inherit;
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		cursor: pointer;

		// the whole chip opens the course, padding and all — a click there
		// used to fall through to the cell and open the trimester instead
		&::before {
			content: '';
			position: absolute;
			inset: 0;
		}
	}

	// …the × stays on top of that
	.chip .x {
		z-index: 1;
	}

	// a tablet's desktop columns, worked by finger: everything a fingertip
	// tall, and nothing waiting on a hover that never comes
	@include touch {
		.keys button,
		.placed-total,
		.cgpa-btn {
			min-height: 4rem;
		}

		.goal-seg span {
			padding: 0.8rem 1.1rem;
		}

		.fill,
		.strip,
		.add-year,
		.drop-year {
			min-height: 4.4rem;
		}

		.legend .key {
			padding: 1rem 1.4rem 1rem 0.8rem;
		}

		// the × stays visible; pinned in the chip's corner on the desktop
		// columns, its touch area reaches past its glyph (a phone's row has
		// room for a full-size one instead)
		.chip .x {
			opacity: 0.7;
		}

		@media (min-width: 768px) {
			.chip .x::before {
				content: '';
				position: absolute;
				inset: -0.9rem -0.5rem;
			}
		}

		.cell-credits .clear {
			opacity: 0.7;
		}
	}
	@include mobile {
		.board-bar {
			position: relative;
			padding: 1.2rem 1.6rem;
			gap: 0.8rem;
		}
		.bar-rule {
			display: none;
		}
		.bar-end {
			margin-left: 0;
		}
		.overview,
		.overview.graded {
			grid-template-columns: minmax(0, 1fr);
			padding: 1.6rem;
			gap: 1.2rem;
			transition: none;
		}
		.corner,
		.trim-head {
			display: none;
		}
		.year-head {
			display: flex;
			align-items: center;
			gap: 1rem;
			text-align: left;
			padding: 1.2rem 0 0.2rem;
			font-weight: 600;
		}
		.year-short { display: none; }
		.year-long { display: inline; }

		.cell {
			min-height: 13rem;
			padding: 1.4rem 1.4rem 4.8rem;
			gap: 0.8rem;
		}
		.mobile-term {
			background: none;
			border: 0;
			padding: 0;
			text-align: left;
			cursor: pointer;
			order: -1;
			display: flex;
			width: 100%;
			align-items: center;
			justify-content: space-between;
			gap: 1rem;
			padding-bottom: 0.8rem;
			font-size: 1.5rem;
			font-weight: 600;
			color: var(--color-text);
		}
		.mobile-term span {
			font-size: 1.1rem;
			font-weight: 400;
			color: var(--color-text-muted);
		}
		.chip,
		.chip.showing-title {
			flex-basis: 100%;
			max-width: 100%;
			width: 100%;
			padding: 0.4rem 0.8rem;
		}
		.chip-open {
			font-size: 1.4rem;
			min-height: 4.4rem;
		}
		.chip .label {
			white-space: normal;
			overflow: visible;
		}
		.mobile-title {
			display: block;
			font-size: 1.4rem;
			font-weight: 400;
			line-height: 1.4;
			margin-top: 0.2rem;
		}
		.chip .x {
			position: static;
			opacity: 1;
			min-width: 4.4rem;
			flex-shrink: 0;
		}
		.cell-credits {
			font-size: 1.3rem;
		}
		.cell-credits .clear {
			opacity: 1;
			min-width: 4.4rem;
		}
		.example-note,
		.grade-hint {
			margin: 1.6rem;
			font-size: 1.4rem;
		}
		.year-acts {
			grid-column: 1 / -1;
		}
		.year-head,
		.cell {
			grid-column: 1;
			min-width: 0;
		}
		.year-acts,
		.acts-row {
			padding: 1.6rem;
			flex-wrap: wrap;
		}
	}
	@include mobile {
		@container plan (min-width: 720px) {
			.overview, .overview.graded { grid-template-columns: repeat(3, minmax(0, 1fr)); }
			.cell { grid-column: auto; }
			.year-head, .year-acts { grid-column: 1 / -1; }
			.mobile-term { flex-wrap: wrap; gap: 0.5rem; }
		}
	}
</style>
