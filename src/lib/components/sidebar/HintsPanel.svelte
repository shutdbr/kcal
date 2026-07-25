<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import { byCode, hasCode } from '$lib/data';

	let { plan }: { plan: Plan } = $props();

	let overallLeft = $derived(Math.max(0, plan.degreeTotal - plan.totalPlacedCredits));

	// worst first — a broken prerequisite matters more than "2 audits
	// remaining", and the panel is long enough that the reds were scrolling
	// off the bottom under a stack of yellows
	const RANK = { warn: 0, caution: 1, info: 2, good: 3 };
	let sorted = $derived([...plan.hints].sort((a, b) => RANK[a.kind] - RANK[b.kind]));
	let problems = $derived(plan.hints.filter((h) => h.kind === 'warn' || h.kind === 'caution').length);

	// a hint that names a real course can jump to it in the details panel
	const targetOf = (codes: string[]) => codes.find(hasCode);
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
									<li
										class:missing={!course.code}
										class:done={course.code && plan.placedCodes.has(course.code)}
									>
										{course.title}
									</li>
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
	<h3>
		hints
		{#if problems}
			<span class="count" title="{problems} thing{problems === 1 ? '' : 's'} to fix">{problems}</span>
		{/if}
	</h3>

	<div class="chips">
		{#each sorted as hint, i (hint.text + i)}
			{@const target = targetOf(hint.codes)}
			{#if target}
				<button
					class="chip {hint.kind}"
					title="show {target}"
					onclick={() => (plan.selected = byCode(target))}
				>
					{hint.text}
				</button>
			{:else}
				<div class="chip {hint.kind}">{hint.text}</div>
			{/if}
		{/each}
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.section {
		border-bottom: 1px solid var(--color-border-light);

		h3 {
			@include section-label;
			display: flex;
			align-items: center;
			gap: 0.6rem;
			padding: 1.2rem 1.6rem 0;
		}

		// how many of the chips below are actually something to fix
		.count {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-width: 1.8rem;
			height: 1.8rem;
			padding: 0 0.5rem;
			font-size: 1.1rem;
			font-weight: 700;
			color: var(--color-on-accent);
			background-color: var(--color-danger);
			border: 1px solid var(--color-danger-deep);
			border-radius: 999px;
			@include glossy-accent;
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
		padding-left: 0;
		font-size: 1.2rem;
		line-height: 1.5;
		color: var(--color-text);

		li {
			position: relative;
			padding-left: 1.6rem;
			list-style: none;

			// own bullet, so a course already on the grid can swap it for a
			// tick — the pool then reads "3 chosen, 2 to go" at a glance
			&::before {
				content: '•';
				position: absolute;
				left: 0.3rem;
				color: var(--color-text-muted);
			}
		}

		li.done {
			&::before {
				content: '✓';
				left: 0.1rem;
				font-size: 1.1rem;
				font-weight: 700;
				color: var(--color-hint-good-deep);
			}
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

	// each chip is outlined in a darker shade of its own fill — a yellow
	// caution gets a dark-yellow edge, not a shared grey one
	.chip {
		display: block;
		width: 100%;
		padding: 0.8rem 1rem;
		font-size: 1.2rem;
		line-height: 1.4;
		text-align: left;
		color: var(--color-text);
		border: 1px solid var(--tone-deep);
		border-radius: 4px;
		background: var(--tone);
		@include card-shine;

		// the ones naming a course are buttons that jump to it
		&:is(button) {
			cursor: pointer;
			transition:
				transform 0.15s ease,
				box-shadow 0.15s ease;

			&:hover {
				transform: translateY(-1px);
				@include card-shine-hover;
			}
		}

		&.warn {
			--tone: var(--color-hint-warn);
			--tone-deep: var(--color-hint-warn-deep);
		}

		&.caution {
			--tone: var(--color-hint-caution);
			--tone-deep: var(--color-hint-caution-deep);
		}

		&.info {
			--tone: var(--color-hint-info);
			--tone-deep: var(--color-hint-info-deep);
		}

		&.good {
			--tone: var(--color-hint-good);
			--tone-deep: var(--color-hint-good-deep);
		}
	}
</style>
