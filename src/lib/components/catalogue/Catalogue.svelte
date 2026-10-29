<script lang="ts">
	import PixelIcon from '../PixelIcon.svelte';
	import { tick } from 'svelte';
	import type { Plan } from '$lib/plan.svelte';
	import { SUBJECTS, subjectById } from '$lib/data';
	import CatalogueCard from './CatalogueCard.svelte';

	let { plan, mobile = false }: { plan: Plan; mobile?: boolean } = $props();

	let catalogueEl: HTMLDivElement;
	$effect(() => {
		const request = plan.catalogueReveal;
		if (!request || mobile) return;
		let cancelled = false;
		void tick().then(() => {
			if (cancelled) return;
			const cell = Array.from(catalogueEl.querySelectorAll<HTMLElement>('[data-course]')).find(
				(el) => el.dataset.course === request.code
			);
			const card = cell?.querySelector<HTMLElement>('[data-course-card]');
			card?.focus({ preventScroll: true });
			cell?.scrollIntoView({
				block: 'center',
				behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
			});
		});
		return () => {
			cancelled = true;
		};
	});

	// filter chips: one per distinct selected subject, plus the foundation
	// core — always on offer, whatever the programmes are. The open minor
	// has no courses of its own, so it gets no chip.
	let filterSubjects = $derived([
		...new Set([...plan.selectedSubjects.filter((s) => s !== 'open'), 'core'])
	]);

	// which subject's code a cross-listed course should be shown under: the
	// active filter if it pins one down, else the single programme subject it
	// belongs to — otherwise leave it on its canonical code
	function contextFor(subjects: string[]): string | undefined {
		if (plan.catalogueSubject && subjects.includes(plan.catalogueSubject))
			return plan.catalogueSubject;
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
	bind:this={catalogueEl}
	data-tour="catalogue"
	role="list"
	ondragover={(e) => e.preventDefault()}
	ondrop={drop}
>
	<header class="col-header">
		<div>
			<h2>catalogue</h2>
			<p class="mobile-intro">find your next course</p>
		</div>
		<span class="result-count" role="status"
			>{plan.catalogue.length} course{plan.catalogue.length === 1 ? '' : 's'}</span
		>
	</header>

	<!-- search + filters stay put while the cards scroll underneath -->
	<div class="controls">
		<div class="search-box">
			<span class="search-icon"><PixelIcon name="search" /></span>
			<input
				class="search"
				type="search"
				aria-label="search courses or lecturers"
				placeholder="search course or prof"
				bind:value={plan.search}
			/>
			{#if plan.search}
				<button class="clear-search" aria-label="clear search" onclick={() => (plan.search = '')}>
					×
				</button>
			{/if}
		</div>

		<label class="department-filter">
			<span>browse</span>
			<select aria-label="browse department" bind:value={plan.catalogueSubject}>
				<option value=""
					>{plan.filters.length ? 'your programme filters' : 'all departments'}</option
				>
				{#each SUBJECTS.filter((s) => s.id !== 'open') as subject (subject.id)}
					<option value={subject.id}>{subject.label}</option>
				{/each}
			</select>
		</label>
		<div class="filters">
			{#each filterSubjects as id (id)}
				<label class="filter" class:core={id === 'core'}>
					<input
						type="checkbox"
						class="tick"
						checked={!plan.catalogueSubject && plan.filters.includes(id)}
						onchange={() => {
							plan.catalogueSubject = '';
							plan.toggleFilter(id);
						}}
					/>
					<span>{subjectById(id).short}</span>
				</label>
			{/each}
		</div>
	</div>

	{#if plan.zoom}
		<div class="reveal-note">
			<span>offered in trimester {plan.zoom.trim}</span><button onclick={() => (plan.zoom = null)}
				>show all terms ×</button
			>
		</div>
	{/if}
	{#if plan.catalogueReveal}
		<div class="reveal-note" role="status">
			<span>showing {plan.catalogueReveal.code}</span>
			<button onclick={() => (plan.catalogueReveal = null)} aria-label="return to catalogue filters"
				>done ×</button
			>
		</div>
	{/if}
	<div class="scroll">
		<div class="cards">
			{#each plan.catalogue as course (course.code)}
				<!-- card width IS the credit weight: 4cr fills the row, 2cr ½,
				     1cr ¼ — so they pack into rows of 4 (2+2, 2+1+1, …). A 3cr
				     course (the KCCS foundation set) also takes the full row:
				     span-3 cards would strand a dead quarter-column beside
				     every one of them, since nothing 1cr sits nearby to fill it -->
				<div
					class="cell"
					class:revealed={plan.catalogueReveal?.code === course.code}
					data-course={course.code}
					style="grid-column: span {(course.pendingCredits && course.credits === 0) ||
					course.credits >= 3
						? 4
						: Math.max(1, course.credits)};"
				>
					<CatalogueCard
						{plan}
						{mobile}
						{course}
						type={plan.courseType(course.code)}
						placed={plan.placedCodes.has(course.code)}
						contextSubject={contextFor(course.subjects)}
					/>
				</div>
			{:else}
				<div class="empty-results">
					<PixelIcon name="search" size="2.4rem" />
					<h3>no courses found</h3>
					<p>Try another course name, code or lecturer, or clear your filters.</p>
					<button
						onclick={() => {
							plan.search = '';
							plan.filters = [];
							plan.catalogueSubject = '';
							plan.zoom = null;
						}}>clear search & filters</button
					>
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
		padding: 1rem 1.4rem 2.4rem;
	}

	.search-box {
		position: relative;
		display: flex;
	}

	// a text field is something you type INTO — recessed, not raised like the
	// buttons around it
	.search-icon {
		position: absolute;
		left: 1rem;
		top: 50%;
		transform: translateY(-50%);
		width: 1.5rem;
		height: 1.5rem;
		color: #969196;
		pointer-events: none;
	}
	// the iOS 6 search capsule: set into the panel, shaded along its top
	// inside edge, with a lit lip under it
	.search {
		width: 100%;
		padding: 0.75rem 3rem 0.75rem 3.2rem; // right padding reserves the × corner
		font-size: var(--text-body);
		color: var(--color-text);
		background: var(--color-bg-card-start);
		border: 1px solid color-mix(in srgb, var(--color-border) 45%, var(--color-border-card));
		border-radius: 999px;
		box-shadow:
			inset 0 1px 3px rgba(98, 58, 82, 0.25),
			0 1px 0 rgba(255, 255, 255, 0.8);
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease;

		&:focus {
			border-color: var(--color-accent);
		}

		&::placeholder {
			color: var(--color-text-muted);
		}

		// the button covers clearing — hide any native duplicate ×
		&::-webkit-search-cancel-button {
			display: none;
		}
	}

	// the round grey clear button iOS puts in its search field — springs in
	// when there's something to clear
	.clear-search {
		position: absolute;
		top: 50%;
		right: 0.8rem;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.7rem;
		height: 1.7rem;
		padding: 0 0 0.1rem;
		font-size: 1.4rem;
		font-weight: 700;
		line-height: 1;
		color: var(--color-bg-light);
		background: color-mix(in srgb, var(--color-text-muted) 75%, transparent);
		border: none;
		border-radius: 50%;
		cursor: pointer;
		translate: 0 -50%;
		animation: clear-in 0.3s var(--spring) both;
		transition:
			background-color 0.15s ease,
			scale 0.12s ease;

		&:hover {
			background: var(--color-text-muted);
		}

		&:active {
			scale: 0.88;
		}
	}

	@keyframes clear-in {
		from {
			scale: 0.3;
			opacity: 0;
		}
	}

	// a rule of round plum dots under the filters closes off the search area
	// from the cards scrolling below it — drawn, not a dotted border, so the
	// dots come out round and evenly spaced
	.filters {
		display: flex;
		gap: 1.2rem;
		flex-wrap: wrap;
		padding: 1.4rem 0.4rem 1.6rem;
		background: radial-gradient(
				circle,
				color-mix(in srgb, var(--color-accent) 55%, transparent) 1.1px,
				transparent 1.6px
			)
			left bottom / 7px 4px repeat-x;
	}

	.filter {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--text-body);
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
		@include tick(1.4rem);
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(4, 1fr); // one column per credit
		grid-auto-flow: row dense; // a later small card backfills a half-empty row
		gap: 1rem;
	}

	.reveal-note {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.6rem 1.6rem;
		font-size: var(--text-body);
		color: var(--color-text-muted);
		button {
			border: 0;
			background: none;
			color: var(--color-accent);
			cursor: pointer;
			padding: 0.4rem;
		}
	}
	.revealed {
		border-radius: 6px;
		outline: 2px solid var(--color-accent);
		outline-offset: 3px;
	}
	.cell {
		display: grid; // so the card stretches
		min-width: 0; // long titles ellipsize instead of widening the column
	}
	.col-header {
		justify-content: space-between;
		gap: 1rem;
	}
	.mobile-intro {
		display: none;
	}
	.result-count {
		font-size: 1.2rem;
		color: var(--color-text-muted);
		white-space: nowrap;
	}
	.department-filter {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin-top: 1.2rem;
		font-size: var(--text-body);
		color: var(--color-text-muted);
	}
	.department-filter select {
		min-width: 0;
		width: 100%;
		padding: 0.6rem;
		font: inherit;
		color: var(--color-text);
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 6px;
	}
	.empty-results {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		flex-direction: column;
		gap: 1.2rem;
		padding: 3.2rem 1.2rem;
		text-align: center;
		color: var(--color-text-muted);
		font-size: var(--text-body);
		line-height: 1.6;
	}
	.empty-results h3 {
		color: var(--color-text);
	}
	.empty-results button {
		font: inherit;
		color: var(--color-accent);
		padding: 0.8rem 1.2rem;
		border: 1px solid var(--color-border-card);
		border-radius: 6px;
		background: var(--color-bg-light);
		cursor: pointer;
	}
	@include mobile {
		.catalogue {
			border: 0;
		}
		.col-header {
			padding: 1.6rem 1.8rem 0;
			background: transparent;
			border: 0;
			box-shadow: none;
		}
		.col-header h2 {
			font-size: 2.2rem;
		}
		.mobile-intro {
			display: block;
			color: var(--color-text-muted);
			font-size: 1.3rem;
			margin-top: 0.4rem;
		}
		.controls {
			padding: 1.4rem 1.8rem 0;
		}
		.search {
			padding-right: 4.8rem;
			min-height: 4.8rem;
		}
		.clear-search {
			width: 4.4rem;
			right: 0.3rem;
			background: transparent;
			color: var(--color-text-muted);
			font-size: 2.4rem;
		}
		.filters {
			padding-top: 0.6rem;
			gap: 0.5rem 1.4rem;
		}
		.filter {
			min-height: 4.4rem;
		}
		.scroll {
			flex: 1;
			padding: 1rem 1.8rem 2rem;
			overscroll-behavior: contain;
		}
		.cards {
			grid-template-columns: minmax(0, 1fr);
			gap: 1.2rem;
		}
		.cell {
			grid-column: 1 / -1 !important;
		}
	}
	@include mobile {
		@container catalogue (min-width: 600px) {
			.cards { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
			.cell { grid-column: auto !important; }
		}
		@container catalogue (min-width: 1000px) {
			.cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
		}
	}
</style>
