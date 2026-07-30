<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import type { TrimNum } from '$lib/types';
	import { byCode, isCore } from '$lib/data';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import { courseIn, courseOut, courseShift } from '$lib/transitions';
	import CreditRules from './CreditRules.svelte';
	import GradesPanel from '../grades/GradesPanel.svelte';

	let { plan }: { plan: Plan } = $props();

	let gridEl: HTMLDivElement;
	let showCredits = $state(false);
	let showGrades = $state(false);

	// grade view changes what the whole board means — credits become TGPA, chips
	// take a mark — so the first time it's switched on, say so. Once dismissed
	// (or once they've read it and turned grade view off) it stays gone.
	const GRADE_HINT_KEY = 'tracey-grade-hint-seen';
	let showGradeHint = $state(false);
	function dismissGradeHint() {
		showGradeHint = false;
		localStorage.setItem(GRADE_HINT_KEY, '1');
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

	function drop(e: DragEvent) {
		e.preventDefault();
		plan.dragging = null;
		const code = e.dataTransfer?.getData('text/plain');
		if (!code) return;
		const slot = nearestSlot(e.clientX, e.clientY, code);
		if (slot) plan.place(code, slot.year, slot.trim);
	}

	function chipDragstart(e: DragEvent, code: string) {
		e.dataTransfer?.setData('text/plain', code);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
		plan.dragging = code;
	}

	function open(year: number, trim: TrimNum) {
		plan.zoom = { year, trim };
	}

</script>

<div class="board-bar">
	<!-- grade view: unlocks grade entry on chips, in the details panel, and the
	     CGPA / recovery panel -->
	<button
		class="grade-toggle"
		class:active={plan.gradeMode}
		aria-pressed={plan.gradeMode}
		title="grade view — enter grades and track your CGPA"
		onclick={() => {
			plan.gradeMode = !plan.gradeMode;
			if (plan.gradeMode && !localStorage.getItem(GRADE_HINT_KEY)) showGradeHint = true;
			else showGradeHint = false;
		}}
	>
		grade view
	</button>

	<!-- what the chips are labelled with: code, title, or both -->
	<div class="label-toggle" role="group" aria-label="what course chips show">
		<span class="lt-lead">show</span>
		<label>
			<input
				type="checkbox"
				class="tick"
				checked={plan.showCodes}
				onchange={() => plan.toggleLabel('code')}
			/>
			<span>codes</span>
		</label>
		<label>
			<input
				type="checkbox"
				class="tick"
				checked={plan.showTitles}
				onchange={() => plan.toggleLabel('title')}
			/>
			<span>titles</span>
		</label>
		{#if plan.gradeMode}
			<label>
				<input
					type="checkbox"
					class="tick"
					checked={plan.showGradeLabels}
					onchange={() => (plan.showGradeLabels = !plan.showGradeLabels)}
				/>
				<span>grades</span>
			</label>
		{/if}
	</div>

	<div class="legend" aria-label="course colour legend">
		<span class="key"><i data-type="core"></i>kccs</span>
		<span class="key"><i data-type="required"></i>required</span>
		<span class="key"><i data-type="elective"></i>elective</span>
		<span class="key"><i data-type="other"></i>other dept.</span>
	</div>

	{#if plan.gradeMode}
		<button
			class="cgpa-btn"
			title="enter grades, see your CGPA and what you need to recover"
			onclick={() => (showGrades = true)}
		>
			{#if plan.cgpa === null}enter grades{:else}<span class="cgpa-lbl">CGPA</span> {plan.cgpa.toFixed(2)}{/if}
		</button>
	{/if}

	{#if !plan.gradeMode}
		<button
			class="placed-total"
			title="credits placed / degree total — click for the drop-form rules"
			onclick={() => (showCredits = true)}
		>
			{plan.totalPlacedCredits}<em>/</em>{plan.degreeTotal} cr
		</button>
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
	<GradesPanel {plan} onclose={() => (showGrades = false)} />
{/if}

<div
	class="overview"
	class:dragging={plan.dragging !== null}
	style="--cols: {plan.trims.length}"
	role="list"
	aria-label="course plan grid"
	bind:this={gridEl}
	ondragover={(e) => e.preventDefault()}
	ondrop={drop}
>
	<div class="corner"></div>
	{#each plan.trims as t (t)}
		<div class="trim-head">t{t}</div>
	{/each}

	{#each plan.years as y (y)}
		<div class="year-head">
			{#if plan.gradeMode}
				{@const yg = plan.yearGpa(y)}
				<span class="yh-gpa">{yg === null ? '—' : yg.toFixed(2)}</span>
				<span class="yh-year">y{y}</span>
			{:else}
				y{y}
			{/if}
		</div>
		{#each plan.trims as t (t)}
			{@const coreSlot = plan.coreOnly(y, t)}
			{@const slotCredits = plan.slotCredits(y, t)}
			<div
				class="cell"
				class:core-slot={coreSlot}
				class:problem={plan.slotHasProblem(y, t)}
				class:can-drop={plan.dragging !== null && plan.canDrop(plan.dragging, y, t)}
				data-year={y}
				data-trim={t}
				data-core-only={coreSlot || undefined}
				role="button"
				tabindex="0"
				aria-label="open year {y} trimester {t}"
				onclick={() => open(y, t)}
				onkeydown={(e) => e.key === 'Enter' && open(y, t)}
			>
				{#if coreSlot && plan.slotCourses(y, t).length === 0}
					<span class="core-note">kccs courses</span>
				{/if}
				{#each plan.slotCourses(y, t) as code (code)}
					<div
						class="chip"
						class:flagged={plan.flaggedCodes.has(code)}
						class:is-audit={plan.isAudit(code)}
						class:showing-title={plan.showTitles}
						class:dragging={plan.dragging === code}
						data-type={plan.courseType(code)}
						data-prog={plan.accentOf(code)}
						draggable="true"
						role="listitem"
						animate:flip={courseShift}
						in:courseIn={{ key: code }}
						out:courseOut={{ key: code }}
						ondragstart={(e) => chipDragstart(e, code)}
						ondragend={() => (plan.dragging = null)}
						onclick={(e) => {
							e.stopPropagation();
							plan.selected = byCode(code);
						}}
					>
						{#if plan.gradeMode && plan.showGradeLabels && plan.gradeOf(code)}
							<span class="chip-grade" class:fail={plan.gradeOf(code) === 'U'}>{plan.gradeOf(code)}</span>
						{/if}
						<span class="label">{plan.gridLabel(code)}</span>
						<button
							class="x"
							aria-label="remove {code}"
							onclick={(e) => {
								e.stopPropagation();
								plan.remove(code);
							}}>×</button
						>
					</div>
				{/each}

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
							title="suggested here — click to add {code}"
							animate:flip={courseShift}
							onclick={(e) => {
								e.stopPropagation();
								plan.acceptSuggestion(code);
							}}
						>
							<span class="label">{plan.gridLabel(code)}</span>
							<span class="plus" aria-hidden="true">+</span>
						</button>
					{/each}
				{/if}

				{#if slotCredits > 0}
					<span class="cell-credits" class:over={!plan.gradeMode && y !== 1 && slotCredits > plan.targetLoad}>
						{#if plan.gradeMode}
							{@const tg = plan.slotTgpa(y, t)}
							<span class="cell-tgpa">TGPA {tg === null ? '—' : tg.toFixed(2)}</span>
						{:else}
							{slotCredits} cr
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
</div>

<!-- Bulk grid actions. The recommended path is not a second plan you switch
     to — it is shown in place, as ghosts, in the slots it would use, and this
     takes all of them at once. -->
{#if !plan.gradeMode && (plan.suggestionCount || plan.otherPlacedCodes.length)}
	<div class="acts-row">
		{#if plan.suggestionCount}
			<button class="fill" onclick={() => plan.acceptAllSuggestions()}>
				fill in the rest
				<em>{plan.suggestionCount} suggested</em>
			</button>
		{/if}

		{#if plan.otherPlacedCodes.length}
			<button
				class="strip"
				title="drop every course that counts toward none of your major / minor / concentration"
				onclick={() => plan.removeOtherCourses()}
			>
				remove non-programme courses
				<em>{plan.otherPlacedCodes.length}</em>
			</button>
		{/if}
	</div>
	{#if plan.suggestionCount}
		<p class="acts-note">or click any dashed course to add just that one</p>
	{/if}
{/if}

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.overview {
		position: relative;
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
		text-align: center;
	}

	// grade view: the year's GPA takes the label's place, with a small y-tag
	.yh-gpa {
		display: block;
		font-size: 1.9rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--color-text);
	}

	.yh-year {
		display: block;
		font-size: 1.1rem;
		color: var(--color-text-muted);
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
		border-radius: 8px;
		cursor: zoom-in;
		outline: 2px dashed transparent;
		outline-offset: -2px;
		transition:
			background 0.25s ease,
			opacity 0.25s ease,
			outline-color 0.25s ease;
		@include card-shine;
		// drop only the outer shadow, keep the inset shine
		box-shadow: var(--shadow-inset);

		&:hover {
			background: var(--color-drop-hint);
		}

		// year-1 t1/t2: reserved for the foundation core — tinted like the
		// core chips so the pairing is obvious at a glance
		&.core-slot {
			background: color-mix(in srgb, var(--color-course-core) 45%, var(--color-grid-cell));
			outline: 1px dashed var(--color-course-core-deep);
			outline-offset: -4px;
		}

		// a cell holding a course involved in a warning gets tinted
		&.problem {
			background: var(--color-grid-cell-problem);
		}

		// while dragging: mint where the course fits cleanly. Still, not
		// pulsing — the whole grid breathing at once was noise. A course CAN
		// be dropped anywhere unlocked (the hints flag a bad trimester) — so a
		// slot it doesn't fit is left looking normal, not forbidden.
		&.can-drop {
			background: var(--color-course-audit);
			outline-color: var(--color-border-audit);
		}
	}

	.cell-credits {
		position: absolute;
		bottom: 0.5rem;
		right: 0.8rem;
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--color-text-muted);

		&.over {
			color: var(--color-danger);
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
	// are in, the periwinkle tint alone marks the slot and the text goes
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
		overflow: hidden; // clips the accent stripe to the rounded corners
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
		@include programme-accent;

		&:hover {
			transform: translateY(-1px);
			@include card-shine-hover;
		}

		&:active {
			cursor: grabbing;
		}

		// the source of an in-flight drag fades back, so the cursor ghost reads
		// as the course being lifted off the grid
		&.dragging {
			opacity: 0.35;
		}

		// involved in a hint → bold, like the mockups
		&.flagged {
			font-weight: 700;
		}

		.label {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
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
			opacity: 0;
			cursor: pointer;
			transition:
				opacity 0.15s ease,
				color 0.15s ease;

			&:hover {
				color: var(--color-text);
			}
		}

		&:hover .x {
			opacity: 1;
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
		gap: 2.4rem;
		flex-wrap: wrap;
		min-height: 5.6rem;
		padding: 0.8rem 3.2rem;
		background: linear-gradient(to bottom, var(--color-bg-board-start) 0%, var(--color-bg-board-end) 30%);
		box-shadow: var(--shadow-card);
		border-bottom: 1px solid color-mix(in srgb, var(--color-board-text) 55%, transparent);

		// grey out every control inside — the accent/plum and text all go a cool
		// blue-grey so the whole strip reads as one grayscaled zone (the legend's
		// colour swatches keep their own vars, since they're a key)
		--color-accent: #6e7889;
		--color-control: #7f8a9b;
		--color-control-deep: #58616f;
		--color-text: #464e5c;
		--color-text-muted: #767e8c;
		--color-border-card: #bcc3cd;

		// cool the gloss/shadows too, so glossy controls (the credits pill,
		// buttons) shine blue-grey instead of the warm pink highlights
		--gloss-face: linear-gradient(
			to bottom,
			rgba(255, 255, 255, 0.72) 0%,
			rgba(255, 255, 255, 0.3) 48%,
			rgba(96, 106, 124, 0.05) 52%,
			rgba(96, 106, 124, 0.16) 100%
		);
		--shadow-inset:
			inset 0 1px 0 rgba(255, 255, 255, 0.95),
			inset 0 6px 9px -6px rgba(255, 255, 255, 0.75),
			inset 0 -5px 8px -7px rgba(96, 106, 124, 0.22);
		--shadow-card: 0 1px 2px rgba(90, 100, 120, 0.1), 0 3px 8px rgba(90, 100, 120, 0.08);
	}

	// the your-plan ⇄ reference-plan segmented switch

	.label-toggle {
		display: flex;
		align-items: center;
		gap: 1.6rem;

		.lt-lead {
			font-size: 1.4rem;
			font-weight: 600;
			color: var(--color-text-muted);
		}

		label {
			display: flex;
			align-items: center;
			gap: 0.8rem;
			font-size: 1.4rem;
			font-weight: 600;
			color: var(--color-text);
			cursor: pointer;
		}

		.tick {
			@include tick(1.7rem);
		}
	}

	// A suggestion wears the same shape as the real chip it would become, at a
	// fraction of the weight — so the grid reads as "your plan, plus what's
	// missing" rather than as two different kinds of thing.
	.ghost {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.7rem;
		font: inherit;
		font-size: 1.2rem;
		text-align: left;
		color: var(--color-text-muted);
		background: none;
		border: 1px dashed var(--color-border-card);
		border-radius: 5px;
		cursor: pointer;
		opacity: 0.75;
		transition:
			opacity 0.15s ease,
			color 0.15s ease,
			border-color 0.15s ease;

		.plus {
			font-weight: 700;
			opacity: 0.6;
		}

		// on hover it firms up into the chip it is about to become
		&:hover {
			opacity: 1;
			color: var(--color-text);
			border-style: solid;
			border-color: var(--color-control);
		}
	}

	// both bulk actions sit together at the left edge of the grid, in one row,
	// at identical size — they are the same KIND of thing, so only the fill
	// colour separates the one that adds from the one that removes
	.acts-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		padding: 0 8.2rem;
	}

	.fill,
	.strip {
		display: inline-flex;
		align-items: baseline;
		gap: 0.6rem;
		padding: 0.7rem 1.6rem;
		font: inherit;
		font-size: 1.3rem;
		border: 1px solid var(--color-border-card);
		border-radius: 6px;
		cursor: pointer;

		em {
			font-style: normal;
			font-size: 1.15rem;
		}
	}

	// the one that fills the board in — accent, so it reads as the primary of
	// the two without being any bigger
	.fill {
		font-weight: 600;
		color: var(--color-on-accent);
		background-color: var(--color-accent);
		border-color: var(--color-control-deep);
		@include glossy-accent;

		em {
			font-weight: 400;
			opacity: 0.8;
		}

		&:hover {
			filter: brightness(1.07);
		}
	}

	// the tidy-up — outlined, so it never competes with the one beside it
	.strip {
		color: var(--color-text);
		background: var(--color-bg-light);

		em {
			color: var(--color-text-muted);
		}

		&:hover {
			background: var(--color-hover-medium);
		}
	}

	.acts-note {
		padding: 0.7rem 8.2rem 0;
		font-size: 1rem;
		color: var(--color-text-muted);
	}

	.legend {
		display: flex;
		align-items: center;
		gap: 1.4rem;
		margin-left: auto;

		.key {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			font-size: 1.25rem;
			color: var(--color-text-muted);

			i {
				width: 1.2rem;
				height: 1.2rem;
				border-radius: 3px;
				@include course-type-fill;
			}
		}
	}

	// clicking it opens the drop-form rules, checked against this plan
	.placed-total {
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

	.grade-toggle {
		padding: 0.5rem 1.2rem;
		font-size: 1.3rem;
		font-weight: 600;
		color: var(--color-text-muted);
		background-color: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 999px;
		cursor: pointer;
		@include glossy;

		// lit plum when on, so "grade view" reads as an active mode
		&.active {
			color: var(--color-on-accent);
			background-color: var(--color-accent);
			border-color: var(--color-control-deep);
			@include glossy-accent;
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

</style>
