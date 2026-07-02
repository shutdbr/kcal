<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';

	let { plan }: { plan: Plan } = $props();

	let overallLeft = $derived(Math.max(0, plan.degreeTotal - plan.totalPlacedCredits));
</script>

<div class="hints-bar">HINTS</div>

<div class="stats">
	<div>total credits: {plan.degreeTotal}</div>
	<div>credits left: {overallLeft}</div>

	{#each plan.stats as s (s.role + s.subject)}
		<div class="prog-name">{s.label}</div>
		{#if s.role === 'major'}
			<div>total credits: {s.totalCredits}</div>
			<div>credits left: {s.creditsLeft}</div>
			<div>required : {s.requiredDone}/{s.requiredNeeded}</div>
		{:else}
			<div class="muted">{s.role}</div>
			<div>requirements: {s.totalCredits}</div>
			<div>done: {s.totalCredits - s.creditsLeft}</div>
		{/if}
	{/each}
</div>

<div class="divider"></div>

<div class="chips">
	{#each plan.hints as hint, i (hint.text + i)}
		<div class="chip {hint.kind}">{hint.text}</div>
	{/each}
</div>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.hints-bar {
		padding: 0.8rem 1.6rem;
		background: var(--color-hints-bar);
		color: var(--color-hints-bar-text);
		font-size: 1.4rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		@include card-shine;
	}

	.stats {
		padding: 1.4rem 1.6rem;
		font-size: 1.35rem;
		line-height: 1.65;

		.prog-name {
			font-weight: 700;
			margin-top: 0.6rem;
		}

		.muted {
			color: var(--color-text-muted);
			font-size: 1.2rem;
		}
	}

	.divider {
		margin: 0 1.6rem;
		border-top: 2px dashed var(--color-border-divider);
	}

	.chips {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		padding: 1.2rem;
	}

	.chip {
		padding: 0.8rem 1rem;
		font-size: 1.2rem;
		line-height: 1.4;
		border-radius: 3px;
		@include card-shine;

		&.warn {
			background: var(--color-hint-warn);
		}

		&.info {
			background: var(--color-hint-info);
		}

		&.good {
			background: var(--color-hint-good);
		}
	}
</style>
