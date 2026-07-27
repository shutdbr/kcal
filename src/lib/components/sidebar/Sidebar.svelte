<script lang="ts">
	import { browser } from '$app/environment';
	import type { Plan } from '$lib/plan.svelte';
	import { MAJOR_SUBJECTS, OPEN_MINOR, PROGRAMME_SUBJECTS } from '$lib/data';
	import Settings from '$lib/components/Settings.svelte';

	let { plan }: { plan: Plan } = $props();

	let showSettings = $state(false);

	// first visit lands on a seeded EXAMPLE plan (mathematics) — nudge the
	// student to make it theirs by picking a major. Remembered once dismissed
	// or once they change a pick.
	const HINT_KEY = 'tracey-major-hint-seen';
	let showHint = $state(browser && !localStorage.getItem(HINT_KEY));
	function dismissHint() {
		showHint = false;
		if (browser) localStorage.setItem(HINT_KEY, '1');
	}

	// switching the programme does NOT touch the grid — everything the
	// student placed stays put and just recolours for the new requirements

	// a subject already claimed by an earlier role disappears from the later
	// roles' lists (cs major → no cs minor); changing an earlier role onto a
	// later one's subject bumps the later pick instead (ensureDistinctPicks)
	const distinct = () => {
		plan.programmeChanged();
		dismissHint();
	};
	let major2Opts = $derived(MAJOR_SUBJECTS.filter((s) => s.id !== plan.picks.major1));
	// the open minor (free courses, no declared subject) leads the minor list
	let minorOpts = $derived([OPEN_MINOR, ...PROGRAMME_SUBJECTS.filter((s) => s.id !== plan.picks.major1)]);
	// the minor only blocks a concentration subject when a minor is in play
	let concOpts = $derived(
		PROGRAMME_SUBJECTS.filter(
			(s) =>
				s.id !== plan.picks.major1 &&
				(plan.structure !== 'major-minor-conc' || s.id !== plan.picks.minor)
		)
	);
</script>

<header class="col-header">
	<h2><span class="brand-small">kreabot's</span> tracey</h2>
	<button class="gear" aria-label="settings" title="settings" onclick={() => (showSettings = true)}>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
			<circle cx="12" cy="12" r="3.2" />
			<path
				d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.1 4.7a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.03z"
			/>
		</svg>
	</button>
</header>

{#if showSettings}
	<Settings {plan} onclose={() => (showSettings = false)} />
{/if}

{#if showHint}
	<div class="first-hint">
		<button class="hint-close" onclick={dismissHint} aria-label="dismiss">×</button>
		<strong>👋 start here</strong>
		<p>this is an example plan. pick your <b>major</b> below to make it your own.</p>
	</div>
{/if}

<div class="controls">
	<!-- whose plan is on the grid — a plain radio pair reads clearer than a
	     segmented switch. Disabled (not hidden) in grade view, since grades
	     apply to your own plan only. -->
	<div class="plan-view" class:disabled={plan.gradeMode} role="radiogroup" aria-label="which plan is shown">
		<label class="pv-opt">
			<input
				type="radio"
				name="plan-view"
				checked={!plan.referenceView}
				disabled={plan.gradeMode}
				onchange={() => plan.referenceView && plan.toggleReferenceView()}
			/>
			<span>your plan</span>
		</label>
		<label class="pv-opt">
			<input
				type="radio"
				name="plan-view"
				checked={plan.referenceView}
				disabled={plan.gradeMode}
				onchange={() => !plan.referenceView && plan.toggleReferenceView()}
			/>
			<span>reference plan</span>
		</label>
	</div>

	<label class="row" title="4-year degree — uncheck for the 3-year track">
		<span class="row-label">4-year</span>
		<input type="checkbox" class="tick" bind:checked={plan.fourYear} onchange={distinct} />
	</label>

	<label class="row">
		<span class="row-label">plan</span>
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
				{#each major2Opts as s (s.id)}
					<option value={s.id}>{s.label}</option>
				{/each}
			</select>
		</label>
	{/if}

	{#if plan.structure === 'major-minor' || plan.structure === 'major-minor-conc'}
		<label class="row">
			<span class="row-label">minor</span>
			<select bind:value={plan.picks.minor} onchange={distinct}>
				{#each minorOpts as s (s.id)}
					<option value={s.id}>{s.label}</option>
				{/each}
			</select>
		</label>
	{/if}

	{#if plan.structure === 'major-conc' || plan.structure === 'major-minor-conc'}
		<label class="row">
			<span class="row-label">conc.</span>
			<select bind:value={plan.picks.conc} onchange={distinct}>
				{#each concOpts as s (s.id)}
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

		.brand-small {
			font-size: 1.2rem;
			font-weight: 400;
			color: var(--color-text-muted);
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
		border-radius: 5px;
		cursor: pointer;
		transition:
			color 0.15s ease,
			background 0.15s ease,
			transform 0.3s ease;

		svg {
			width: 1.8rem;
			height: 1.8rem;
		}

		&:hover {
			color: var(--color-text);
			transform: rotate(45deg);
		}
	}

	// first-visit nudge: the seeded plan is an example — point at the picker
	.first-hint {
		position: relative;
		margin: 1.4rem 1.4rem 0;
		padding: 1rem 2rem 1rem 1.2rem;
		background: color-mix(in srgb, var(--color-accent) 12%, var(--color-bg-light));
		border: 1px solid var(--color-control);
		border-radius: 6px;

		strong {
			display: block;
			font-size: 1.3rem;
			color: var(--color-text);
		}

		p {
			margin-top: 0.3rem;
			font-size: 1.2rem;
			line-height: 1.45;
			color: var(--color-text-muted);
		}
	}

	.hint-close {
		position: absolute;
		top: 0.2rem;
		right: 0.4rem;
		padding: 0.2rem 0.5rem;
		font-size: 1.6rem;
		line-height: 1;
		color: var(--color-text-muted);
		background: none;
		border: none;
		cursor: pointer;

		&:hover {
			color: var(--color-text);
		}
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.6rem 1.4rem;
		border-bottom: 1px solid var(--color-border-light);
	}

	.plan-view {
		display: flex;
		gap: 1.6rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--color-border-divider);
	}

	.pv-opt {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.35rem;
		color: var(--color-text);
		cursor: pointer;

		input {
			accent-color: var(--color-accent);
			cursor: pointer;
		}
	}

	// grade view locks the choice to your own plan — clearly greyed, not-allowed
	.plan-view.disabled {
		opacity: 0.35;

		.pv-opt,
		.pv-opt input {
			cursor: not-allowed;
		}
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

	// plain flat dropdowns — no gloss, no shadow
	select {
		width: 100%;
		min-width: 0; // long option labels must not push past the panel edge
		font-size: 1.3rem;
		color: var(--color-text);
		padding: 0.45rem 0.6rem;
		background-color: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 5px;
		cursor: pointer;
	}

	.tick {
		@include tick(1.6rem);
	}
</style>
