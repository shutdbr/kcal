<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import { subjectById } from '$lib/data';
	import CatalogueCard from './CatalogueCard.svelte';

	let { plan }: { plan: Plan } = $props();

	// filter chips: one per distinct selected subject
	let filterSubjects = $derived([...new Set(plan.selectedSubjects)]);

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
	<h2>catalogue</h2>

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
			{@const type = plan.courseType(course.code)}
			<div class="cell" class:wide={plan.zoom !== null && type === 'required'}>
				<CatalogueCard
					{course}
					{type}
					placed={plan.placedCodes.has(course.code)}
					detailed={plan.zoom !== null}
				/>
			</div>
		{/each}
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.catalogue {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow-y: auto;
		padding: 1.6rem 1.4rem 2.4rem;
		background: linear-gradient(to bottom, var(--color-bg-warm-start), var(--color-bg-warm-end));
		border-right: 1px solid var(--color-border-warm);
	}

	h2 {
		font-size: 2.6rem;
		font-weight: 400;
		margin-bottom: 1.2rem;
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
	}
</style>
