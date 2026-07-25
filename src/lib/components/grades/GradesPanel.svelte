<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import { byCode, hasCode } from '$lib/data';
	import {
		GRADE_POINTS,
		isGradeLetter,
		weightedGpa,
		recovery,
		cgpaToPercent,
		gradMinCredits,
		GRAD_MIN_CGPA
	} from '$lib/grades';
	import Modal from '../Modal.svelte';

	let { plan, onclose }: { plan: Plan; onclose: () => void } = $props();

	type Term = { year: number; trim: number; codes: string[] };

	// placed non-audit courses grouped by trimester — for the per-term TGPA
	let terms = $derived.by<Term[]>(() => {
		const seen = new Set<string>();
		const groups = new Map<string, Term>();
		for (const p of [...plan.placed].sort((a, b) => a.year - b.year || a.trim - b.trim)) {
			if (seen.has(p.code) || !hasCode(p.code) || plan.isAudit(p.code)) continue;
			seen.add(p.code);
			const key = `${p.year}-${p.trim}`;
			if (!groups.has(key)) groups.set(key, { year: p.year, trim: p.trim, codes: [] });
			groups.get(key)!.codes.push(p.code);
		}
		return [...groups.values()];
	});

	// TGPA over the letter-graded courses in one term (W / I / ungraded ignored)
	function tgpa(codes: string[]): { gpa: number | null; graded: number; total: number } {
		const items: { points: number; credits: number }[] = [];
		let graded = 0;
		for (const code of codes) {
			const mark = plan.gradeOf(code);
			if (isGradeLetter(mark)) {
				items.push({ points: GRADE_POINTS[mark], credits: byCode(code).credits });
				graded++;
			}
		}
		return { gpa: weightedGpa(items), graded, total: codes.length };
	}

	// ── recovery ──
	let target = $state(GRAD_MIN_CGPA);
	let rec = $derived(recovery(target, plan.earnedPoints, plan.gradedCredits, plan.gradableCredits));
	let remaining = $derived(Math.max(0, plan.gradableCredits - plan.gradedCredits));

	// ── graduation snapshot ──
	let minCredits = $derived(gradMinCredits(plan.fourYear));
	let uCount = $derived(plan.gradedCourses.filter((c) => c.letter === 'U').length);

	const fmt = (n: number) => n.toFixed(2);
</script>

