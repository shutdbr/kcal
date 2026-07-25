<script lang="ts">
	// The credit rules the ERP drop form imposes, checked against the plan
	// that's actually on the grid — so "20 credits, twice in your tenure"
	// arrives as "you've used 1 of 2" instead of as a paragraph to re-read.
	import type { Plan } from '$lib/plan.svelte';
	import {
		AUDIT_LIMIT,
		HEAVY_TRIMS_ALLOWED,
		MAX_TOTAL_3YR,
		MAX_TOTAL_4YR,
		TRIM_HARD_MAX,
		TRIM_MIN,
		TRIM_NORMAL_MAX
	} from '$lib/data';
	import Modal from '../Modal.svelte';

	let { plan, onclose }: { plan: Plan; onclose: () => void } = $props();

	// year 1 sits outside the min/max rules, same as everywhere else
	let loads = $derived(
		plan.years
			.filter((y) => y !== 1)
			.flatMap((y) => plan.trims.map((t) => ({ y, t, credits: plan.slotCredits(y, t) })))
			.filter((s) => !(s.y === 4 && !plan.fourYear && s.credits === 0))
	);

	let thin = $derived(loads.filter((s) => s.credits < TRIM_MIN).length);
	let heavy = $derived(loads.filter((s) => s.credits > TRIM_NORMAL_MAX && s.credits <= TRIM_HARD_MAX).length);
	let over = $derived(loads.filter((s) => s.credits > TRIM_HARD_MAX).length);
	let audits = $derived(plan.placed.filter((p) => plan.isAudit(p.code)).length);
	let ceiling = $derived(plan.fourYear ? MAX_TOTAL_4YR : MAX_TOTAL_3YR);
	let left = $derived(Math.max(0, plan.degreeTotal - plan.totalPlacedCredits));

	const LOADS = [12, 14, 16, 18, 20];

	type Kind = 'ok' | 'watch' | 'over' | 'note';
	let rules = $derived<{ kind: Kind; status: string; text: string }[]>([
		{
			kind: thin ? 'watch' : 'ok',
			status: thin ? `${thin} below` : 'all good',
			text: `At least ${TRIM_MIN} credits every trimester — that's what keeps you a full-time student.`
		},
		{
			kind: over ? 'over' : heavy > HEAVY_TRIMS_ALLOWED ? 'over' : heavy ? 'watch' : 'ok',
			status: over ? `${over} over ${TRIM_HARD_MAX}` : `${heavy} of ${HEAVY_TRIMS_ALLOWED} used`,
			text: `${TRIM_HARD_MAX} credits is the hard cap, and you may only register that heavy in ${HEAVY_TRIMS_ALLOWED} trimesters across your whole tenure at Krea.`
		},
		{
			kind: plan.totalPlacedCredits > ceiling ? 'over' : 'ok',
			status: `${plan.totalPlacedCredits} / ${ceiling}`,
			text: `Total credits can't pass ${ceiling} for the ${plan.fourYear ? 'four' : 'three'}-year programme. Talk to your mentor and the faculty member before adding a fifth course.`
		},
		{
			kind: audits > AUDIT_LIMIT ? 'over' : 'ok',
			status: `${audits} of ${AUDIT_LIMIT} used`,
			text: `Audits are 2- or 4-credit courses, ${AUDIT_LIMIT} across your tenure, never KCCS / 391 / 490 / 491. You need the instructor's approval email at registration, and an audit must be deleted before you can switch it to credit.`
		},
		{
			kind: 'note',
			status: 'ask first',
			text: `Registering for more than ${TRIM_NORMAL_MAX} or fewer than ${TRIM_MIN} credits needs prior approval from Dr Aahique Iqbal, forwarded to the Academic Office.`
		},
		{
			kind: 'note',
			status: 'final',
			text: 'The same course can’t be picked twice in a group, and once the drop form is submitted nothing can be changed — check it twice.'
		}
	]);
</script>

<Modal title="credits & the drop form" width="52rem" {onclose}>
	<div class="stats">
		<div class="stat">
			<span class="v">{plan.totalPlacedCredits}</span>
			<span class="l">placed</span>
		</div>
		<div class="stat">
			<span class="v">{left}</span>
			<span class="l">still to place</span>
		</div>
		<div class="stat">
			<span class="v">{plan.degreeTotal}</span>
			<span class="l">your degree</span>
		</div>
		<div class="stat">
			<span class="v">{ceiling}</span>
			<span class="l">tenure ceiling</span>
		</div>
	</div>

	<section>
		<h3>the load you're aiming for</h3>
		<div class="seg" role="group" aria-label="target credits per trimester">
			{#each LOADS as n (n)}
				<button class:active={plan.targetLoad === n} onclick={() => (plan.targetLoad = n)}>{n}</button>
			{/each}
		</div>
		<p class="note">
			The grid turns a trimester's credit count red past this. {TRIM_NORMAL_MAX} is the registration
			the drop form recommends; {TRIM_MIN}–{TRIM_HARD_MAX} is what it will accept.
		</p>
	</section>

	<section>
		<h3>the rules, against your plan</h3>
		<ul class="rules">
			{#each rules as rule (rule.text)}
				<li>
					<span class="pill {rule.kind}">{rule.status}</span>
					<span class="text">{rule.text}</span>
				</li>
			{/each}
		</ul>
		<p class="note">
			Suspended students write to the Academic Office with their final course list inside the stated
			window, so the changes can be made by hand.
		</p>
	</section>
</Modal>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.8rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.9rem 0.4rem;
		background-color: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 6px;
		@include glossy;

		.v {
			font-size: 2rem;
			font-weight: 700;
			color: var(--color-text);
			font-variant-numeric: tabular-nums;
		}

		.l {
			font-size: 1.1rem;
			color: var(--color-text-muted);
			text-transform: uppercase;
			letter-spacing: 0.04em;
		}
	}

	section {
		margin-top: 1.8rem;
		padding-top: 1.6rem;
		border-top: 1px solid var(--color-border-divider);
	}

	h3 {
		@include section-label;
		margin-bottom: 1rem;
	}

	.seg {
		@include segmented;
	}

	.note {
		margin-top: 0.8rem;
		font-size: 1.2rem;
		line-height: 1.5;
		color: var(--color-text-muted);
	}

	.rules {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		list-style: none;

		li {
			display: grid;
			grid-template-columns: 8.5rem 1fr;
			align-items: start;
			gap: 1rem;
		}

		.text {
			font-size: 1.25rem;
			line-height: 1.5;
			color: var(--color-text);
		}
	}

	// where the plan stands on that rule, in the hint palette
	.pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.35rem 0.6rem;
		font-size: 1.1rem;
		font-weight: 700;
		text-align: center;
		border: 1px solid var(--tone-deep);
		border-radius: 999px;
		background-color: var(--tone);
		@include glossy;

		&.ok {
			--tone: var(--color-hint-good);
			--tone-deep: var(--color-hint-good-deep);
		}

		&.watch {
			--tone: var(--color-hint-caution);
			--tone-deep: var(--color-hint-caution-deep);
		}

		&.over {
			--tone: var(--color-hint-warn);
			--tone-deep: var(--color-hint-warn-deep);
		}

		&.note {
			--tone: var(--color-hint-info);
			--tone-deep: var(--color-hint-info-deep);
		}
	}
</style>
