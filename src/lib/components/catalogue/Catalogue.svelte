<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import { subjectById } from '$lib/data';
	import CatalogueCard from './CatalogueCard.svelte';

	let { plan }: { plan: Plan } = $props();

	// filter chips: one per distinct selected subject, plus the foundation
	// core — always on offer, whatever the programmes are
	let filterSubjects = $derived([...new Set([...plan.selectedSubjects, 'core'])]);

	// which subject's code a cross-listed course should be shown under: the
	// active filter if it pins one down, else the single programme subject it
	// belongs to — otherwise leave it on its canonical code
	function contextFor(subjects: string[]): string | undefined {
		const checked = plan.filters.filter(
			(f) => plan.selectedSubjects.includes(f) && subjects.includes(f)
		);
		if (checked.length === 1) return checked[0];
		const inProgramme = plan.selectedSubjects.filter((s) => subjects.includes(s));
		return inProgramme.length === 1 ? inProgramme[0] : undefined;
	}

	// dropping a course back on the catalogue removes it from the plan
	function drop(e: DragEvent) {
		e.preventDefault();
		const code = e.dataTransfer?.getData('text/plain');
		if (code) plan.remove(code);
	}
</script>

<div
	class="catalogue"
	role="list"
	ondragover={(e) => e.preventDefault()}
	ondrop={drop}
>
	<header class="col-header">
		<h2>catalogue</h2>
	</header>

	<!-- search + filters stay put while the cards scroll underneath -->
	<div class="controls">
		<div class="search-box">
			<input class="search" type="search" placeholder="search course" bind:value={plan.search} />
			{#if plan.search}
				<button class="clear-search" aria-label="clear search" onclick={() => (plan.search = '')}>
					×
				</button>
			{/if}
		</div>

		<div class="filters">
			{#each filterSubjects as id (id)}
				<label class="filter" class:core={id === 'core'}>
					<input
						type="checkbox"
						class="tick"
						checked={plan.filters.includes(id)}
						onchange={() => plan.toggleFilter(id)}
					/>
					<span>{subjectById(id).short}</span>
				</label>
			{/each}
		</div>
	</div>

	<div class="scroll">
		<div class="cards">
			{#each plan.catalogue as course (course.code)}
				<!-- card width IS the credit weight: 4cr fills the row, 2cr ½,
				     1cr ¼ — so they pack into rows of 4 (2+2, 2+1+1, …). A 3cr
				     course (the KCCS foundation set) also takes the full row:
				     span-3 cards would strand a dead quarter-column beside
				     every one of them, since nothing 1cr sits nearby to fill it -->
				<div class="cell" style="grid-column: span {course.credits >= 3 ? 4 : Math.max(1, course.credits)};">
					<CatalogueCard
						{plan}
						{course}
						type={plan.courseType(course.code)}
						placed={plan.placedCodes.has(course.code)}
						contextSubject={contextFor(course.subjects)}
					/>
				</div>
			{/each}
		</div>
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.catalogue {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		overflow: hidden;
		background: linear-gradient(to bottom, var(--color-bg-warm-start), var(--color-bg-warm-end));
		border-right: 1px solid var(--color-border-warm);
	}

	.col-header {
		@include card-header;
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;

		h2 {
			font-size: 1.8rem;
			font-weight: 600;
			color: var(--color-text);
		}
	}

	.controls {
		flex-shrink: 0;
		padding: 1.6rem 1.4rem 0;
	}

	.scroll {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 0.4rem 1.4rem 2.4rem;
	}

	.search-box {
		position: relative;
		display: flex;
	}

	.search {
		width: 100%;
		padding: 0.8rem 3rem 0.8rem 1rem; // right padding reserves the × corner
		font-size: 1.4rem;
		color: var(--color-text);
		background: var(--color-bg-card-start);
		border: 1px solid var(--color-border-card);
		border-radius: 3px;
		@include card-shine;

		&::placeholder {
			color: var(--color-text-muted);
		}

		// the button covers clearing — hide any native duplicate ×
		&::-webkit-search-cancel-button {
			display: none;
		}
	}

	.clear-search {
		position: absolute;
		top: 50%;
		right: 0.6rem;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		background: none;
		border: none;
		border-radius: 3px;
		font-size: 1.7rem;
		line-height: 1;
		color: var(--color-text-muted);
		cursor: pointer;

		&:hover {
			color: var(--color-text);
			background: var(--color-hover-medium);
		}
	}

	.filters {
		display: flex;
		gap: 1.4rem;
		padding: 1rem 0.2rem;
	}

	.filter {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.4rem;
		cursor: pointer;

		// kccs is a different beast (all-or-nothing core view) — set it
		// apart from the subject chips with a gap and a divider
		&.core {
			margin-left: auto;
			padding-left: 1.4rem;
			border-left: 1px solid var(--color-border-card);
		}
	}

	.tick {
		appearance: none;
		width: 1.3rem;
		height: 1.3rem;
		background: var(--color-grid-cell);
		border: 1px solid var(--color-border-card);
		border-radius: 2px;
		cursor: pointer;

		&:checked {
			background: #c33f3f;
			border-color: #a02f2f;
		}
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(4, 1fr); // one column per credit
		grid-auto-flow: row dense; // a later small card backfills a half-empty row
		gap: 1rem;
	}

	.cell {
		display: grid; // so the card stretches
		min-width: 0; // long titles ellipsize instead of widening the column
	}
</style>
