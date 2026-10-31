<script lang="ts">
	// The credit rules the ERP drop form imposes, checked against the plan
	// that's actually on the grid, so "20 credits, twice in your tenure"
	// arrives as "you've used 1 of 2" instead of as a paragraph to re-read.
	// Below them, the standing and progression rules from the SIAS Exams &
	// Assessments Manual, checked against whatever grades are entered.
	import type { Plan } from '$lib/plan.svelte';
	import { trimesterName, type TrimNum } from '$lib/types';
	import {
		AUDIT_LIMIT,
		HEAVY_TRIMS_ALLOWED,
		MAX_TOTAL_3YR,
		MAX_TOTAL_4YR,
		TRIM_HARD_MAX,
		TRIM_MIN,
		TRIM_NORMAL_MAX,
		byCode
	} from '$lib/data';
	import { AID_MIN_CGPA, EXIT_CGPA, GRAD_MIN_CGPA } from '$lib/grades';
	import Modal from '../Modal.svelte';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { reducedMotion } from '$lib/transitions';

	let { plan, onclose }: { plan: Plan; onclose: () => void } = $props();

	type Slot = { y: number; t: TrimNum; credits: number };

	// year 1 sits outside the min/max rules, same as everywhere else
	let loads = $derived<Slot[]>(
		plan.years
			.filter((y) => y !== 1)
			.flatMap((y) => plan.trims.map((t) => ({ y, t, credits: plan.slotCredits(y, t) })))
			// past the degree's length (year 4 of a 3-year degree, a fifth year)
			// an empty trimester is just one you're not enrolled for
			.filter((s) => !(s.y > plan.minYears && s.credits === 0))
	);

	let thin = $derived(loads.filter((s) => s.credits < TRIM_MIN).length);
	let heavy = $derived(loads.filter((s) => s.credits > TRIM_NORMAL_MAX && s.credits <= TRIM_HARD_MAX).length);
	let over = $derived(loads.filter((s) => s.credits > TRIM_HARD_MAX).length);
	let audits = $derived(plan.placed.filter((p) => plan.isAudit(p.code)).length);
	let ceiling = $derived(plan.fourYear ? MAX_TOTAL_4YR : MAX_TOTAL_3YR);
	let left = $derived(Math.max(0, plan.creditMinimum - plan.totalPlacedCredits));

	const LOADS = [12, 14, 16, 18, 20];

	// a rule card jumps you to what it's about, the trimester, or the course
	function jump(year: number, trim: TrimNum) {
		plan.zoom = { year, trim };
		onclose();
	}
	function show(code: string) {
		plan.selected = byCode(code);
		onclose();
	}

	// ── the load chart ──
	// an empty year past the degree's length isn't part of it
	let chartYears = $derived(
		plan.years.filter((y) => y <= plan.minYears || plan.trims.some((t) => plan.slotCredits(y, t) > 0))
	);
	// headroom over the hard cap, or the fullest trimester if one is past it
	let scale = $derived(
		Math.max(TRIM_HARD_MAX + 4, ...chartYears.flatMap((y) => plan.trims.map((t) => plan.slotCredits(y, t))))
	);
	const GUIDES = [
		{ at: TRIM_MIN, label: 'min' },
		{ at: TRIM_NORMAL_MAX, label: 'usual' },
		{ at: TRIM_HARD_MAX, label: 'cap' }
	];

	type BarKind = 'exempt' | 'thin' | 'ok' | 'heavy' | 'over';
	function barKind(y: number, credits: number): BarKind {
		if (y === 1) return 'exempt';
		if (credits < TRIM_MIN) return 'thin';
		if (credits > TRIM_HARD_MAX) return 'over';
		if (credits > TRIM_NORMAL_MAX) return heavy > HEAVY_TRIMS_ALLOWED ? 'over' : 'heavy';
		return 'ok';
	}
	function barText(y: number, credits: number): string {
		if (y === 1) return 'year 1 has no minimum or cap';
		if (credits < TRIM_MIN) return `under the ${TRIM_MIN}-credit minimum`;
		if (credits > TRIM_HARD_MAX) return `over the ${TRIM_HARD_MAX}-credit cap`;
		if (credits > TRIM_NORMAL_MAX)
			return heavy > HEAVY_TRIMS_ALLOWED
				? `heavy, and past the ${HEAVY_TRIMS_ALLOWED} heavy trimesters allowed`
				: `heavy, one of your ${HEAVY_TRIMS_ALLOWED}`;
		return 'within the rules';
	}

	// ── the rule cards ──
	type Kind = 'ok' | 'watch' | 'over' | 'info';
	type Rule = {
		kind: Kind;
		title: string;
		status: string;
		text: string;
		meter?: { value: number; max: number };
		slots?: Slot[]; // the trimesters this rule is flagging
		codes?: string[]; // or the courses
	};

	let rules = $derived<Rule[]>([
		{
			kind: thin ? 'watch' : 'ok',
			title: `${TRIM_MIN}+ credits every trimester`,
			status: thin ? `${thin} below` : 'all good',
			text: `What keeps you a full-time student. Year 1 is exempt.`,
			slots: loads.filter((s) => s.credits < TRIM_MIN)
		},
		{
			kind: over || heavy > HEAVY_TRIMS_ALLOWED ? 'over' : heavy ? 'watch' : 'ok',
			title: `heavy trimesters (over ${TRIM_NORMAL_MAX} cr)`,
			status: over ? `${over} over ${TRIM_HARD_MAX}` : `${heavy} of ${HEAVY_TRIMS_ALLOWED} used`,
			text: `${TRIM_HARD_MAX} credits is the hard cap, and you may only go above ${TRIM_NORMAL_MAX} in ${HEAVY_TRIMS_ALLOWED} trimesters across your whole tenure.`,
			meter: { value: heavy, max: HEAVY_TRIMS_ALLOWED },
			slots: loads.filter((s) => s.credits > TRIM_NORMAL_MAX)
		},
		{
			kind: plan.totalPlacedCredits > ceiling ? 'over' : 'ok',
			title: `tenure ceiling`,
			status: `${plan.totalPlacedCredits} / ${ceiling}`,
			text: `Total credits can't pass ${ceiling} on the ${plan.fourYear ? 'four' : 'three'}-year programme. Talk to your mentor before adding a fifth course to a trimester.`,
			meter: { value: plan.totalPlacedCredits, max: ceiling }
		},
		{
			kind: audits > AUDIT_LIMIT ? 'over' : 'ok',
			title: 'audits',
			status: `${audits} of ${AUDIT_LIMIT} used`,
			text: `2- or 4-credit courses only, never KCCS / 391 / 490 / 491. You need your academic advisor's and the instructor's permission (the instructor's by email), you take part in everything except the final exam, and an audit must be deleted before it can switch to credit.`,
			meter: { value: audits, max: AUDIT_LIMIT }
		}
	]);

	let problems = $derived(rules.filter((r) => r.kind !== 'ok').length);

	// ── standing, from the exams manual ──
	// every graded mark on the plan, with the year it sits in. U is the only
	// fail; I is an incomplete. Audits carry no grade.
	let marks = $derived(
		plan.placed
			.filter((p) => !plan.isAudit(p.code))
			.map((p) => ({ code: p.code, year: p.year, mark: plan.gradeOf(p.code) }))
			.filter((m) => m.mark)
	);
	let graded = $derived(marks.length > 0);
	let failsY1 = $derived(marks.filter((m) => m.mark === 'U' && m.year === 1).map((m) => m.code));
	let failsY12 = $derived(marks.filter((m) => m.mark === 'U' && m.year <= 2).map((m) => m.code));
	let unfinished = $derived(marks.filter((m) => m.mark === 'U' || m.mark === 'I').map((m) => m.code));
	let years = $derived(plan.fourYear ? 4 : 3);

	let standing = $derived<Rule[]>([
		{
			kind: 'info',
			title: `finish within ${years + 2} years`,
			status: `${years + 2} years max`,
			text: `An n-year degree gets n + 2 years; anything longer needs the Vice-Chancellor's approval.${plan.fourYear ? ' UGC rules give up to seven to students who use an exit option along the way.' : ''}`
		},
		{
			kind: !graded ? 'info' : failsY1.length ? 'watch' : 'ok',
			title: 'clear year-1 fails before year 3',
			status: !graded ? 'no grades yet' : failsY1.length ? `${failsY1.length} to clear` : 'none',
			text: 'A U from your first three trimesters has to be passed before you can register for third-year courses.',
			codes: failsY1
		},
		...(plan.fourYear
			? [
					{
						kind: (!graded ? 'info' : failsY12.length ? 'over' : 'ok') as Kind,
						title: 'no fails from years 1–2 to enter year 4',
						status: !graded ? 'no grades yet' : failsY12.length ? `${failsY12.length} in the way` : 'none',
						text: 'To register for fourth-year courses you can’t be carrying a U from your first six trimesters.',
						codes: failsY12
					}
				]
			: []),
		{
			kind: plan.cgpa === null ? 'info' : plan.cgpa < GRAD_MIN_CGPA ? 'over' : 'ok',
			title: `CGPA ${GRAD_MIN_CGPA} for good standing`,
			status: plan.cgpa === null ? 'no grades yet' : plan.cgpa.toFixed(2),
			text: `${AID_MIN_CGPA} if you're on financial aid. Below ${EXIT_CGPA}, you're asked to leave the university.`,
			meter: plan.cgpa === null ? undefined : { value: plan.cgpa, max: 10 }
		},
		{
			kind: !graded ? 'info' : unfinished.length >= 5 ? 'over' : unfinished.length >= 3 ? 'watch' : 'ok',
			title: 'U and I grades',
			status: !graded ? 'no grades yet' : `${unfinished.length} of 3`,
			text: 'Three or more across your courses means an academic probation meeting; five or more and you can’t register for the next term.',
			meter: graded ? { value: unfinished.length, max: 5 } : undefined,
			codes: unfinished
		}
	]);

	let standingProblems = $derived(standing.filter((r) => r.kind === 'watch' || r.kind === 'over').length);

	// ── what's open ──
	// The panel leads with what needs attention: a rule that's fine is one
	// line (title + status) until you open it; one that isn't arrives open.
	// The manual's sections stay folded unless they have something to say.
	const needsLook = (r: Rule) => r.kind === 'watch' || r.kind === 'over';
	let toggled = $state<Record<string, boolean>>({});
	const isOpen = (r: Rule) => toggled[r.title] ?? needsLook(r);
	let showStanding = $state<boolean | null>(null);
	let standingOpen = $derived(showStanding ?? standingProblems > 0);
	let notesOpen = $state(false);
	const unfold = () => ({ duration: reducedMotion() ? 0 : 240, easing: cubicOut });

	const FORM_NOTES = [
		`Registering for more than ${TRIM_NORMAL_MAX} or fewer than ${TRIM_MIN} credits needs prior approval from Dr Aahique Iqbal, forwarded to the Academic Office.`,
		'The same course can’t be picked twice in a group.',
		'Once the drop form is submitted nothing can be changed, check it twice.',
		'Suspended students write to the Academic Office with their final course list inside the stated window.'
	];

	const MANUAL_NOTES = [
		'You need 75% attendance to sit a course’s end-term exam. Between 60% and 75% you still sit it, but a grade level lower unless a request letter (with documents) is accepted; under 60% you can’t.',
		'A U can be cleared by a supplementary exam if you met the attendance and did 40% of the assignments, once per course, at most two per cycle, three cycles a year. Otherwise you retake the course.',
		'A D or E can be raised once through an improvement exam; the higher of the two grades stands.',
		'An I (incomplete) gives you six weeks after exam week to finish the missing work.',
		'At most two reading courses across your whole degree.',
		'The top 10% of each batch make the Dean’s List at the end of the academic year.'
	];
