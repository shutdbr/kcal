<script lang="ts">
	// ─────────────────────────────────────────────
	// The recommended path, whole.
	//
	// It used to be a second plan you switched the board to, which meant modes:
	// two grids that looked identical, and no way to tell which one you were
	// editing. It isn't a plan — it is a DOCUMENT, the department's suggested
	// order — so it lives where the app's other documents live, in a panel you
	// open and close (see CreditRules). Nothing to switch back from, nothing
	// that can overwrite your work, and it shows your plan against it: each
	// course is ticked if you already have it, dashed if you don't.
	// ─────────────────────────────────────────────
	import type { Plan } from '$lib/plan.svelte';
	import { byCode, subjectById } from '$lib/data';
	import type { TrimNum } from '$lib/types';
	import Modal from '../Modal.svelte';

	let { plan, onclose }: { plan: Plan; onclose: () => void } = $props();

	const at = (year: number, trim: TrimNum) => plan.recommended[`${year}-${trim}`] ?? [];
	let degree = $derived(
		plan.programmes.map((p) => `${subjectById(p.subject).label} ${p.role}`).join(' + ') +
			` · ${plan.fourYear ? 'four' : 'three'}-year`
	);
	let total = $derived(Object.values(plan.recommended).flat().length);

	// replacing the board throws away real work, so it asks twice — the same
	// guard "start over" uses, and it forgets it was asking if you walk away
	let confirming = $state(false);
	let timer: ReturnType<typeof setTimeout>;
	function useInstead() {
		if (!confirming) {
			confirming = true;
			timer = setTimeout(() => (confirming = false), 4000);
			return;
		}
		clearTimeout(timer);
		confirming = false;
		plan.useRecommended();
		onclose();
	}
</script>

