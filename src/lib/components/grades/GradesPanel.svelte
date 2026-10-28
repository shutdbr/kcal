<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import { byCode, hasCode } from '$lib/data';
	import { slide } from 'svelte/transition';
	import {
		GRADE_POINTS,
		GRADE_SCALE,
		OTHER_MARKS,
		isGradeLetter,
		weightedGpa,
		recovery,
		cgpaToPercent,
		gradMinCredits,
		GRAD_MIN_CGPA,
		type GradeMark
	} from '$lib/grades';
	import Modal from '../Modal.svelte';

	// `year` narrows the window to one year's courses — opened from that
	// year's GPA capsule on the grid, to grade just those
	let { plan, onclose, year = undefined }: { plan: Plan; onclose: () => void; year?: number } = $props();

	type Term = { year: number; trim: number; codes: string[] };

	// placed non-audit courses grouped by trimester — for the per-term TGPA
	let terms = $derived.by<Term[]>(() => {
		const seen = new Set<string>();
		const groups = new Map<string, Term>();
		for (const p of [...plan.placed].sort((a, b) => a.year - b.year || a.trim - b.trim)) {
			if (seen.has(p.code) || !hasCode(p.code) || plan.isAudit(p.code)) continue;
			if (year !== undefined && p.year !== year) continue;
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

	// ── entering grades, by trimester ──
	// A trimester cascades open to its courses, each with its own grade select,
	// so a student sitting down with a transcript can fill in a whole term (or
	// the whole degree, via "open all") without hunting course by course
	// through the grid and the details panel.
	const termKey = (t: Term) => `${t.year}-${t.trim}`;
	let open = $state<string[]>([]);
	let allOpen = $derived(terms.length > 0 && open.length === terms.length);
	// one year's window starts with every trimester open — that's the point
	// of opening it — so there a click on a trimester folds it instead
	const isOpen = (key: string) => (year !== undefined) !== open.includes(key);

	function toggleTerm(key: string) {
		open = open.includes(key) ? open.filter((k) => k !== key) : [...open, key];
	}

	function toggleAll() {
		open = allOpen ? [] : terms.map(termKey);
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

<Modal title={year === undefined ? 'grades & cgpa' : `year ${year} grades`} width="46rem" {onclose}>
	{#if year !== undefined}
		{@const yg = plan.yearGpa(year)}
		<div class="hero">
			{#if yg === null}
				<div class="cgpa-empty">no grades in year {year} yet — fill them in below</div>
			{:else}
				<div class="cgpa"><span class="num">{fmt(yg)}</span><span class="den">/10</span></div>
				<div class="cgpa-sub">year {year} GPA</div>
			{/if}
		</div>
	{:else}
	<div class="hero">
		{#if plan.cgpa === null}
			<div class="cgpa-empty">no grades yet — open a trimester below and fill them in</div>
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
	{/if}

	{#if terms.length}
		<section class="terms">
			<div class="terms-head">
				<span>by trimester</span>
				{#if year === undefined}
					<button class="all-btn" onclick={toggleAll}>{allOpen ? 'close all' : 'open all'}</button>
				{/if}
			</div>
			{#each terms as term (termKey(term))}
				{@const key = termKey(term)}
				{@const t = tgpa(term.codes)}
				{@const termOpen = isOpen(key)}
				<div class="term">
					<button
						class="term-row"
						class:open={termOpen}
						aria-expanded={termOpen}
						title="enter grades for this trimester"
						onclick={() => toggleTerm(key)}
					>
						<span class="tr-caret" aria-hidden="true">▸</span>
						<span class="tr-name">year {term.year} · t{term.trim}</span>
						<span class="tr-count">{t.graded}/{t.total} graded</span>
						<span class="tr-tgpa">{t.gpa === null ? '—' : fmt(t.gpa)}</span>
					</button>

					{#if termOpen}
						<div class="term-courses" transition:slide={{ duration: 160 }}>
							{#each term.codes as code (code)}
								{@const c = byCode(code)}
								<label class="c-row">
									<span class="c-label" title="{plan.shownCode(code)} {c.title}"
										>{#if plan.showCodes}<b>{plan.shownCode(code)}</b> {/if}{c.title}</span
									>
									<span class="c-cr">{c.credits} cr</span>
									<select
										class="c-grade"
										class:set={plan.gradeOf(code) !== undefined}
										value={plan.gradeOf(code) ?? ''}
										onchange={(e) =>
											plan.setGrade(code, (e.currentTarget.value || null) as GradeMark | null)}
									>
										<option value="">—</option>
										{#each OTHER_MARKS as m (m.mark)}
											<option value={m.mark}>{m.label}</option>
										{/each}
										<optgroup label="grade">
											{#each GRADE_SCALE as g (g.letter)}
												<option value={g.letter}>{g.letter} · {g.points}</option>
											{/each}
										</optgroup>
									</select>
								</label>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</section>
	{:else if year !== undefined}
		<p class="hint">nothing on year {year} to grade yet.</p>
	{/if}

	<p class="hint">
		{year === undefined ? 'open a trimester above to grade its courses' : 'grade the courses above'}, or set a grade from any course's panel on the right.
		audits carry no grade and stay out of the maths.
	</p>
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
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.4rem;
	}
	.all-btn {
		font: inherit;
		font-size: 1.1rem;
		text-transform: none;
		letter-spacing: 0;
		color: var(--color-accent);
		background: none;
		border: 0;
		cursor: pointer;
		&:hover {
			text-decoration: underline;
		}
	}

	.term + .term {
		border-top: 1px solid var(--color-border-light);
	}

	.term-row {
		display: grid;
		grid-template-columns: 1.2rem 1fr auto 4rem;
		align-items: center;
		gap: 1rem;
		width: 100%;
		padding: 0.5rem 0;
		font: inherit;
		font-size: 1.3rem;
		text-align: left;
		background: none;
		border: 0;
		cursor: pointer;
		.tr-caret {
			font-size: 1rem;
			color: var(--color-text-muted);
			transition: transform 0.15s ease;
		}
		&.open .tr-caret {
			transform: rotate(90deg);
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
		&:hover .tr-name {
			text-decoration: underline;
		}
	}

	// the cascade: one row per course in the trimester, each with its own grade
	// select, so a whole term can be typed in without leaving this panel
	.term-courses {
		padding: 0.2rem 0 0.8rem 2.2rem;
	}
	.c-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto 8.5rem;
		align-items: center;
		gap: 0.8rem;
		padding: 0.3rem 0;
		font-size: 1.2rem;
		.c-label {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			color: var(--color-text);
		}
		.c-cr {
			font-size: 1.1rem;
			color: var(--color-text-muted);
		}
	}
	.c-grade {
		width: 100%;
		padding: 0.3rem 0.4rem;
		font-size: 1.2rem;
		color: var(--color-text);
		background: var(--color-bg);
		border: 1px solid var(--color-border-card);
		border-radius: 4px;
		cursor: pointer;
		// an ungraded course reads as a blank to fill; a set one firms up
		&.set {
			font-weight: 700;
			border-color: var(--color-accent);
		}
	}

	.hint {
		margin-top: 1.2rem;
		font-size: 1.2rem;
		line-height: 1.45;
		color: var(--color-text-muted);
	}
</style>
