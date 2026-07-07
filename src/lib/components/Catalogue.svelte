<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import { subjectById } from '$lib/data';
	import CatalogueCard from './CatalogueCard.svelte';

	let { plan }: { plan: Plan } = $props();

	// filter chips: one per distinct selected subject
	let filterSubjects = $derived([...new Set(plan.selectedSubjects)]);

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

	<div class="scroll">
		<input class="search" type="search" placeholder="search course" bind:value={plan.search} />

		<div class="filters">
			{#each filterSubjects as id (id)}
				<label class="filter">
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

		<div class="cards" class:two-col={plan.zoom !== null}>
			{#each plan.catalogue as course (course.code)}
				<!-- card width follows credits: a 4-credit course takes the full row, smaller ones half -->
				<div class="cell" class:wide={plan.zoom !== null && course.credits >= 3}>
					<CatalogueCard
						{plan}
						{course}
						type={plan.courseType(course.code)}
						placed={plan.placedCodes.has(course.code)}
						detailed={plan.zoom !== null}
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

	.scroll {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 1.6rem 1.4rem 2.4rem;
	}

	.search {
		padding: 0.8rem 1rem;
		font-size: 1.4rem;
		color: var(--color-text);
		background: var(--color-bg-card-start);
		border: 1px solid var(--color-border-card);
		border-radius: 3px;
		@include card-shine;

		&::placeholder {
			color: var(--color-text-muted);
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
		grid-template-columns: 1fr;
		gap: 1rem;

		&.two-col {
			grid-template-columns: 1fr 1fr;

			.cell.wide {
				grid-column: span 2;
			}
		}
	}

	.cell {
		display: grid; // so the card stretches
		min-width: 0; // long titles ellipsize instead of widening the column
	}
</style>
