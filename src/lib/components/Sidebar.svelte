<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import { MAJOR_SUBJECTS, SUBJECTS } from '$lib/data';

	let { plan }: { plan: Plan } = $props();

	// changing the programme refills the grid with its ideal course order
	const reseed = () => plan.seedRecommended();
</script>

<header class="col-header">
	<h2><span class="brand-small">kreabot's</span> tracey</h2>
	<button class="reset" title="reset everything back to the recommended plan" onclick={() => plan.reset()}>
		reset
	</button>
</header>

<div class="controls">
	<label class="row">
		<span class="row-label">4yup</span>
		<input type="checkbox" class="tick" bind:checked={plan.fourYear} onchange={reseed} />
	</label>

	<label class="row">
		<span class="row-label">plan</span>
		<select bind:value={plan.structure} onchange={reseed}>
			<option value="single-major">single major</option>
			<option value="double-major">double major</option>
			<option value="major-minor">major + minor</option>
			<option value="major-minor-conc">major + minor + conc.</option>
		</select>
	</label>

	<label class="row">
		<span class="row-label">major</span>
		<select bind:value={plan.picks.major1} onchange={reseed}>
			{#each MAJOR_SUBJECTS as s (s.id)}
				<option value={s.id}>{s.label}</option>
			{/each}
		</select>
	</label>

	{#if plan.structure === 'double-major'}
		<label class="row">
			<span class="row-label">major</span>
			<select bind:value={plan.picks.major2} onchange={reseed}>
				{#each MAJOR_SUBJECTS as s (s.id)}
					<option value={s.id}>{s.label}</option>
				{/each}
			</select>
		</label>
	{:else if plan.structure !== 'single-major'}
		<label class="row">
			<span class="row-label">minor</span>
			<select bind:value={plan.picks.minor} onchange={reseed}>
				{#each SUBJECTS as s (s.id)}
					<option value={s.id}>{s.label}</option>
				{/each}
			</select>
		</label>
		{#if plan.structure === 'major-minor-conc'}
			<label class="row">
				<span class="row-label">conc.</span>
				<select bind:value={plan.picks.conc} onchange={reseed}>
					{#each SUBJECTS as s (s.id)}
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

		// small reset tucked in the header corner
		.reset {
			margin-left: auto;
			padding: 0.3rem 0.8rem;
			font-size: 1.15rem;
			font-weight: 600;
			color: var(--color-text-muted);
			background: var(--color-bg-light);
			border: 1px solid var(--color-border-card);
			border-radius: 3px;
			cursor: pointer;

			&:hover {
				color: var(--color-text);
				background: var(--color-hover-medium);
			}
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
