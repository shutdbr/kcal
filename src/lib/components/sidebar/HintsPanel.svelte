<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { reducedMotion } from '$lib/transitions';
	import type { Hint } from '$lib/types';
	import type { Plan } from '$lib/plan.svelte';
	import { byCode, hasCode, subjectById } from '$lib/data';
	import ReferencePath from '$lib/components/board/ReferencePath.svelte';
	import Progress from './Progress.svelte';

	let { plan }: { plan: Plan } = $props();

	let showPath = $state(false);
	// one hint open at a time — opening another folds the last
	let openKey = $state<string | null>(null);
	const hintKey = (hint: Hint, i: number) => hint.id ?? hint.text + i;
	function toggle(key: string) {
		openKey = openKey === key ? null : key;
	}
	function heading(hint: Hint) {
		const text = hint.text.toLowerCase();
		if (/earlier|prerequisite|before/.test(text)) return 'prerequisite order';
		if (/usually open|not year|only.*year/.test(text)) return 'year eligibility';
		if (/required courses.*place/.test(text)) return 'required courses missing';
		if (/credit.*minimum|under.*credit/.test(text)) return 'below the credit minimum';
		if (/credit.*max|over.*credit|ceiling/.test(text)) return 'credit limit';
		if (/interchangeable|you can switch/.test(text)) return 'equivalent courses';
		if (/foundation/.test(text)) return 'foundation courses';
		if (/audit/.test(text)) return 'audit allowance';
		if (/transcript/.test(text)) return 'transcript only';
		if (/offered|trimester/.test(text)) return 'trimester availability';
		return hint.text.length > 48 ? hint.text.slice(0, 45) + '…' : hint.text;
	}

	// worst first — a broken prerequisite matters more than "2 audits
	// remaining", and the panel is long enough that the reds were scrolling
	// off the bottom under a stack of yellows
	const RANK = { warn: 0, caution: 1, info: 2, good: 3 };
	let sorted = $derived([...plan.hints].sort((a, b) => RANK[a.kind] - RANK[b.kind]));
	// things to fix, and — quieter, below them — notes that are just facts
	// ("2 audits left"); the badge counts only the first, so it matches
	let issues = $derived(sorted.filter((h) => h.kind === 'warn' || h.kind === 'caution'));
	let notes = $derived(sorted.filter((h) => h.kind === 'info' || h.kind === 'good'));
	let problems = $derived(issues.length);

	// picking a course a hint names (the ▲ on its chip) unfolds its first —
	// worst — hint and brings it into view — only on the pick itself, so a hint folded by hand
	// stays folded as the plan changes around it
	$effect(() => {
		const code = plan.selected?.code;
		if (!code) return;
		untrack(() => {
			// a hint can name a course by a cross-listed alias (a prerequisite
			// as the catalogue lists it), so match on the canonical code
			const names = (hint: Hint) => hint.codes.some((c) => hasCode(c) && byCode(c).code === code);
			const hit = [...issues, ...notes].findIndex(names);
			if (hit < 0) return;
			openKey = hintKey([...issues, ...notes][hit], hit);
			tick().then(() =>
				document.getElementById(`hint-detail-${hit}`)?.parentElement?.scrollIntoView({
					block: 'nearest',
					behavior: reducedMotion() ? 'auto' : 'smooth'
				})
			);
		});
	});

	// a hint that names a real course can jump to it in the details panel
	const targetOf = (codes: string[]) => codes.find(hasCode);
</script>

