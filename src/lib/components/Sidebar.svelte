<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import { SUBJECTS } from '$lib/data';

	let { plan }: { plan: Plan } = $props();
</script>

<div class="brand">
	<span class="brand-small">kreabot's</span>
	<span class="brand-big">tracey</span>
</div>

<div class="controls">
	<label class="row">
		<span class="row-label">4yup</span>
		<input type="checkbox" class="tick" bind:checked={plan.fourYear} />
	</label>

	<label class="row">
		<span class="row-label">plan</span>
		<select bind:value={plan.structure}>
			<option value="double-major">double major</option>
			<option value="major-minor">major + minor</option>
			<option value="major-minor-conc">major + minor + conc.</option>
		</select>
	</label>

	<label class="row">
		<span class="row-label">major</span>
		<select bind:value={plan.picks.major1}>
			{#each SUBJECTS as s (s.id)}
				<option value={s.id}>{s.label}</option>
			{/each}
		</select>
	</label>

	{#if plan.structure === 'double-major'}
		<label class="row">
			<span class="row-label">major</span>
			<select bind:value={plan.picks.major2}>
				{#each SUBJECTS as s (s.id)}
					<option value={s.id}>{s.label}</option>
				{/each}
			</select>
		</label>
	{:else}
		<label class="row">
			<span class="row-label">minor</span>
			<select bind:value={plan.picks.minor}>
				{#each SUBJECTS as s (s.id)}
					<option value={s.id}>{s.label}</option>
				{/each}
			</select>
		</label>
		{#if plan.structure === 'major-minor-conc'}
			<label class="row">
				<span class="row-label">conc.</span>
				<select bind:value={plan.picks.conc}>
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

	.brand {
		display: flex;
		flex-direction: column;
		padding: 1.6rem 2rem 1.8rem;
		background: linear-gradient(to bottom, var(--color-brand-start), var(--color-brand-end));
		color: var(--color-brand-text);
		@include card-shine;

		.brand-small {
			font-size: 1.4rem;
			font-weight: 700;
		}

		.brand-big {
			font-size: 3rem;
			font-weight: 400;
			line-height: 1.1;
		}
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.6rem 1.4rem;
		border-bottom: 1px solid var(--color-border-divider);
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
