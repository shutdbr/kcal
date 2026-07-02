<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import type { TrimNum } from '$lib/types';

	let { plan }: { plan: Plan } = $props();

	function drop(e: DragEvent, year: number, trim: TrimNum) {
		e.preventDefault();
		const code = e.dataTransfer?.getData('text/plain');
		if (code) plan.place(code, year, trim);
	}

	function chipDragstart(e: DragEvent, code: string) {
		e.dataTransfer?.setData('text/plain', code);
	}

	function open(year: number, trim: TrimNum) {
		plan.zoom = { year, trim };
	}
</script>

<div class="overview" style="--cols: {plan.trims.length}">
	<div class="corner"></div>
	{#each plan.trims as t (t)}
		<div class="trim-head">t{t}</div>
	{/each}

	{#each plan.years as y (y)}
		<div class="year-head">y{y}</div>
		{#each plan.trims as t (t)}
			<div
				class="cell"
				class:problem={plan.slotHasProblem(y, t)}
				role="button"
				tabindex="0"
				aria-label="open year {y} trimester {t}"
				onclick={() => open(y, t)}
				onkeydown={(e) => e.key === 'Enter' && open(y, t)}
				ondragover={(e) => e.preventDefault()}
				ondrop={(e) => drop(e, y, t)}
			>
				{#each plan.slotCourses(y, t) as code (code)}
					<div
						class="chip"
						class:flagged={plan.flaggedCodes.has(code)}
						data-type={plan.courseType(code)}
						draggable="true"
						role="listitem"
						ondragstart={(e) => chipDragstart(e, code)}
					>
						{code}
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
			</div>
		{/each}
	{/each}
</div>

{#if plan.flash}
	<div class="flash">{plan.flash}</div>
{/if}

<style lang="scss">
	@use '$lib/styles/mixins' as *;

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
		display: flex;
		flex-wrap: wrap;
		align-content: flex-start;
		gap: 0.8rem;
		min-height: 13rem;
		padding: 1rem;
		background: var(--color-grid-cell);
		border-radius: 3px;
		cursor: zoom-in;
		transition: background 0.15s ease;
		@include card-shine;

		&:hover {
			background: var(--color-drop-hint);
		}

		// a cell holding a course involved in a warning gets tinted
		&.problem {
			background: var(--color-grid-cell-problem);
		}
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

		// involved in a hint → bold, like the mockups
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
