<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import { TRIM_HARD_MAX, TRIM_MIN, byCode } from '$lib/data';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import { sendCourse, receiveCourse } from '$lib/transitions';

	let { plan }: { plan: Plan } = $props();

	// zoom is guaranteed non-null while this component is mounted
	let year = $derived(plan.zoom!.year);
	let trim = $derived(plan.zoom!.trim);

	// Each background cell = 1 credit; the canvas is the 20-credit hard cap
	// (4 columns × 5 rows). The 12-credit minimum reads as three 2×2 boxes —
	// the exact footprint of the three 4-credit courses it takes to reach it.
	const MIN_BOXES = Array.from({ length: TRIM_MIN / 4 }, (_, i) => i);
	const REST_CELLS = Array.from({ length: TRIM_HARD_MAX - TRIM_MIN }, (_, i) => i);
	const FREE_CELLS = Array.from({ length: TRIM_HARD_MAX }, (_, i) => i);

	// year 1's t3 carries no credit minimum or maximum at all
	let exempt = $derived(year === 1);

	// a course covers exactly as many squares as it has credits:
	// 4 → 2×2, 3 → 3×1, 2 → 2×1, 1 → 1×1
	function spans(credits: number): { col: number; row: number } {
		if (credits <= 3) return { col: Math.max(1, credits), row: 1 };
		return { col: 2, row: Math.ceil(credits / 2) };
	}

	function drop(e: DragEvent) {
		e.preventDefault();
		plan.dragging = null;
		const code = e.dataTransfer?.getData('text/plain');
		if (code) plan.place(code, year, trim);
	}

	function dragstart(e: DragEvent, code: string) {
		e.dataTransfer?.setData('text/plain', code);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
		plan.dragging = code;
	}
</script>

<header>
	<button class="back" onclick={() => (plan.zoom = null)}>← back</button>
	<h1>Year {year}, Trimester {trim}</h1>
	<span class="load">
		{plan.slotCredits(year, trim)}{exempt ? '' : ` / ${TRIM_HARD_MAX}`} credits
	</span>
</header>

<div class="canvas" role="list" ondragover={(e) => e.preventDefault()} ondrop={drop}>
	<div class="layer zones">
		{#if exempt}
			{#each FREE_CELLS as i (i)}
				<div class="zone-cell"></div>
			{/each}
		{:else}
			{#each MIN_BOXES as i (i)}
				<div class="zone-box"></div>
			{/each}
			{#each REST_CELLS as i (i)}
				<div class="zone-cell"></div>
			{/each}
		{/if}
	</div>

	<div class="layer courses">
		{#each plan.slotCourses(year, trim) as code (code)}
			{@const course = byCode(code)}
			{@const span = spans(course.credits)}
			<div
				class="placed"
				data-type={plan.courseType(code)}
				class:flagged={plan.flaggedCodes.has(code)}
				class:is-audit={plan.isAudit(code)}
				class:dragging={plan.dragging === code}
				data-prog={plan.accentOf(code)}
				style="grid-column: span {span.col}; grid-row: span {span.row};"
				draggable="true"
				role="listitem"
				animate:flip={{ duration: 220 }}
				in:receiveCourse={{ key: code }}
				out:sendCourse={{ key: code }}
				ondragstart={(e) => dragstart(e, code)}
				ondragend={() => (plan.dragging = null)}
				onclick={() => (plan.selected = course)}
			>
				<button class="x" aria-label="remove {code}" onclick={() => plan.remove(code)}>×</button>
				<span class="code">{plan.shownCode(code)}</span>
				<span class="title">{course.title}</span>
				<span class="credits">{course.credits} cr</span>
			</div>
		{/each}
	</div>
</div>

{#if plan.flash}
	<div class="flash" transition:fly={{ y: 12, duration: 220 }}>{plan.flash}</div>
{/if}

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	header {
		display: flex;
		align-items: baseline;
		gap: 2rem;
		padding: 2.4rem 3.2rem 1.6rem;

		h1 {
			font-size: 3rem;
			font-weight: 400;
		}

		.load {
			font-size: 1.4rem;
			color: var(--color-text-muted);
		}
	}

	.back {
		padding: 0.6rem 1.2rem;
		font-size: 1.3rem;
		color: var(--color-text);
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 3px;
		cursor: pointer;
		@include card-shine;

		&:hover {
			background: var(--color-hover-medium);
		}
	}

	.canvas {
		position: relative;
		height: 46rem;
		max-width: 76rem;
		margin: 0 3.2rem 3.2rem;
		border: 1px dashed var(--color-zone-border); // outer border follows the rounded corner
		border-radius: 10px;
		overflow: hidden;
	}

	// 20 one-credit cells: the hard cap (grid-template-rows must stay
	// TRIM_HARD_MAX / 4 rows)
	.layer {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		grid-template-rows: repeat(5, 1fr);
	}

	.zone-cell {
		background: var(--color-zone-rest);
		border: 1px dashed var(--color-zone-border);
	}

	// the minimum load, drawn as course-shaped 2×2 boxes
	.zone-box {
		grid-column: span 2;
		grid-row: span 2;
		background: var(--color-zone-min);
		border: 1px dashed var(--color-zone-border);
	}

	.courses {
		pointer-events: none;
		grid-auto-flow: dense;
	}

	.placed {
		pointer-events: auto;
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 0;
		margin: 0.7rem;
		padding: 1.2rem 1.4rem;
		border-radius: 8px;
		cursor: grab;
		transition:
			transform 0.15s ease,
			opacity 0.15s ease,
			box-shadow 0.2s ease;
		@include course-type-fill;
		@include card-shine;
		@include programme-accent;

		&:hover {
			transform: translateY(-2px);
			@include card-shine-hover;
		}

		&:active {
			cursor: grabbing;
		}

		// the source of an in-flight drag fades back while the cursor carries it
		&.dragging {
			opacity: 0.35;
		}

		.code {
			font-size: 1.6rem;
			font-weight: 700;
		}

		.title {
			font-size: 1.5rem;
			overflow: hidden;
		}

		.credits {
			margin-top: auto;
			font-size: 1.2rem;
			color: var(--color-text-muted);
		}

		&.flagged .code {
			text-decoration: underline dotted;
		}

		.x {
			display: none;
			position: absolute;
			top: 0.6rem;
			right: 0.8rem;
			background: none;
			border: none;
			font-size: 1.6rem;
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

	.flash {
		position: fixed;
		bottom: 2.4rem;
		right: 2.4rem;
		padding: 1rem 1.6rem;
		font-size: 1.4rem;
		background: var(--color-hint-warn);
		border-radius: 4px;
		@include card-shine;
	}
</style>
