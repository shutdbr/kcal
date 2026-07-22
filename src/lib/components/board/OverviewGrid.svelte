<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import type { TrimNum } from '$lib/types';
	import { byCode, isCore, TRIM_NORMAL_MAX } from '$lib/data';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import { sendCourse, receiveCourse } from '$lib/transitions';

	let { plan }: { plan: Plan } = $props();

	let gridEl: HTMLDivElement;

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
	<!-- one obvious switch: whose plan is on the grid right now -->
	<div class="view-toggle" role="group" aria-label="which plan is shown">
		<button class:active={!plan.idealView} onclick={() => plan.idealView && plan.toggleIdealView()}>
			your plan
		</button>
		<button class:active={plan.idealView} onclick={() => !plan.idealView && plan.toggleIdealView()}>
			✧ ideal path
		</button>
	</div>

	<label class="titles-toggle">
		<input type="checkbox" class="tick" bind:checked={plan.showTitles} />
		<span>show course titles</span>
	</label>

	<div class="legend" aria-label="course colour legend">
		<span class="key"><i data-type="core"></i>foundation</span>
		<span class="key"><i data-type="required"></i>required</span>
		<span class="key"><i data-type="elective"></i>elective</span>
		<span class="key"><i data-type="other"></i>other dept.</span>
	</div>

	<span class="placed-total" title="credits placed / degree total">
		{plan.totalPlacedCredits}<em>/</em>{plan.degreeTotal} cr
	</span>
</div>

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
		<div class="year-head">y{y}</div>
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
						animate:flip={{ duration: 220 }}
						in:receiveCourse={{ key: code }}
						out:sendCourse={{ key: code }}
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

<div class="save-row">
	{#if plan.idealView}
		<!-- previewing: the only decision is whether to take this path -->
		<button class="save" onclick={() => plan.adoptIdeal()}>
			✧ use this plan
		</button>
		<span class="save-note">just looking — switch back to “your plan” and nothing has changed</span>
	{:else if plan.unsaved}
		<button class="save" transition:fly={{ y: 8, duration: 180 }} onclick={() => plan.savePlan()}>
			<svg class="save-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
				<polyline points="17 21 17 13 7 13 7 21" />
				<polyline points="7 3 7 8 15 8" />
			</svg>
			save plan
		</button>
	{:else}
		<span class="save-note">✓ plan saved</span>
	{/if}
</div>

{#if plan.flash}
	<div class="flash" transition:fly={{ y: 12, duration: 220 }}>{plan.flash}</div>
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

		// while dragging: mint where the course fits cleanly, with a gentle
		// pulse so the eye is drawn to the valid slots. A course CAN be dropped
		// anywhere unlocked (the hints flag a bad trimester) — so a slot it
		// doesn't fit is left looking normal, not forbidden.
		&.can-drop {
			background: var(--color-course-audit);
			outline-color: var(--color-border-audit);
			animation: pulse-drop 1.4s ease-in-out infinite;
		}

	}

	@keyframes pulse-drop {
		0%,
		100% {
			outline-color: var(--color-border-audit);
		}
		50% {
			outline-color: transparent;
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

	.chip {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		height: fit-content;
		// extra right padding reserves the top-right corner for the × button,
		// which sits in the corner for every chip rather than beside the label
		padding: 0.7rem 2.2rem 0.7rem 1rem;
		font-size: 1.3rem;
		border-radius: 3px;
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
	.board-bar {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 2.4rem;
		flex-wrap: wrap;
		padding: 1.4rem 3.2rem;
		background: var(--color-bg);
		border-bottom: 1px solid var(--color-border-divider);
	}

	// the your-plan ⇄ ideal-path segmented switch
	.view-toggle {
		display: flex;
		border: 1px solid var(--color-border-card);
		border-radius: 4px;
		overflow: hidden;
		@include card-shine;

		button {
			padding: 0.6rem 1.4rem;
			font-size: 1.35rem;
			font-weight: 600;
			color: var(--color-text-muted);
			background: var(--color-bg-light);
			border: none;
			cursor: pointer;
			transition:
				background 0.15s ease,
				color 0.15s ease;

			&:hover {
				color: var(--color-text);
			}

			&.active {
				color: #fff;
				background: var(--color-accent);
			}
		}

		button + button {
			border-left: 1px solid var(--color-border-card);
		}
	}

	.titles-toggle {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		font-size: 1.4rem;
		font-weight: 600;
		color: var(--color-text);
		cursor: pointer;

		// square checkbox, same look as the sidebar's 4yup tick
		.tick {
			appearance: none;
			width: 1.8rem;
			height: 1.8rem;
			background: var(--color-bg-light);
			border: 1px solid var(--color-border-card);
			border-radius: 3px;
			cursor: pointer;

			&:checked {
				background: #a01414;
				border-color: #7c1010;
			}
		}
	}

	// under the grid: the save button when there's something to save, a quiet
	// "✓ plan saved" otherwise, and "use this plan" while previewing the ideal
	.save-row {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.8rem;
		min-height: 6rem;
		padding: 0 3.2rem 3.2rem;
	}

	.save-note {
		font-size: 1.3rem;
		color: var(--color-text-muted);
	}

	.save {
		display: flex;
		align-items: center;
		gap: 1rem;
		min-width: 22rem;
		justify-content: center;
		padding: 1rem 2.8rem;
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--color-text);
		background: linear-gradient(to bottom, var(--color-bg-card-start) 0%, var(--color-bg-card-end) 100%);
		border: 1px solid var(--color-border-card);
		border-radius: 4px;
		cursor: pointer;
		@include card-shine;
		transition:
			transform 0.15s ease,
			box-shadow 0.15s ease,
			background 0.15s ease;

		&:hover {
			transform: translateY(-1px);
			background: var(--color-bg-light);
			@include card-shine-hover;
		}

		&:active {
			transform: none;
		}
	}

	.save-icon {
		width: 1.7rem;
		height: 1.7rem;
		color: var(--color-accent);
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

	.placed-total {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-text);
		font-variant-numeric: tabular-nums;

		em {
			font-style: normal;
			color: var(--color-text-muted);
			padding: 0 0.2rem;
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
