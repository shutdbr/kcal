<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';

	let { plan }: { plan: Plan } = $props();

	let overallLeft = $derived(Math.max(0, plan.degreeTotal - plan.totalPlacedCredits));
</script>

<div class="section">
	<h3>information</h3>

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
</div>

{#if plan.choices.length}
	<div class="section">
		<h3>choices</h3>

		<div class="choices">
			{#each plan.choices as prog (prog.role + prog.label)}
				{#each prog.groups as group, gi (group.rule + gi)}
					<div class="choice">
						<div class="choice-rule">
							choose {group.pick}{plan.choices.length > 1 ? ` · ${prog.label}` : ''}
						</div>
						{#if group.courses.length}
							<ul class="choice-list">
								{#each group.courses as course (course.title)}
									<li class:missing={!course.code}>{course.title}</li>
								{/each}
							</ul>
						{:else}
							<div class="choice-note">{group.rule}</div>
						{/if}
					</div>
				{/each}
			{/each}
		</div>
	</div>
{/if}

<div class="section">
	<h3>hints</h3>

	<div class="chips">
		{#each plan.hints as hint, i (hint.text + i)}
			<div class="chip {hint.kind}">{hint.text}</div>
		{/each}
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.section {
		border-bottom: 1px solid var(--color-border-light);

		h3 {
			@include section-label;
			padding: 1.2rem 1.6rem 0;
		}
	}

	.stats {
		padding: 1rem 1.6rem 1.4rem;
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

	.choices {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.2rem 1.6rem;
	}

	.choice-rule {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-text);
		text-transform: capitalize;
	}

	.choice-list {
		margin: 0.4rem 0 0;
		padding-left: 1.6rem;
		font-size: 1.2rem;
		line-height: 1.5;
		color: var(--color-text);

		li {
			list-style: disc;
		}

		// a course the university lists but no term has taught yet — dimmed,
		// so it reads as "offered on paper, not on the plan"
		li.missing {
			color: var(--color-text-muted);
			font-style: italic;
		}
	}

	.choice-note {
		font-size: 1.2rem;
		line-height: 1.4;
		color: var(--color-text-muted);
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

		&.caution {
			background: var(--color-hint-caution);
		}

		&.info {
			background: var(--color-hint-info);
		}

		&.good {
			background: var(--color-hint-good);
		}
	}
</style>
