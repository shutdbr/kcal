<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import type { TrimNum } from '$lib/types';
	import { byCode, TRIM_NORMAL_MAX } from '$lib/data';

	let { plan }: { plan: Plan } = $props();

	function drop(e: DragEvent, year: number, trim: TrimNum) {
		e.preventDefault();
		plan.dragging = null;
		const code = e.dataTransfer?.getData('text/plain');
		if (code) plan.place(code, year, trim);
	}

	function chipDragstart(e: DragEvent, code: string) {
		e.dataTransfer?.setData('text/plain', code);
		plan.dragging = code;
	}

	function open(year: number, trim: TrimNum) {
		if (!plan.locked(year, trim)) plan.zoom = { year, trim };
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
			{@const locked = plan.locked(y, t)}
			{@const slotCredits = plan.slotCredits(y, t)}
			<div
				class="cell"
				class:locked
				class:problem={plan.slotHasProblem(y, t)}
				class:can-drop={plan.dragging !== null && plan.canDrop(plan.dragging, y, t)}
				role="button"
				tabindex={locked ? -1 : 0}
				aria-label="open year {y} trimester {t}"
				onclick={() => open(y, t)}
				onkeydown={(e) => e.key === 'Enter' && open(y, t)}
				ondragover={(e) => e.preventDefault()}
				ondrop={(e) => drop(e, y, t)}
			>
				{#if locked}
					<span class="fixed-note">fixed</span>
				{/if}
				{#each plan.slotCourses(y, t) as code (code)}
					<div
						class="chip"
						class:flagged={plan.flaggedCodes.has(code)}
						class:is-audit={plan.isAudit(code)}
						class:showing-title={plan.showTitles}
						data-type={plan.courseType(code)}
						draggable="true"
						role="listitem"
						ondragstart={(e) => chipDragstart(e, code)}
						ondragend={() => (plan.dragging = null)}
						onclick={(e) => {
							e.stopPropagation();
							plan.selected = byCode(code);
						}}
					>
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
				{#if slotCredits > 0}
					<span class="cell-credits" class:over={y !== 1 && slotCredits > TRIM_NORMAL_MAX}>
						{slotCredits} cr
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

<label class="titles-toggle">
	<input type="checkbox" class="tick" bind:checked={plan.showTitles} />
	show course titles
</label>

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
		position: relative;
		display: flex;
		flex-wrap: wrap;
		align-content: flex-start;
		gap: 0.8rem;
		min-height: 13rem;
		padding: 1rem 1rem 2.2rem;
		background: var(--color-grid-cell);
		border-radius: 3px;
		cursor: zoom-in;
		outline: 2px dashed transparent;
		outline-offset: -2px;
		transition:
			background 0.25s ease,
			opacity 0.25s ease,
			outline-color 0.25s ease;
		@include card-shine;

		&:hover {
			background: var(--color-drop-hint);
		}

		// a cell holding a course involved in a warning gets tinted
		&.problem {
			background: var(--color-grid-cell-problem);
		}

		// while dragging: mint where the course fits cleanly. A course CAN be
		// dropped anywhere unlocked (the hints flag a bad trimester) — so a
		// slot it doesn't fit is left looking normal, not forbidden.
		&.can-drop {
			background: var(--color-course-audit);
			outline-color: var(--color-border-audit);
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
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--color-text-muted);

		&.over {
			color: #a01414;
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

	// one switch for every chip, tucked under the grid where the eye
	// lands after scanning it — replaces tapping chips one by one
	.titles-toggle {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		width: fit-content;
		margin: 0 3.2rem;
		padding: 0 0 2.4rem;
		font-size: 1.3rem;
		color: var(--color-text-muted);
		cursor: pointer;

		&:hover {
			color: var(--color-text);
		}

		// square checkbox, same look as the sidebar's 4yup tick
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