<Modal title="grades & cgpa" width="46rem" {onclose}>
	<div class="hero">
		{#if plan.cgpa === null}
			<div class="cgpa-empty">no grades yet — open a course and set its grade to see your CGPA</div>
		{:else}
			<div class="cgpa"><span class="num">{fmt(plan.cgpa)}</span><span class="den">/10</span></div>
			<div class="cgpa-sub">
				{cgpaToPercent(plan.cgpa).toFixed(1)}% · {plan.gradedCredits} of {plan.gradableCredits} planned credits graded
			</div>
		{/if}
	</div>

	<section class="gates">
		<div class="gate" class:bad={plan.gradableCredits < minCredits}>
			<span class="g-label">credits</span>
			<span class="g-val">{plan.gradableCredits}<em>/{minCredits}</em></span>
			<span class="g-note">{plan.gradableCredits >= minCredits ? 'meets the minimum' : `${minCredits - plan.gradableCredits} short`}</span>
		</div>
		<div class="gate" class:bad={plan.cgpa !== null && plan.cgpa < GRAD_MIN_CGPA}>
			<span class="g-label">cgpa ≥ {GRAD_MIN_CGPA}</span>
			<span class="g-val">{plan.cgpa === null ? '—' : fmt(plan.cgpa)}</span>
			<span class="g-note">{plan.cgpa === null ? 'no grades yet' : plan.cgpa >= GRAD_MIN_CGPA ? 'above the floor' : 'below the floor'}</span>
		</div>
		<div class="gate" class:bad={uCount > 0}>
			<span class="g-label">no U grades</span>
			<span class="g-val">{uCount}</span>
			<span class="g-note">{uCount === 0 ? 'all passed' : `${uCount} to clear`}</span>
		</div>
	</section>

	<section class="recover">
		<div class="recover-head">
			<span>reach a CGPA of</span>
			<input type="number" min="0" max="10" step="0.1" bind:value={target} />
		</div>
		<p class="recover-msg" class:warn={rec.kind === 'impossible'} class:good={rec.kind === 'secured'}>
			{#if rec.kind === 'no-grades'}
				set a few grades and I'll tell you what the rest of your plan needs to average.
			{:else if rec.kind === 'complete'}
				every planned credit is graded — your CGPA is final at <b>{fmt(rec.cgpa)}</b>.
			{:else if rec.kind === 'secured'}
				already locked in — you stay at or above <b>{target.toFixed(1)}</b> even scoring U on every remaining credit.
			{:else if rec.kind === 'reachable'}
				average at least <b>{fmt(rec.needed)}</b>{#if rec.letter} (a <b>{rec.letter.letter}</b>){/if} across your remaining <b>{remaining}</b> credits.
			{:else if rec.kind === 'impossible'}
				out of reach for this plan — even all A+ on the remaining {remaining} credits tops out at <b>{fmt(rec.max)}</b>.
			{/if}
		</p>
	</section>

	{#if terms.length}
		<section class="terms">
			<div class="terms-head">by trimester</div>
			{#each terms as term (term.year + '-' + term.trim)}
				{@const t = tgpa(term.codes)}
				<div class="term-row">
					<span class="tr-name">year {term.year} · t{term.trim}</span>
					<span class="tr-count">{t.graded}/{t.total} graded</span>
					<span class="tr-tgpa">{t.gpa === null ? '—' : fmt(t.gpa)}</span>
				</div>
			{/each}
		</section>
	{/if}

	<p class="hint">enter grades from any course's panel on the right — turn on <b>grade view</b> above the grid.</p>
</Modal>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.hero {
		text-align: center;
		padding: 0.4rem 0 1.4rem;
	}
	.cgpa {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 0.2rem;
		.num {
			font-size: 4.2rem;
			font-weight: 700;
			line-height: 1;
			color: var(--color-text);
		}
		.den {
			font-size: 1.8rem;
			color: var(--color-text-muted);
		}
	}
	.cgpa-sub {
		margin-top: 0.4rem;
		font-size: 1.3rem;
		color: var(--color-text-muted);
	}
	.cgpa-empty {
		@include empty-text;
		padding: 1.6rem 0;
	}

	.gates {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.8rem;
		margin-bottom: 1.4rem;
	}
	.gate {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.9rem 1rem;
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 5px;
		@include card-shine;
		&.bad {
			border-color: var(--color-danger);
			background: color-mix(in srgb, var(--color-danger) 8%, var(--color-bg-light));
		}
		.g-label {
			font-size: 1.1rem;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: var(--color-text-muted);
		}
		.g-val {
			font-size: 1.8rem;
			font-weight: 700;
			color: var(--color-text);
			em {
				font-style: normal;
				font-size: 1.2rem;
				font-weight: 500;
				color: var(--color-text-muted);
			}
		}
		.g-note {
			font-size: 1.1rem;
			color: var(--color-text-muted);
			line-height: 1.3;
		}
	}

	.recover {
		padding: 1.2rem 1.4rem;
		margin-bottom: 1.4rem;
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 6px;
		box-shadow: var(--shadow-well);
	}
	.recover-head {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		font-size: 1.4rem;
		color: var(--color-text);
		input {
			width: 6rem;
			padding: 0.4rem 0.6rem;
			font-size: 1.5rem;
			font-weight: 700;
			text-align: center;
			color: var(--color-text);
			background: var(--color-bg);
			border: 1px solid var(--color-border-card);
			border-radius: 5px;
		}
	}
	.recover-msg {
		margin-top: 0.8rem;
		font-size: 1.35rem;
		line-height: 1.5;
		color: var(--color-text);
		&.warn {
			color: var(--color-danger);
		}
		&.good {
			color: var(--color-accent);
		}
	}

	.terms {
		border-top: 1px solid var(--color-border-divider);
		padding-top: 1rem;
	}
	.terms-head {
		@include section-label;
		margin-bottom: 0.4rem;
	}
	.term-row {
		display: grid;
		grid-template-columns: 1fr auto 4rem;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 0;
		font-size: 1.3rem;
		& + .term-row {
			border-top: 1px solid var(--color-border-light);
		}
		.tr-name {
			color: var(--color-text);
		}
		.tr-count {
			font-size: 1.1rem;
			color: var(--color-text-muted);
		}
		.tr-tgpa {
			text-align: right;
			font-weight: 700;
			color: var(--color-text);
		}
	}

	.hint {
		margin-top: 1.2rem;
		font-size: 1.2rem;
		line-height: 1.45;
		color: var(--color-text-muted);
	}
</style>