<Modal title="suggested path" width="62rem" {onclose}>
	<p class="lead">
		{degree} — {total} courses in the order the department suggests, ticked where they're already on
		your plan.{#if plan.recommendedElectiveCredits}
			The dashed boxes are the <b>{plan.recommendedElectiveCredits} elective credits</b> the degree leaves
			you to choose for yourself.{/if}
	</p>

	<div class="path" style="--cols: {plan.trims.length}">
		<div class="corner"></div>
		{#each plan.trims as t (t)}
			<div class="head">t{t}</div>
		{/each}

		{#each plan.years as y (y)}
			<div class="yhead">y{y}</div>
			{#each plan.trims as t (t)}
				{@const codes = at(y, t)}
				<div class="cell">
					{#each codes as code (code)}
						{@const have = plan.placedCodes.has(code)}
						<button
							class="rc"
							class:have
							data-type={plan.courseType(code)}
							style:--hue={plan.hueOf(code)}
							title={have ? `${plan.courseLabel(code)} is on your plan` : `add ${plan.courseLabel(code)} to your plan`}
							onclick={() => (have ? (plan.selected = byCode(code)) : plan.acceptSuggestion(code))}
						>
							<span class="rc-mark" aria-hidden="true">{have ? '✓' : '+'}</span>
							{#if plan.showCodes}<span class="rc-code">{plan.shownCode(code)}</span>{/if}
							<span class="rc-title">{byCode(code).title}</span>
						</button>
					{/each}

					<!-- the room the degree leaves you: credits the path doesn't
					     spend on required courses, which you fill with electives
					     of your own choosing -->
					{#each { length: plan.electivesFor(y, t) } as _, i (i)}
						<span class="elective">elective</span>
					{/each}

					{#if !codes.length && !plan.electivesFor(y, t)}
						<span class="none">—</span>
					{/if}
				</div>
			{/each}
		{/each}
	</div>

	<div class="foot">
		{#if plan.suggestionCount}
			<button
				class="take"
				onclick={() => {
					plan.acceptAllSuggestions();
					onclose();
				}}
			>
				add the {plan.suggestionCount} missing to my plan
			</button>
			<p class="note">your own courses stay exactly where they are.</p>
		{:else}
			<p class="note done">✓ every course on this path is already on your plan.</p>
		{/if}

		<!-- the other way to take it: throw your plan away and start from this
		     one. The only destructive action in the app that isn't "start over",
		     so it asks twice and says plainly what goes. -->
		<button class="replace" class:confirming={confirming} onclick={useInstead}>
			{confirming ? 'yes — delete my plan and use this' : 'use this instead of my plan'}
		</button>
		{#if confirming}
			<p class="note danger">
				this deletes the {plan.placedCodes.size} courses on your board and replaces them with the path
				above.
			</p>
		{/if}
	</div>
</Modal>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.lead {
		margin-bottom: 1.4rem;
		font-size: 1.3rem;
		line-height: 1.5;
		color: var(--color-text-muted);
	}

	.path {
		display: grid;
		grid-template-columns: 2.6rem repeat(var(--cols), 1fr);
		gap: 0.5rem;
	}

	.head {
		font-size: 1.2rem;
		text-align: center;
		color: var(--color-text-muted);
	}

	.yhead {
		align-self: center;
		font-size: 1.3rem;
		text-align: center;
		color: var(--color-text-muted);
	}

	.cell {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-height: 4rem;
		padding: 0.4rem;
		background: var(--color-grid-cell);
		border-radius: 6px;
	}

	// each course wears its type colour, so the panel reads in the same
	// language as the board it describes
	.rc {
		display: grid;
		grid-template-columns: 1.2rem 1fr;
		grid-template-rows: auto auto;
		gap: 0 0.4rem;
		padding: 0.4rem 0.5rem;
		font: inherit;
		text-align: left;
		border-radius: 4px;
		cursor: pointer;
		opacity: 0.55;
		border: 1px dashed var(--color-border-card);
		background: none;
		transition: opacity 0.15s ease;

		&:hover {
			opacity: 1;
		}

		// already on the plan: solid, in its type colour, ticked
		&.have {
			opacity: 1;
			border-style: solid;
			@include course-type-fill(false);
		}

		.rc-mark {
			grid-row: span 2;
			align-self: center;
			font-size: 1.1rem;
			font-weight: 700;
			color: var(--color-text-muted);
		}

		&.have .rc-mark {
			color: var(--color-hint-good-deep);
		}

		.rc-code {
			font-size: 1.15rem;
			font-weight: 700;
			color: var(--color-text);
		}

		.rc-title {
			overflow: hidden;
			font-size: 1.05rem;
			line-height: 1.25;
			color: var(--color-text-muted);
			display: -webkit-box;
			-webkit-line-clamp: 2;
			line-clamp: 2;
			-webkit-box-orient: vertical;
		}
	}

	// not a course — the space the degree leaves open. Wears the elective
	// colour so it reads as "a course of this kind goes here", and carries no
	// action, because there is nothing to add until the student picks one.
	.elective {
		padding: 0.55rem 0.5rem;
		font-size: 1.1rem;
		font-style: italic;
		text-align: center;
		color: var(--color-text-muted);
		background: var(--color-course-elective);
		border: 1px dashed var(--color-course-elective-deep);
		border-radius: 4px;
	}

	.none {
		font-size: 1.1rem;
		color: var(--color-text-muted);
		opacity: 0.5;
	}

	.foot {
		margin-top: 1.6rem;
		padding-top: 1.4rem;
		text-align: center;
		border-top: 1px solid var(--color-border-divider);
	}

	.take {
		padding: 0.8rem 2rem;
		font: inherit;
		font-size: 1.35rem;
		font-weight: 600;
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

	.note {
		margin-top: 0.6rem;
		font-size: 1.2rem;
		color: var(--color-text-muted);

		&.done {
			margin-top: 0;
		}

		&.danger {
			font-weight: 600;
			color: var(--color-danger);
		}
	}

	// deliberately quieter than the additive action above it — the safe one is
	// the one that should be easy to hit
	.replace {
		margin-top: 1.2rem;
		padding: 0.6rem 1.4rem;
		font: inherit;
		font-size: 1.25rem;
		@include store-button($armable: true);
	}
</style>