{#snippet hintChip(hint: Hint, i: number)}
	{@const target = targetOf(hint.codes)}
	{@const key = hintKey(hint, i)}
	<!-- pointing at a hint lights up the courses it names on the grid -->
	<div
		class="chip {hint.kind}"
		role="group"
		onmouseenter={() => (plan.highlight = hint.codes)}
		onmouseleave={() => (plan.highlight = [])}
		onfocusin={() => (plan.highlight = hint.codes)}
		onfocusout={() => (plan.highlight = [])}
	>
		<button class="hint-heading" aria-expanded={openKey === key} aria-controls={`hint-detail-${i}`} onclick={() => toggle(key)}>
			<span class="hint-title"><i class="tone-dot" data-kind={hint.kind} aria-hidden="true"></i>{heading(hint)}{#if target}<small>{target}</small>{/if}</span>
			<span class="toggle-mark" aria-hidden="true">{openKey === key ? '−' : '+'}</span>
		</button>
		{#if openKey === key}
			<div class="hint-detail" id={`hint-detail-${i}`} transition:slide={{ duration: reducedMotion() ? 0 : 210, easing: cubicOut }}>
				<div class="detail-body">
					{#if target}
						<button class="chip-text jump" title="show {plan.courseLabel(target)}" onclick={() => plan.revealCourse(target)}>
							{hint.text}
						</button>
					{:else}
						<!-- a click here folds the hint back up, rather than starting
						     a text selection on a line that does nothing -->
						<button class="chip-text" onclick={() => toggle(key)}>{hint.text}</button>
					{/if}
				</div>
				<!-- a red hint states a rule the registry enforces, not us — and
				     waivers, one-off offerings and year exemptions are ordinary.
				     So it can be crossed off, and stops counting against the plan. -->
				{#if hint.id}
					<button
						class="waive"
						title="cross this off — e.g. you have a waiver for it"
						aria-label="cross off: {hint.text}"
						onclick={() => plan.waiveHint(hint.id!)}>×</button
					>
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

<div class="section">
	<h3>information</h3>

	<div class="stats">
		<!-- the whole degree as one plain count; the bars below break it down -->
		<div class="total">
			<span>total</span>
			<b>{plan.totalPlacedCredits}<em>/</em>{plan.degreeTotal} cr</b>
		</div>

		{#each plan.stats as s (s.role + s.subject)}
			<div class="prog">
				<div class="prog-name"><span>{s.label}</span><span class="muted">{s.role}</span></div>
				<!-- required and elective credits on one bar, split where one
				     hands over to the other -->
				<Progress
					required={{ done: s.requiredDone, needed: s.requiredNeeded }}
					elective={{ done: s.electiveDone, needed: s.electiveNeeded }}
					electiveLabel={s.subject === 'open' ? 'free courses' : 'electives'}
					hue={subjectById(s.subject).hue}
				/>
			</div>
		{/each}
	</div>
</div>

{#if plan.choices.length}
	<div class="section">
		<h3>choices</h3>

		<div class="choices">
			{#each plan.choices as prog (prog.role + prog.label)}
				{#each prog.groups as group, gi (group.rule + gi)}
					{@const picked = group.courses.filter((c) => c.code && plan.placedCodes.has(c.code)).length}
					<div class="choice">
						<div class="choice-rule">
							<span>
								choose {group.pick}{group.topic ? ` ${group.topic}` : ''}
								<em class="counts" title="these picks count toward your {group.counts} credits">· {group.counts}{plan.choices.length > 1 ? ` · ${prog.label}` : ''}</em>
							</span>
							{#if group.courses.length}
								<span class="picked" class:done={picked >= group.pick}>{picked} of {group.pick} picked</span>
							{/if}
						</div>
						{#if group.courses.length}
							<!-- courses you can actually take first; the ones no term has
							     taught yet trail behind, dimmed -->
							{@const courses = [...group.courses].sort((a, b) => Number(!a.code) - Number(!b.code))}
							<ul class="choice-list">
								{#each courses as course (course.title)}
									<li
										class:missing={!course.code}
										class:done={course.code && plan.placedCodes.has(course.code)}
										title={course.title}
									>
										<!-- labelled like the grid (the codes / titles switches); a
										     click finds the course in the catalogue -->
										{#if course.code}
											{@const code = course.code}
											<button class="choice-course" onclick={() => plan.revealCourse(code)}>
												{#if plan.showCodes}<b>{plan.shownCode(code)}</b>{/if}{plan.showCodes && plan.showTitles ? ' ' : ''}{#if plan.showTitles}{course.title}{/if}
											</button>
										{:else}{course.title}{/if}
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

<div class="section" data-tour="hints">
	<h3>
		hints
		{#if problems}
			<span class="count" title="{problems} thing{problems === 1 ? '' : 's'} to fix">{problems}</span>
		{/if}
	</h3>

	<!-- The reference plan opens from here: this panel is where a student comes
	     when something is wrong with their plan, and "what does the department
	     suggest instead" is the next question. It opens as a window, not a
	     board mode — see ReferencePath. -->
	<div class="ref">
		<button class="ref-btn" onclick={() => (showPath = true)}>
			suggested path
			{#if plan.suggestionCount}<em>{plan.suggestionCount} missing</em>{/if}
		</button>
	</div>

	{#if issues.length}
		<div class="chips">
			{#each issues as hint, i (hint.id ?? hint.text + i)}
				{@render hintChip(hint, i)}
			{/each}
		</div>
	{:else}
		<p class="all-clear">nothing to fix right now ✓</p>
	{/if}

	{#if notes.length}
		<div class="notes-head">notes</div>
		<div class="chips notes">
			{#each notes as hint, i (hint.id ?? hint.text + i)}
				{@render hintChip(hint, issues.length + i)}
			{/each}
		</div>
	{/if}

	{#if plan.waivedHints.length}
		<div class="waived">
			<div class="waived-head">
				crossed off ({plan.waivedHints.length}) — not counted against the plan
			</div>
			{#each plan.waivedHints as hint (hint.id)}
				<button class="wv" title="bring this hint back" onclick={() => plan.unwaiveHint(hint.id!)}>
					<s>{hint.text}</s>
					<span class="wv-undo">undo</span>
				</button>
			{/each}
		</div>
	{/if}

	<!-- the checker is only as right as its data — one quiet line at the
	     foot of the list to say a hint is off, not one under every hint -->
	<button class="wrong" onclick={() => (plan.feedbackDraft = 'A hint looks wrong: ')}>a hint looks wrong? tell me</button>
</div>

{#if showPath}
	<ReferencePath {plan} onclose={() => (showPath = false)} />
{/if}

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
			color: var(--color-danger-deep);
			background-color: var(--color-hint-warn);
			border: 1px solid color-mix(in srgb, var(--color-danger-deep) 25%, transparent);
			border-radius: var(--rail-radius, 4px);
			box-shadow: var(--shadow-inset);
		}
	}

	.stats {
		padding: 0.6rem 1.6rem 1.4rem;
		font-size: var(--text-body);
		line-height: 1.5;

		.total {
			display: flex;
			align-items: baseline;
			justify-content: space-between;
			font-weight: 700;

			b {
				font-variant-numeric: tabular-nums;
			}

			em {
				font-style: normal;
				font-weight: 400;
				color: var(--color-text-muted);
			}
		}

		.prog {
			margin-top: 1rem;
			padding-top: 0.8rem;
			border-top: 1px dotted var(--color-border-light);
		}

		// subject on the left, its role pushed to the right edge
		.prog-name {
			display: flex;
			align-items: baseline;
			justify-content: space-between;
			gap: 0.8rem;
			font-weight: 700;
		}

		.muted {
			font-weight: 400;
			color: var(--color-text-muted);
		}
	}

	.choices {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.2rem 1.6rem;
	}

	// each pool on its own dotted rule, like the programmes above
	.choice + .choice {
		padding-top: 1rem;
		border-top: 1px dotted var(--color-border-light);
	}

	.choice-rule {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.2rem 0.8rem;
		font-size: var(--text-body);
		font-weight: 700;
		color: var(--color-text);

		.counts {
			font-style: normal;
			font-weight: 400;
			color: var(--color-text-muted);
		}

		.picked {
			font-weight: 600;
			color: var(--color-text-muted);

			&.done {
				color: var(--color-hint-good-deep);
			}
		}
	}

	// one line per course — long titles ellipsize (full title on hover) so a
	// pool reads as a tidy list instead of a wall of wrapped text
	.choice-list {
		margin: 0.4rem 0 0;
		padding-left: 0;
		font-size: var(--text-body);
		line-height: 1.5;
		color: var(--color-text);

		li {
			position: relative;
			padding-left: 1.6rem;
			list-style: none;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;

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

		.choice-course {
			display: block;
			width: 100%;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			padding: 0;
			font: inherit;
			text-align: left;
			color: inherit;
			background: none;
			border: 0;
			cursor: pointer;

			&:hover {
				text-decoration: underline;
				text-underline-offset: 0.2em;
			}
		}

		// a course the university lists but no term has taught yet — dimmed,
		// so it reads as "offered on paper, not on the plan"
		li.missing {
			color: var(--color-text-muted);
		}
	}

	.choice-note {
		font-size: var(--text-body);
		line-height: 1.4;
		color: var(--color-text-muted);
	}

	.hint-heading {
		display: flex; align-items: center; justify-content: space-between;
		gap: 1rem; width: 100%; padding: .7rem .6rem;
		font: inherit; font-weight: 500; text-align: left;
		color: inherit; background: transparent; border: 0; cursor: pointer;
		small { margin-left: .6rem; font-weight: 400; color: var(--color-text-muted); }
		&:hover { background: var(--color-hover); }
	}
	// a wrapped heading hangs off its dot: the second line lines up with the
	// first word, not under the dot
	.hint-title { padding-left: 1.6rem; text-indent: -1.6rem; }
	.toggle-mark { flex: none; font-family: monospace; font-size: 1.6rem; color: var(--color-text-muted); }
	// an open hint's text reads as subtext under its heading — no box, muted,
	// indented to start where the heading's words do
	.hint-detail { display: flex; align-items: flex-start; gap: .6rem; width: 100%; padding: 0 .6rem .9rem 2.2rem; }
	// severity rides on a small mark — its shape says how bad — not a whole
	// tinted box per hint
	.tone-dot {
		@include severity-mark;
		margin-right: .68rem; // mark + gap = the 1.6rem the wrapped line hangs by
		vertical-align: -0.05em;
	}
	.chips {
		display: flex;
		flex-direction: column;
		padding: 0.6rem 1rem 1.2rem;
	}

	// one row per hint on a dotted rule — a stack of tinted boxes read as a
	// wall of warnings; the dot in front carries the severity
	.chip {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		width: 100%;
		font-size: var(--text-body);
		line-height: 1.55;
		text-align: left;
		color: var(--color-text);
		user-select: none; // quick clicks were selecting the text instead

		& + .chip {
			border-top: 1px dotted var(--color-border-light);
		}

		// the text fills the row beside the cross-off ×
		// (a button can't nest inside a button)
		.detail-body {
			flex: 1;
			min-width: 0;
		}

		.chip-text {
			width: 100%;
			padding: 0;
			font: inherit;
			line-height: inherit;
			text-align: left;
			color: var(--color-text-muted);
			background: none;
			border: 0;
			cursor: pointer;
		}

		// the ones naming a course jump to it
		.chip-text.jump:hover {
			color: var(--color-text);
			text-decoration: underline;
		}

		// only ever on a warn chip — the rules a student can hold a waiver for
		.waive {
			flex: none;
			padding: 0 0.2rem;
			font-size: 1.4rem;
			line-height: 1.4;
			color: var(--color-text);
			background: none;
			border: 0;
			cursor: pointer;
			opacity: 0.5;

			&:hover {
				opacity: 1;
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

	// the notes under the issues: facts, not problems — quieter, so they
	// never read as a second wall of warnings
	.notes-head {
		@include section-label;
		padding: 0 1.6rem;
		font-size: 1.05rem;
	}

	.chips.notes {
		padding-top: 0.2rem;

		.chip {
			color: var(--color-text-muted);
		}
	}

	.all-clear {
		padding: 1rem 1.6rem 1.4rem;
		font-size: var(--text-body);
		color: var(--color-hint-good-deep);
	}

	.wrong {
		display: block;
		margin: 0 1.6rem 1.4rem;
		padding: 0;
		font: inherit;
		font-size: var(--text-body);
		color: var(--color-text-muted);
		background: none;
		border: 0;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 0.2em;

		&:hover {
			color: var(--color-text);
		}
	}

	// set off from the heading by a dotted rule, like the programmes above
	.ref {
		margin: 1rem 1.6rem 0;
		padding-top: 1.2rem;
		border-top: 1px dotted var(--color-border-light);
	}

	.ref-btn {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
		width: 100%;
		padding: 0.7rem 1rem;
		font: inherit;
		font-size: var(--text-body);
		white-space: nowrap;
		color: var(--color-text);
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: var(--rail-radius, 4px);
		cursor: pointer;

		// the count stays small so the label never wraps in the narrow rail
		em {
			font-style: normal;
			font-size: 1.1rem;
			color: var(--color-text-muted);
		}

		&:hover {
			background: var(--color-hover-medium);
		}
	}

	// crossed-off rules live below the live hints, quiet and struck through —
	// still visible, so a waiver is a decision the student can see and undo,
	// not a hint that silently vanished
	.waived {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0 1.2rem 1.2rem;
	}

	.waived-head {
		@include section-label;
		padding-bottom: 0.2rem;
	}

	.wv {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.8rem;
		width: 100%;
		padding: 0.4rem 0;
		font-size: var(--text-body);
		line-height: 1.55;
		text-align: left;
		color: var(--color-text-muted);
		background: none;
		border: 0;
		cursor: pointer;

		.wv-undo {
			flex: none;
			font-weight: 700;
			text-transform: uppercase;
			font-size: 1rem;
			letter-spacing: 0.04em;
			opacity: 0;
		}

		&:hover {
			color: var(--color-text);

			.wv-undo {
				opacity: 1;
			}
		}
	}
</style>
