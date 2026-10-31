<script lang="ts">
	// The first thing a new visitor sees: two questions about their degree, so
	// the grid behind opens on their own department's suggested path instead
	// of someone else's example. The grid re-lays itself out live as they
	// answer, and every answer is also in the sidebar, nothing here is final.
	import type { Plan } from '$lib/plan.svelte';
	import { MAJOR_SUBJECTS } from '$lib/data';
	import Modal from './Modal.svelte';

	let { plan, ondone }: { plan: Plan; ondone: () => void } = $props();

	const changed = () => plan.programmeChanged();
	const BATCHES = [2022, 2023, 2024, 2025, 2026];
</script>

<Modal title="welcome to kcal" width="54rem" onclose={ondone}>
	<p class="lede">
		plan your whole Krea degree, trimester by trimester, what's required, what's left, and where each
		course fits.
	</p>

	<ol class="steps">
		<li>
			<span class="n" aria-hidden="true">1</span>
			<div class="q">
				<span class="ask">when did you start?</span>
				<div class="fields">
					<label class="field">
						<span>batch</span>
						<select bind:value={plan.batchStartYear} onchange={changed}>
							{#each BATCHES as year (year)}
								<option value={year}>{year}-{String(year + (plan.fourYear ? 4 : 3)).slice(-2)}</option>
							{/each}
						</select>
					</label>
					<label class="check">
						<input type="checkbox" class="tick" bind:checked={plan.fourYear} onchange={changed} />
						4-year degree
					</label>
				</div>
			</div>
		</li>

		<li>
			<span class="n" aria-hidden="true">2</span>
			<div class="q">
				<span class="ask">what are you studying?</span>
				<div class="fields">
					<label class="field">
						<span>degree</span>
						<select bind:value={plan.structure} onchange={changed}>
							<option value="single-major">single major</option>
							<option value="double-major">double major</option>
							<option value="major-minor">major + minor</option>
							<option value="major-conc">major + concentration</option>
							<option value="major-minor-conc">major + minor + concentration</option>
						</select>
					</label>
					<label class="field">
						<span>major</span>
						<select bind:value={plan.picks.major1} onchange={changed}>
							{#each MAJOR_SUBJECTS as s (s.id)}
								<option value={s.id}>{s.label}</option>
							{/each}
						</select>
					</label>
					{#if plan.structure === 'double-major'}
						<label class="field">
							<span>second major</span>
							<select bind:value={plan.picks.major2} onchange={changed}>
								{#each plan.major2Opts as s (s.id)}
									<option value={s.id}>{s.label}</option>
								{/each}
							</select>
						</label>
					{/if}
					{#if plan.structure === 'major-minor' || plan.structure === 'major-minor-conc'}
						<label class="field">
							<span>minor</span>
							<select bind:value={plan.picks.minor} onchange={changed}>
								{#each plan.minorOpts as s (s.id)}
									<option value={s.id}>{s.label}</option>
								{/each}
							</select>
						</label>
					{/if}
					{#if plan.structure === 'major-conc' || plan.structure === 'major-minor-conc'}
						<label class="field">
							<span>concentration</span>
							<select bind:value={plan.picks.conc} onchange={changed}>
								{#each plan.concOpts as s (s.id)}
									<option value={s.id}>{s.label}</option>
								{/each}
							</select>
						</label>
					{/if}
				</div>
			</div>
		</li>
	</ol>

	<p class="note">
		I'll lay out your department's suggested path to start from, move, add or drop anything. your plan
		saves in this browser, and you can change all of this later in the sidebar.
	</p>

	<div class="actions">
		<button class="go" onclick={ondone}>build my plan <span aria-hidden="true">→</span></button>
	</div>
</Modal>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.lede {
		font-size: 1.5rem;
		line-height: 1.5;
		color: var(--color-text);
	}

	// each question on its own dotted rule, numbered on a small lit key
	.steps {
		margin: 1.6rem 0 0;
		padding: 0;
		list-style: none;

		li {
			display: flex;
			gap: 1.2rem;
			padding: 1.4rem 0;
			border-top: 1px dotted var(--color-border-light);
		}
	}

	.n {
		flex: none;
		display: grid;
		place-items: center;
		width: 2.4rem;
		height: 2.4rem;
		font-size: 1.3rem;
		font-weight: 700;
		color: var(--color-on-accent);
		background-color: var(--color-accent);
		border: 1px solid var(--color-control-deep);
		border-radius: 50%;
		@include glossy-accent;
	}

	.q {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		min-width: 0;
		flex: 1;
	}

	.ask {
		font-size: var(--text-body);
		font-weight: 700;
		line-height: 2.4rem; // centred on its number
	}

	.fields {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 1rem 1.6rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		min-width: 16rem;

		span {
			font-size: 1.15rem;
			color: var(--color-text-muted);
		}
	}

	// flat dropdowns, the sidebar's own
	select {
		width: 100%;
		font-size: var(--text-body);
		color: var(--color-text);
		padding: 0.5rem 0.6rem;
		background-color: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 4px;
		box-shadow: var(--shadow-well);
		cursor: pointer;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding-bottom: 0.6rem;
		font-size: var(--text-body);
		cursor: pointer;
	}

	.tick {
		@include tick(1.6rem);
	}

	.note {
		padding-top: 1.4rem;
		font-size: var(--text-body);
		line-height: 1.5;
		color: var(--color-text-muted);
		border-top: 1px dotted var(--color-border-light);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 1.6rem;
	}

	.go {
		padding: 0.7rem 1.8rem;
		font: inherit;
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--color-on-accent);
		background-color: var(--color-accent);
		border: 1px solid var(--color-control-deep);
		border-radius: 6px;
		cursor: pointer;
		@include glossy-accent;

		&:hover {
			filter: brightness(1.07);
		}
	}
</style>
