<script lang="ts">
	import PixelIcon from '../PixelIcon.svelte';
	import type { Plan } from '$lib/plan.svelte';
	import { MAJOR_SUBJECTS } from '$lib/data';
	import Settings from '$lib/components/Settings.svelte';

	let { plan, ontour }: { plan: Plan; ontour: () => void } = $props();

	let showSettings = $state(false);

	// changing the programme re-lays-out a plan the student has never edited,
	// and leaves an edited one alone — see Plan.programmeChanged

	// a subject already claimed by an earlier role disappears from the later
	// roles' lists (plan.minorOpts …); changing an earlier role onto a later
	// one's subject bumps the later pick instead (ensureDistinctPicks)
	const distinct = () => {
		plan.programmeChanged();
	};
</script>

<header class="col-header">
	<h2>kcal</h2>
	<button class="gear" data-tour="settings" aria-label="settings" title="settings" onclick={() => (showSettings = true)}>
		<PixelIcon name="gear" size="1.6rem" snap />
	</button>
</header>

{#if showSettings}
	<Settings
		{plan}
		onclose={() => (showSettings = false)}
		ontour={() => {
			showSettings = false;
			ontour();
		}}
	/>
{/if}

<div class="controls" data-tour="programme">
	<label class="row" title="4-year degree — uncheck for the 3-year track">
		<span class="row-label">4-year</span>
		<input type="checkbox" class="tick" bind:checked={plan.fourYear} onchange={distinct} />
	</label>

	<label class="row">
		<span class="row-label">batch</span>
		<select bind:value={plan.batchStartYear} onchange={distinct}>
			{#each [2022, 2023, 2024, 2025, 2026] as year (year)}
				<option value={year}>{year}-{String(year + (plan.fourYear ? 4 : 3)).slice(-2)}</option>
			{/each}
		</select>
	</label>

	<label class="row">
		<span class="row-label">degree</span>
		<select bind:value={plan.structure} onchange={distinct}>
			<option value="single-major">single major</option>
			<option value="double-major">double major</option>
			<option value="major-minor">major + minor</option>
			<option value="major-conc">major + conc.</option>
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
				{#each plan.major2Opts as s (s.id)}
					<option value={s.id}>{s.label}</option>
				{/each}
			</select>
		</label>
	{/if}

	{#if plan.structure === 'major-minor' || plan.structure === 'major-minor-conc'}
		<label class="row">
			<span class="row-label">minor</span>
			<select bind:value={plan.picks.minor} onchange={distinct}>
				{#each plan.minorOpts as s (s.id)}
					<option value={s.id}>{s.label}</option>
				{/each}
			</select>
		</label>
	{/if}

	{#if plan.structure === 'major-conc' || plan.structure === 'major-minor-conc'}
		<label class="row">
			<span class="row-label" title="concentration">conc.</span>
			<select bind:value={plan.picks.conc} onchange={distinct}>
				{#each plan.concOpts as s (s.id)}
					<option value={s.id}>{s.label}</option>
				{/each}
			</select>
		</label>
	{/if}
</div>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.col-header {
		@include card-header;
		justify-content: space-between;
		border-bottom: 1px solid var(--color-border);

		h2 {
			font-size: 1.8rem;
			font-weight: 600;
			color: var(--color-text);
		}
	}

	// the app's one settings entry point, in the corner it's always in
	.gear {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 2.8rem;
		height: 2.8rem;
		padding: 0;
		color: var(--color-text-muted);
		background: none;
		border: none;
		cursor: pointer;
		transition: color 0.15s ease;

		&:hover {
			color: var(--color-text);
		}
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.6rem 1.6rem;
		border-bottom: 1px solid var(--color-border-light);
	}

	.row {
		display: grid;
		grid-template-columns: 5.4rem 1fr;
		align-items: center;
		gap: 1rem;
		font-size: var(--text-body);
		cursor: pointer;
	}

	.row-label {
		color: var(--color-text);
	}

	// plain flat dropdowns — no gloss, no shadow
	select {
		width: 100%;
		min-width: 0; // long option labels must not push past the panel edge
		font-size: var(--text-body);
		color: var(--color-text);
		padding: 0.45rem 0.6rem;
		background-color: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: var(--rail-radius, 4px);
		box-shadow: var(--shadow-well);
		cursor: pointer;
	}

	.tick {
		@include tick(1.6rem);
	}
</style>