</script>

{#snippet ruleList(list: Rule[])}
	<ul class="rules">
		{#each list as rule (rule.title)}
			{@const open = isOpen(rule)}
			<li class="rule {rule.kind}" class:open>
				<button class="r-head" aria-expanded={open} onclick={() => (toggled[rule.title] = !open)}>
					<span class="icon" aria-hidden="true">{rule.kind === 'ok' ? '✓' : rule.kind === 'info' ? 'i' : '!'}</span>
					<strong>{rule.title}</strong>
					<span class="pill">{rule.status}</span>
					<span class="chev" aria-hidden="true">›</span>
				</button>
				{#if open}
				<div class="r-body" transition:slide={unfold()}>
					{#if rule.meter}
						<div
							class="meter"
							role="progressbar"
							aria-label={rule.title}
							aria-valuemin={0}
							aria-valuemax={rule.meter.max}
							aria-valuenow={rule.meter.value}
						>
							<i style="width: {Math.min(100, (rule.meter.value / Math.max(1, rule.meter.max)) * 100)}%"></i>
						</div>
					{/if}
					<p>{rule.text}</p>
					{#if rule.slots?.length || rule.codes?.length}
						<div class="slots">
							{#each rule.slots ?? [] as s (`${s.y}-${s.t}`)}
								<button title="open year {s.y} trimester {s.t}" onclick={() => jump(s.y, s.t)}>
									Y{s.y} T{s.t} · {s.credits} cr
								</button>
							{/each}
							{#each rule.codes ?? [] as code (code)}
								<button title="show {plan.courseLabel(code)}" onclick={() => show(code)}>
									{plan.courseLabel(code)}
								</button>
							{/each}
						</div>
					{/if}
				</div>
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

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
		<div class="stat" title="the most of the degree's own minimum and what your programmes add up to">
			<span class="v">{plan.creditMinimum}</span>
			<span class="l">to graduate</span>
		</div>
		<div class="stat" title="the most credits you may register for across your whole degree">
			<span class="v">{ceiling}</span>
			<span class="l">tenure ceiling</span>
		</div>
	</div>

	<section>
		<h3>trimester by trimester</h3>

		<!-- every trimester's load against the three lines that matter, and
		     the target you pick below as a fourth that slides into place -->
		<div class="chart" style="--max: {scale}; --trims: {plan.trims.length}">
			<div class="plot">
				{#each GUIDES as g (g.at)}
					<div class="guide" style="--at: {g.at}">
						<span>{g.at}</span><em>{g.label}</em>
					</div>
				{/each}
				<div class="guide target" style="--at: {plan.targetLoad}" aria-hidden="true">
					<span>{plan.targetLoad}</span>
				</div>

				<div class="years">
					{#each chartYears as y, yi (y)}
						<div class="year">
							{#each plan.trims as t, ti (t)}
								{@const credits = plan.slotCredits(y, t)}
								<button
									class="bar {barKind(y, credits)}"
									style="--v: {credits}; --i: {yi * plan.trims.length + ti}"
									title="Y{y} T{t} · {credits} cr, {barText(y, credits)}. Click to open."
									aria-label="{trimesterName(y, t)}: {credits} credits, {barText(y, credits)}. Open it."
									onclick={() => jump(y, t)}
								>
									<i></i>
									{#if credits}<span class="n">{credits}</span>{/if}
								</button>
							{/each}
						</div>
					{/each}
				</div>
			</div>
			<div class="xaxis">
				{#each chartYears as y (y)}<span>y{y}</span>{/each}
			</div>
		</div>

		<ul class="key">
			<li><i class="ok"></i>fine</li>
			<li><i class="thin"></i>under {TRIM_MIN}</li>
			<li><i class="heavy"></i>heavy</li>
			<li><i class="over"></i>past the rules</li>
			<li><i class="exempt"></i>year 1, exempt</li>
		</ul>

		<h4>the load you're aiming for</h4>
		<div class="seg" role="group" aria-label="target credits per trimester">
			{#each LOADS as n (n)}
				<button class:active={plan.targetLoad === n} onclick={() => (plan.targetLoad = n)}>{n}</button>
			{/each}
		</div>
		<p class="note">
			The dashed line above. The grid turns a trimester's credit count red past it. {TRIM_NORMAL_MAX} is
			the registration the drop form recommends; {TRIM_MIN}–{TRIM_HARD_MAX} is what it will accept.
		</p>
	</section>

	<section>
		<h3>
			the rules, against your plan
			<span class="summary" class:bad={problems}>
				{problems ? `${problems} to look at` : 'all clear'}
			</span>
		</h3>
		{@render ruleList(rules)}
	</section>

	<section>
		<button class="disclose" aria-expanded={standingOpen} onclick={() => (showStanding = !standingOpen)}>
			<h3>
				standing & progression
				{#if graded}
					<span class="summary" class:bad={standingProblems}>
						{standingProblems ? `${standingProblems} to look at` : 'all clear'}
					</span>
				{/if}
			</h3>
			<span class="chev" aria-hidden="true">›</span>
		</button>
		{#if standingOpen}
			<div transition:slide={unfold()}>
				{#if !graded}
					<p class="note lead">Enter grades in grade view and these check themselves against them.</p>
				{/if}
				{@render ruleList(standing)}
			</div>
		{/if}
	</section>

	<section>
		<button class="disclose" aria-expanded={notesOpen} onclick={() => (notesOpen = !notesOpen)}>
			<h3>good to know</h3>
			<span class="chev" aria-hidden="true">›</span>
		</button>
		{#if notesOpen}
		<div transition:slide={unfold()}>
		<h4>the drop form</h4>
		<ul class="notes">
			{#each FORM_NOTES as note (note)}
				<li>{note}</li>
			{/each}
		</ul>
		<h4>exams & grades</h4>
		<ul class="notes">
			{#each MANUAL_NOTES as note (note)}
				<li>{note}</li>
			{/each}
		</ul>
		<p class="source">
			Standing, progression and exam rules are from the SIAS Exams & Assessments Manual (2020–25
			batches). Questions go to sias.examoffice@krea.edu.in.
		</p>
		</div>
		{/if}
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
		border-top: 1px dotted var(--color-border-card);
	}

	h3 {
		@include section-label;
		margin-bottom: 1rem;
	}

	h4 {
		margin: 1.4rem 0 0.6rem;
		font-size: 1.15rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.seg {
		@include segmented;
	}

	.note {
		margin-top: 0.8rem;
		font-size: 1.2rem;
		line-height: 1.5;
		color: var(--color-text-muted);

		&.lead {
			margin: -0.4rem 0 1rem;
		}
	}

	// ── the load chart ──
	.chart {
		--gutter: 2.4rem;
	}

	.plot {
		position: relative;
		height: 11rem;
		margin-left: var(--gutter);
		border-bottom: 1px solid var(--color-border-card);
	}

	// a horizontal rule at a credit count, numbered in the left gutter
	.guide {
		position: absolute;
		left: 0;
		right: 0;
		bottom: calc(var(--at) / var(--max) * 100%);
		border-top: 1px dotted color-mix(in srgb, var(--color-text-muted) 70%, transparent);
		pointer-events: none;

		span {
			position: absolute;
			right: 100%;
			bottom: 0;
			padding-right: 0.5rem;
			font-size: 1rem;
			font-variant-numeric: tabular-nums;
			line-height: 1.4;
			color: var(--color-text-muted);
			transform: translateY(50%);
		}

		em {
			position: absolute;
			right: 0.2rem;
			bottom: 0.1rem;
			font-size: 0.95rem;
			font-style: normal;
			color: var(--color-text-muted);
			opacity: 0.75;
		}

		// your target: an accent dashed line that slides on a spring when
		// you pick a different load
		&.target {
			z-index: 1;
			border-top: 1.5px dashed var(--color-accent);
			transition: bottom 0.42s var(--spring);

			span {
				margin-right: 0.2rem;
				padding: 0 0.4rem;
				font-weight: 700;
				color: var(--color-on-accent);
				background: var(--color-accent);
				border-radius: 3px;
			}
		}
	}

	.years {
		position: absolute;
		inset: 0;
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
	}

	.year {
		display: grid;
		grid-template-columns: repeat(var(--trims), 1fr);
		gap: 0.4rem;
		padding: 0 0.6rem;

		& + .year {
			border-left: 1px dotted var(--color-border-card);
		}
	}

	.bar {
		--tone: var(--color-hint-good);
		--tone-deep: var(--color-hint-good-deep);
		position: relative;
		height: 100%;
		padding: 0;
		background: none;
		border: 0;
		border-radius: 3px 3px 0 0;
		cursor: zoom-in;
		transition: background-color 0.15s ease;

		&:hover {
			background: var(--color-hover-medium);
		}

		&.thin {
			--tone: var(--color-hint-caution);
			--tone-deep: var(--color-hint-caution-deep);
		}

		&.heavy {
			--tone: var(--color-course-elective);
			--tone-deep: var(--color-course-elective-deep);
		}

		&.over {
			--tone: var(--color-hint-warn);
			--tone-deep: var(--color-hint-warn-deep);
		}

		&.exempt {
			--tone: color-mix(in srgb, var(--color-text-muted) 18%, transparent);
			--tone-deep: color-mix(in srgb, var(--color-text-muted) 45%, transparent);
		}

		// the column: rises out of the baseline on a spring when the panel
		// opens, one after another left to right
		i {
			position: absolute;
			left: 0;
			right: 0;
			bottom: 0;
			height: calc(var(--v) / var(--max) * 100%);
			min-height: 2px; // an empty trimester still shows as a sliver of its colour
			background: color-mix(in srgb, var(--tone-deep) 45%, var(--tone));
			border: 1px solid var(--tone-deep);
			border-bottom: 0;
			border-radius: 3px 3px 0 0;
			transform-origin: bottom;
			animation: rise 0.5s var(--spring) both;
			animation-delay: calc(var(--i) * 28ms);
			transition: scale 0.12s ease;
		}

		&:active i {
			scale: 1 0.94;
		}

		.n {
			position: absolute;
			left: 0;
			right: 0;
			bottom: calc(var(--v) / var(--max) * 100% + 0.1rem);
			font-size: 1rem;
			font-weight: 700;
			font-variant-numeric: tabular-nums;
			text-align: center;
			color: var(--color-text-muted);
			animation: count-in 0.3s ease both;
			animation-delay: calc(var(--i) * 28ms + 0.22s);
		}
	}

	@keyframes rise {
		from {
			transform: scaleY(0);
		}
	}

	@keyframes count-in {
		from {
			opacity: 0;
			transform: translateY(3px);
		}
	}

	.xaxis {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		margin-left: var(--gutter);

		span {
			padding-top: 0.3rem;
			font-size: 1.1rem;
			text-align: center;
			color: var(--color-text-muted);
		}
	}

	.key {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.2rem;
		margin-top: 0.8rem;
		list-style: none;
		font-size: 1.1rem;
		color: var(--color-text-muted);

		li {
			display: flex;
			align-items: center;
			gap: 0.4rem;
		}

		i {
			width: 1rem;
			height: 1rem;
			border-radius: 2px;
			background: color-mix(in srgb, var(--tone-deep) 45%, var(--tone));
			border: 1px solid var(--tone-deep);

			&.ok {
				--tone: var(--color-hint-good);
				--tone-deep: var(--color-hint-good-deep);
			}
			&.thin {
				--tone: var(--color-hint-caution);
				--tone-deep: var(--color-hint-caution-deep);
			}
			&.heavy {
				--tone: var(--color-course-elective);
				--tone-deep: var(--color-course-elective-deep);
			}
			&.over {
				--tone: var(--color-hint-warn);
				--tone-deep: var(--color-hint-warn-deep);
			}
			&.exempt {
				--tone: color-mix(in srgb, var(--color-text-muted) 18%, transparent);
				--tone-deep: color-mix(in srgb, var(--color-text-muted) 45%, transparent);
			}
		}
	}

	h3 .summary {
		margin-left: 0.6rem;
		padding: 0.1rem 0.7rem;
		font-size: 1.05rem;
		text-transform: none;
		letter-spacing: 0;
		color: var(--color-hint-good-deep);
		background: var(--color-hint-good);
		border-radius: 999px;

		&.bad {
			color: var(--color-text);
			background: var(--color-hint-caution);
		}
	}

	.rules {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		list-style: none;
	}

	// one row per rule, tinted by where the plan stands on it, a single
	// line until it's opened
	.rule {
		--tone: var(--color-hint-good);
		--tone-deep: var(--color-hint-good-deep);
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-left: 4px solid var(--tone-deep);
		border-radius: 6px;
		transition: box-shadow 0.2s ease;

		&.open {
			box-shadow: var(--shadow-card);
		}

		&.watch {
			--tone: var(--color-hint-caution);
			--tone-deep: var(--color-hint-caution-deep);
		}

		&.over {
			--tone: var(--color-hint-warn);
			--tone-deep: var(--color-hint-warn-deep);
		}

		// a fact, not a check, or a check with nothing to check yet
		&.info {
			--tone: var(--color-hint-info);
			--tone-deep: var(--color-hint-info-deep);
		}
	}

	.icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.2rem;
		height: 2.2rem;
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--color-text);
		background: var(--tone);
		border: 1px solid var(--tone-deep);
		border-radius: 50%;
	}

	// the opened part, indented under the title past the icon
	.r-body {
		min-width: 0;
		padding: 0 1.2rem 1rem 4.4rem;

		p {
			margin-top: 0.4rem;
			font-size: 1.2rem;
			line-height: 1.5;
			color: var(--color-text-muted);
			overflow-wrap: anywhere;
		}
	}

	.r-head {
		display: grid;
		grid-template-columns: 2.2rem minmax(0, 1fr) auto 1rem;
		align-items: center;
		gap: 1rem;
		width: 100%;
		padding: 0.8rem 1.2rem;
		font: inherit;
		text-align: left;
		background: none;
		border: 0;
		border-radius: 5px;
		cursor: pointer;
		transition: background-color 0.15s ease;

		&:hover {
			background: var(--color-hover);
		}

		strong {
			font-size: 1.3rem;
			color: var(--color-text);
		}
	}

	// the disclosure chevron: points right when shut, turns down when open
	.chev {
		font-size: 1.6rem;
		line-height: 1;
		color: var(--color-text-muted);
		text-align: center;
		transition: rotate 0.3s var(--spring);
	}

	.open > .r-head .chev,
	.disclose[aria-expanded='true'] .chev {
		rotate: 90deg;
	}

	// a section heading that folds its section away
	.disclose {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0;
		font: inherit;
		text-align: left;
		background: none;
		border: 0;
		cursor: pointer;

		h3 {
			margin-bottom: 0;
		}

		&[aria-expanded='true'] {
			margin-bottom: 1rem;
		}

		&:hover .chev {
			color: var(--color-text);
		}
	}

	.pill {
		flex: none;
		padding: 0.2rem 0.8rem;
		font-size: 1.1rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--color-text);
		background: var(--tone);
		border: 1px solid var(--tone-deep);
		border-radius: 999px;
	}

	.meter {
		height: 0.9rem;
		margin-top: 0.6rem;
		@include progress-track;

		i {
			display: block;
			height: 100%;
			background-color: var(--tone-deep);
			border-radius: inherit;
			@include progress-fill;
			transition: width 0.45s var(--ease-out);
		}
	}

	// the exact trimesters (or courses) a rule is about, each one opens it,
	// so there is nothing to hunt for
	.slots {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.6rem;

		button {
			padding: 0.15rem 0.6rem;
			font: inherit;
			font-size: 1.1rem;
			font-variant-numeric: tabular-nums;
			color: var(--color-text);
			background: var(--tone);
			border: 1px solid transparent;
			border-radius: 4px;
			cursor: pointer;
			transition:
				border-color 0.15s ease,
				transform 0.12s var(--spring);

			&:hover {
				border-color: var(--tone-deep);
			}

			&:active {
				transform: translateY(1px) scale(0.96);
			}
		}
	}

	.notes {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-left: 1.6rem;
		font-size: 1.2rem;
		line-height: 1.5;
		color: var(--color-text-muted);
	}

	.source {
		margin-top: 1.2rem;
		padding-top: 0.8rem;
		font-size: 1.1rem;
		line-height: 1.5;
		font-style: italic;
		color: var(--color-text-muted);
		border-top: 1px dotted var(--color-border-card);
	}
</style>
