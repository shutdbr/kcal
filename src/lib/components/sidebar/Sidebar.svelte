<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import { MAJOR_SUBJECTS, PROGRAMME_SUBJECTS } from '$lib/data';

	let { plan }: { plan: Plan } = $props();

	// switching the programme does NOT touch the grid — everything the
	// student placed stays put and just recolours for the new requirements

	// a subject already claimed by an earlier role disappears from the later
	// roles' lists (cs major → no cs minor); changing an earlier role onto a
	// later one's subject bumps the later pick instead (ensureDistinctPicks)
	const distinct = () => plan.ensureDistinctPicks();
	let major2Opts = $derived(MAJOR_SUBJECTS.filter((s) => s.id !== plan.picks.major1));
	let minorOpts = $derived(PROGRAMME_SUBJECTS.filter((s) => s.id !== plan.picks.major1));
	let concOpts = $derived(
		PROGRAMME_SUBJECTS.filter((s) => s.id !== plan.picks.major1 && s.id !== plan.picks.minor)
	);
</script>

<header class="col-header">
	<h2><span class="brand-small">kreabot's</span> tracey</h2>
</header>

<div class="controls">
	<label class="row">
		<span class="row-label">4yup</span>
		<input type="checkbox" class="tick" bind:checked={plan.fourYear} />
	</label>

	<label class="row">
		<span class="row-label">plan</span>
		<select bind:value={plan.structure} onchange={distinct}>
			<option value="single-major">single major</option>
			<option value="double-major">double major</option>
			<option value="major-minor">major + minor</option>
			<option value="major-minor-conc">major + minor + conc.</option>
		</select>
	</label>

	<label class="row">
		<span class="row-label">major</span>
		<select bind:value={plan.picks.major1} onchange={distinct}>
			{#each MAJOR_SUBJECTS as s (s.id)}
				<option value={s.id}>{s.label}</option>
			{/each}
		</select>
	</label>

	{#if plan.structure === 'double-major'}
		<label class="row">
			<span class="row-label">major</span>
			<select bind:value={plan.picks.major2} onchange={distinct}>
				{#each major2Opts as s (s.id)}
					<option value={s.id}>{s.label}</option>
				{/each}
			</select>
		</label>
	{:else if plan.structure !== 'single-major'}
		<label class="row">
			<span class="row-label">minor</span>
			<select bind:value={plan.picks.minor} onchange={distinct}>
				{#each minorOpts as s (s.id)}
					<option value={s.id}>{s.label}</option>
				{/each}
			</select>
		</label>
		{#if plan.structure === 'major-minor-conc'}
			<label class="row">
				<span class="row-label">conc.</span>
				<select bind:value={plan.picks.conc} onchange={distinct}>
					{#each concOpts as s (s.id)}
						<option value={s.id}>{s.label}</option>
					{/each}
				</select>
			</label>
		{/if}
	{/if}
</div>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.col-header {
		@include card-header;
		border-bottom: 1px solid var(--color-border);

		h2 {
			font-size: 1.8rem;
			font-weight: 600;
			color: var(--color-text);
		}

		.brand-small {
			font-size: 1.2rem;
			font-weight: 400;
			color: var(--color-text-muted);
		}
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.6rem 1.4rem;
		border-bottom: 1px solid var(--color-border-light);
	}

	.row {
		display: grid;
		grid-template-columns: 5.4rem 1fr;
		align-items: center;
		gap: 1rem;
		font-size: 1.4rem;
		cursor: pointer;
	}

	.row-label {
		color: var(--color-text);
	}

	select {
		width: 100%;
		min-width: 0; // long option labels must not push past the panel edge
		font-size: 1.3rem;
		color: var(--color-text);
		padding: 0.4rem 0.6rem;
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 3px;
		cursor: pointer;

		&:hover {
			background: var(--color-hover-medium);
		}
	}

	// square checkbox: grey when off, deep red when on (like the mockups)
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
</style>
