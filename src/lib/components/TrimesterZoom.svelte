<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import { TRIM_HARD_MAX, TRIM_MIN, TRIM_NORMAL_MAX, byCode } from '$lib/data';

	let { plan }: { plan: Plan } = $props();

	// zoom is guaranteed non-null while this component is mounted
	let year = $derived(plan.zoom!.year);
	let trim = $derived(plan.zoom!.trim);

	// Each background cell = 1 credit. 4 columns × 7 rows = the 28-credit cap.
	// First 12 darker (the minimum), up to 20 normal, 21–28 = overload zone.
	const CELLS = Array.from({ length: TRIM_HARD_MAX }, (_, i) => i);

	function drop(e: DragEvent) {
		e.preventDefault();
		const code = e.dataTransfer?.getData('text/plain');
		if (code) plan.place(code, year, trim);
	}

	function dragstart(e: DragEvent, code: string) {
		e.dataTransfer?.setData('text/plain', code);
	}
</script>

<header>
	<button class="back" onclick={() => (plan.zoom = null)}>← back</button>
	<h1>Year {year}, Trimester {trim}</h1>
	<span class="load">{plan.slotCredits(year, trim)} / {TRIM_NORMAL_MAX} credits</span>
</header>

<div class="canvas" role="list" ondragover={(e) => e.preventDefault()} ondrop={drop}>
	<div class="layer zones">
		{#each CELLS as i (i)}
			<div class="zone-cell" class:min={i < TRIM_MIN} class:normal={i >= TRIM_MIN && i < TRIM_NORMAL_MAX}></div>
		{/each}
	</div>

	<div class="layer courses">
		{#each plan.slotCourses(year, trim) as code (code)}
			{@const course = byCode(code)}
			<div
				class="placed"
				data-type={plan.courseType(code)}
				class:flagged={plan.flaggedCodes.has(code)}
				style="grid-column: span 2; grid-row: span {course.credits >= 4 ? 2 : 1};"
				draggable="true"
				role="listitem"
				ondragstart={(e) => dragstart(e, code)}
			>
				<button class="x" aria-label="remove {code}" onclick={() => plan.remove(code)}>×</button>
				<span class="code">{code}</span>
				<span class="title">{course.title}</span>
				<span class="faculty">{course.faculty}</span>
			</div>
		{/each}
	</div>
</div>

{#if plan.flash}
	<div class="flash">{plan.flash}</div>
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
		height: 63rem;
		max-width: 76rem;
		margin: 0 3.2rem 3.2rem;
		border-radius: 10px;
		overflow: hidden;
	}

	.layer {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		grid-template-rows: repeat(7, 1fr);
	}

	.zone-cell {
		background: var(--color-zone-over);
		border: 1px dashed var(--color-zone-border);

		&.min {
			background: var(--color-zone-min);
		}

		&.normal {
			background: var(--color-zone-normal);
		}
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
		margin: 0.7rem;
		padding: 1.2rem 1.4rem;
		border-radius: 8px;
		cursor: grab;
		@include course-type-fill;
		@include card-shine;

		.code {
			font-size: 1.6rem;
			font-weight: 700;
		}

		.title {
			font-size: 1.5rem;
		}

		.faculty {
			margin-top: auto;
			font-size: 1.4rem;
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
