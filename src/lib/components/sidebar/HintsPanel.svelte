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
	// one programme's breakdown open at a time
	let openProg = $state<string | null>(null);
	const left = (done: number, needed: number) => (done >= needed ? '✓ done' : `${needed - done} cr left`);
	// one hint open at a time — opening another folds the last
	let openKey = $state<string | null>(null);
	// the open hint's courses stay lit on the grid; pointing at another hint
	// previews its courses, then the grid goes back to the open one's
	let pinned: string[] = [];
	function toggle(key: string, codes: string[] = []) {
		openKey = openKey === key ? null : key;
		pinned = openKey ? codes.filter(hasCode) : [];
		plan.highlight = pinned;
		if (pinned.length) focusOnGrid(pinned[0]);
	}
	const restoreHighlight = () => (plan.highlight = pinned);
	/** bring a course's chip into view on the grid */
	function focusOnGrid(code: string) {
		tick().then(() =>
			document
				.querySelector(`.overview .chip[data-code="${CSS.escape(byCode(code).code)}"]`)
				?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
		);
	}
	// a few plain words per row; the full sentence is one click away
	function heading(hint: Hint) {
		const text = hint.text.toLowerCase();
		if (/applied version/.test(text)) return 'maths covers the applied one';
		if (/earlier|prerequisite|before/.test(text)) return 'prerequisites first';
		if (/usually open|not year|only.*year/.test(text)) return 'wrong year';
		if (/required courses?.*place/.test(text)) return 'required courses missing';
		if (/credit.*minimum|under.*credit/.test(text)) return 'too few credits';
		if (/credit.*max|over.*credit|ceiling|exceed/.test(text)) return 'too many credits';
		if (/interchangeable|you can switch/.test(text)) return 'you only need one';
		if (/foundation/.test(text)) return 'foundation courses';
		if (/audit/.test(text)) return 'audits';
		if (/transcript/.test(text)) return "doesn't count";
		if (/offered|trimester/.test(text)) return 'wrong trimester';
		if (/cgpa/.test(text)) return 'CGPA too low';
		if (/merit list/.test(text)) return "dean's list";
		if (/\(fail\)|incomplete|d\/e/.test(text)) return 'grades to sort out';
		if (hint.text.length <= 32) return hint.text;
		const cut = hint.text.slice(0, 30);
		return cut.slice(0, Math.max(cut.lastIndexOf(' '), 16)) + '…';
	}

	// a hint that names a real course can jump to it in the details panel
	const targetOf = (codes: string[]) => codes.find(hasCode);

	// worst first — a broken prerequisite matters more than "2 audits
	// remaining", and the panel is long enough that the reds were scrolling
	// off the bottom under a stack of yellows
	const RANK = { warn: 0, caution: 1, info: 2, good: 3 };
	let sorted = $derived([...plan.hints].sort((a, b) => RANK[a.kind] - RANK[b.kind]));
	// things to fix, and — quieter, below them — notes that are just facts
	// ("2 audits left"); the badge counts only the first, so it matches
	let issues = $derived(sorted.filter((h) => h.kind === 'warn' || h.kind === 'caution'));
	// "all foundation courses placed" and "3 audits left" were noise — only
	// notes that change a decision are listed
	let notes = $derived(sorted.filter((h) => h.kind === 'info'));
	let problems = $derived(issues.length);

	// hints with the same heading fold into one row — three "prerequisite
	// order" rows read as one problem in three places, not three problems
	type Group = { key: string; kind: Hint['kind']; title: string; hints: Hint[]; courses: string[] };
	function grouped(list: Hint[]): Group[] {
		const groups = new Map<string, Group>();
		for (const hint of list) {
			const title = heading(hint);
			const key = `${hint.kind}:${title}`;
			let g = groups.get(key);
			if (!g) groups.set(key, (g = { key, kind: hint.kind, title, hints: [], courses: [] }));
			g.hints.push(hint);
			// the course each hint is about (its first code) — the row's tags
			const target = targetOf(hint.codes);
			if (target && !g.courses.includes(byCode(target).code)) g.courses.push(byCode(target).code);
		}
		return [...groups.values()];
	}
	let issueGroups = $derived(grouped(issues));
	let noteGroups = $derived(grouped(notes));
	const TAGS_SHOWN = 2;
	// does a hint name this course? (a hint can name it by a cross-listed
	// alias — a prerequisite as the catalogue lists it — so match canonically)
	const names = (hint: Hint, code: string | undefined) =>
		!!code && hint.codes.some((c) => hasCode(c) && byCode(c).code === code);
	let warns = $derived(issues.filter((h) => h.kind === 'warn').length);
	let cautions = $derived(problems - warns);

	// the ▲ and ■ badges work like checkboxes: each shows or hides its own
	// kind, so both, either one, or neither can be on (neither: empty list)
	type IssueKind = 'warn' | 'caution';
	let showKind = $state<Record<IssueKind, boolean>>({ warn: true, caution: true });
	let tally = $derived(
		([{ kind: 'warn', n: warns, what: 'problem' }, { kind: 'caution', n: cautions, what: 'warning' }] as const).filter(
			(t) => t.n > 0
		)
	);
	const shown = (group: Group) =>
		(group.kind !== 'warn' && group.kind !== 'caution') || showKind[group.kind];

	// picking a course a hint names (the ▲ on its chip) unfolds its first —
	// worst — group and brings it into view — only on the pick itself, so a
	// group folded by hand stays folded as the plan changes around it
	$effect(() => {
		const code = plan.selected?.code;
		if (!code) return;
		untrack(() => {
			const groups = [...issueGroups, ...noteGroups];
			const hit = groups.findIndex((g) => g.hints.some((h) => names(h, code)));
			if (hit < 0) return;
			openKey = groups[hit].key;
			tick().then(() =>
				document.getElementById(`hint-detail-${hit}`)?.parentElement?.scrollIntoView({
					block: 'nearest',
					behavior: reducedMotion() ? 'auto' : 'smooth'
				})
			);
		});
	});

</script>

{#snippet hintGroup(group: Group, gi: number)}
	{@const open = openKey === group.key}
	{@const codes = group.hints.flatMap((h) => h.codes)}
	<!-- pointing at a group lights up every course it names on the grid -->
	<div
		class="chip"
		class:open
		role="group"
		onmouseenter={() => (plan.highlight = codes)}
		onmouseleave={restoreHighlight}
		onfocusin={() => (plan.highlight = codes)}
		onfocusout={restoreHighlight}
	>
		<button class="hint-heading" aria-expanded={open} aria-controls={`hint-detail-${gi}`} onclick={() => toggle(group.key, codes)}>
			<span class="hint-main">
				<span class="hint-title">
					<i class="tone-dot" data-kind={group.kind} aria-hidden="true"></i>{group.title}
				</span>
				<!-- the courses it's about, as small chips in their own colours -->
				{#if group.courses.length}
					<span class="tags">
						{#each group.courses.slice(0, TAGS_SHOWN) as code (code)}
							<span class="tag" data-type={plan.courseType(code)} style:--hue={plan.hueOf(code)}>{plan.shownCode(code)}</span>
						{/each}
						{#if group.courses.length > TAGS_SHOWN}<span class="tag-more">+{group.courses.length - TAGS_SHOWN}</span>{/if}
					</span>
				{/if}
			</span>
			<span class="chev" aria-hidden="true"></span>
		</button>
		{#if open}
			<ul class="hint-detail" id={`hint-detail-${gi}`} transition:slide={{ duration: reducedMotion() ? 0 : 210, easing: cubicOut }}>
				{#each group.hints as hint, i (hint.id ?? hint.text + i)}
					{@const target = targetOf(hint.codes)}
					<!-- the line about the course open on the right stands out -->
					<li class:here={names(hint, plan.selected?.code)}>
						{#if target}
							<button class="chip-text jump" title="show {plan.courseLabel(target)}" onclick={() => plan.revealCourse(target)}>
								{hint.text}
							</button>
						{:else}
							<!-- a click here folds the group back up, rather than starting
							     a text selection on a line that does nothing -->
							<button class="chip-text" onclick={() => toggle(group.key)}>{hint.text}</button>
						{/if}
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
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/snippet}

<div class="section">
	<h3>information</h3>

	<div class="stats">
		<!-- the whole degree as one plain count; the bars below break it down -->
		<div class="total">
			<span>total</span>
			<b>{plan.totalPlacedCredits}<em>/</em>{plan.creditTarget} cr</b>
		</div>
		<!-- planned, not earned: what stands between this plan and graduating -->
		<button
			class="readiness"
			class:clear={!problems}
			onclick={() =>
				document.querySelector('[data-tour="hints"]')?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' })}
		>
			{problems ? `${problems} planning issue${problems === 1 ? '' : 's'} to sort out ↓` : '✓ no planning issues'}
		</button>

		{#each plan.stats as s (s.role + s.subject)}
			{@const key = s.role + s.subject}
			{@const open = openProg === key}
			<div class="prog" class:open>
				<!-- a click opens what's left: required courses by name, and the
				     credits still owed to each part -->
				<button class="prog-toggle" aria-expanded={open} onclick={() => (openProg = open ? null : key)}>
					<span class="prog-name"><span>{s.label}</span><span class="muted">{s.role}<span class="chev" aria-hidden="true"></span></span></span>
					<!-- required and elective credits on one bar, split where one
					     hands over to the other -->
					<Progress
						required={{ done: s.requiredDone, needed: s.requiredNeeded }}
						elective={{ done: s.electiveDone, needed: s.electiveNeeded }}
						electiveLabel={s.subject === 'open' ? 'free courses' : 'electives'}
						hue={subjectById(s.subject).hue}
					/>
				</button>
				{#if open}
					<div class="prog-detail" transition:slide={{ duration: reducedMotion() ? 0 : 210, easing: cubicOut }}>
						{#if s.requiredNeeded > 0}
							<div class="pd-row"><span>required</span><b>{left(s.requiredDone, s.requiredNeeded)}</b></div>
							{#if s.requiredLeft.length}
								<div class="pd-tags">
									{#each s.requiredLeft as code (code)}
										<button class="tag" data-type={plan.courseType(code)} style:--hue={plan.hueOf(code)} title="show {plan.courseLabel(code)}" onclick={() => plan.revealCourse(code)}>{plan.shownCode(code)}</button>
									{/each}
								</div>
							{/if}
						{/if}
						{#if s.electiveNeeded > 0}
							<div class="pd-row"><span>{s.subject === 'open' ? 'free courses' : 'electives'}</span><b>{left(s.electiveDone, s.electiveNeeded)}</b></div>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>

{#if plan.choices.length}
	<div class="section">
		<h3>choices</h3>

		<div class="choices">
			{#each plan.choices as prog (prog.role + prog.label)}
				<!-- one block per programme; each pool says what to pick and how
				     far along the plan is -->
				<div class="choice-prog">
					<div class="choice-prog-name">{prog.label} · {prog.role}</div>
					{#each prog.groups as group, gi (group.rule + gi)}
						{@const done = group.chosen >= group.pick}
						<div class="choice" class:done>
							<div class="choice-rule">
								<span>{group.rule}</span>
								<span class="choice-count">{done ? '✓ done' : `${group.chosen} of ${group.pick}`}</span>
							</div>
							{#if group.counts !== 'required'}
								<div class="choice-note">counts toward {group.counts} credits</div>
							{/if}
							{#if group.courses.length}
								<!-- courses you can take first; the ones not in the
								     catalogue yet trail behind, dimmed -->
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
											{:else}{course.title} <em>· not offered yet</em>{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/each}
				</div>
			{/each}
		</div>
	</div>
{/if}

<div class="section" data-tour="hints">
	<h3>
		hints
		<!-- what's waiting, by severity — the same marks as the rows below -->
		{#if problems}
			<span class="tally">
				{#each tally as t (t.kind)}
					<button
						class="tally-item"
						class:off={!showKind[t.kind]}
						data-kind={t.kind}
						role="checkbox"
						aria-checked={showKind[t.kind]}
						aria-label="show {t.n} {t.what}{t.n === 1 ? '' : 's'}"
						title="{showKind[t.kind] ? 'hide' : 'show'} {t.what}s"
						onclick={() => (showKind[t.kind] = !showKind[t.kind])}
					><i class="tally-mark" data-kind={t.kind}></i>{t.n}</button>
				{/each}
			</span>
		{/if}
	</h3>

	<!-- The reference plan opens from here: this panel is where a student comes
	     when something is wrong with their plan, and "what does the department
	     suggest instead" is the next question. It opens as a window, not a
	     board mode — see ReferencePath. -->
	<div class="ref">
		<button class="ref-btn" onclick={() => (showPath = true)}>
			<span>suggested path <span aria-hidden="true">→</span></span>
		</button>
	</div>

	{#if issueGroups.length}
		<div class="chips">
			{#each issueGroups as group, gi (group.key)}
				{#if shown(group)}{@render hintGroup(group, gi)}{/if}
			{/each}
		</div>
	{:else}
		<p class="all-clear"><i class="tone-dot" data-kind="good" aria-hidden="true"></i>nothing to fix right now</p>
	{/if}

	{#if noteGroups.length}
		<div class="chips notes">
			{#each noteGroups as group, gi (group.key)}
				{@render hintGroup(group, issueGroups.length + gi)}
			{/each}
		</div>
	{/if}

	<!-- crossed-off rules: one quiet line of struck codes; a click brings
	     the hint back -->
	{#if plan.waivedHints.length}
		<div class="waived">
			<span class="waived-head">crossed off</span>
			{#each plan.waivedHints as hint (hint.id)}
				{@const target = targetOf(hint.codes)}
				<button class="wv" title="{hint.text} — click to bring it back" onclick={() => plan.unwaiveHint(hint.id!)}>
					<s>{target ? plan.shownCode(target) : heading(hint)}</s>
				</button>
			{/each}
		</div>
	{/if}
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

		// how many of the hints below need fixing, one badge per severity
		.tally {
			display: inline-flex;
			gap: 0.4rem;
		}

		.tally-item {
			display: inline-flex;
			align-items: center;
			gap: 0.4rem;
			height: 1.9rem;
			padding: 0 0.6rem;
			font-size: 1.15rem;
			font-weight: 700;
			letter-spacing: 0;
			font-family: inherit;
			border-radius: var(--rail-radius, 4px);
			box-shadow: var(--shadow-inset);
			cursor: pointer;
			transition: opacity 0.15s ease, filter 0.15s ease;

			&:hover {
				filter: brightness(0.97);
			}

			&[data-kind='warn'] {
				color: var(--color-danger-deep);
				background-color: var(--color-hint-warn);
				border: 1px solid color-mix(in srgb, var(--color-hint-warn-deep) 60%, transparent);
			}

			&[data-kind='caution'] {
				color: color-mix(in srgb, var(--color-hint-caution-deep) 55%, var(--color-text));
				background-color: var(--color-hint-caution);
				border: 1px solid color-mix(in srgb, var(--color-hint-caution-deep) 60%, transparent);
			}

			// filtered out of the list: the badge goes pale and flat
			&.off {
				opacity: 0.45;
				box-shadow: none;
			}
		}

		.tally-mark {
			@include severity-mark;
			width: 0.85rem;
			height: 0.85rem;
		}
	}

	.stats {
		padding: 0.6rem 1.6rem 1.4rem;
		font-size: var(--text-body);
		line-height: 1.5;

		.readiness {
			display: block;
			margin-top: 0.2rem;
			padding: 0;
			font: inherit;
			font-size: 1.25rem;
			text-align: left;
			color: color-mix(in srgb, var(--color-hint-warn-deep) 70%, var(--color-text));
			background: none;
			border: 0;
			cursor: pointer;

			&:hover {
				text-decoration: underline;
				text-underline-offset: 0.2em;
			}

			&.clear {
				color: var(--color-hint-good-deep);
				cursor: default;
				text-decoration: none;
			}
		}

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

		.prog-toggle {
			display: block;
			width: 100%;
			padding: 0;
			font: inherit;
			text-align: left;
			color: inherit;
			background: none;
			border: 0;
			cursor: pointer;
		}

		// subject on the left, its role pushed to the right edge
		.prog-name {
			display: flex;
			align-items: baseline;
			justify-content: space-between;
			gap: 0.8rem;
			font-weight: 700;

			.muted {
				display: inline-flex;
				align-items: center;
				gap: 0.6rem;
			}

			.chev {
				margin: -0.2rem 0 0;
			}
		}

		.prog-toggle:hover .prog-name > span:first-child {
			text-decoration: underline;
			text-underline-offset: 0.2em;
		}

		// what's left, under the bar: one line per part, required courses by name
		.prog-detail {
			display: flex;
			flex-direction: column;
			gap: 0.4rem;
			padding-top: 0.8rem;
			font-size: 1.25rem;
		}

		.pd-row {
			display: flex;
			justify-content: space-between;
			color: var(--color-text-muted);

			b {
				font-weight: 600;
				color: var(--color-text);
				font-variant-numeric: tabular-nums;
			}
		}

		.pd-tags {
			display: flex;
			flex-wrap: wrap;
			gap: 0.4rem;
			margin-bottom: 0.2rem;

			.tag {
				font-family: inherit;
				border: 0;
				cursor: pointer;
			}
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

	// each programme on its own dotted rule, like the programmes above
	.choice-prog {
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
	}

	.choice-prog + .choice-prog {
		padding-top: 1.2rem;
		border-top: 1px dotted var(--color-border-light);
	}

	.choice-prog-name {
		@include section-label;
	}

	// how far along a pool is, at the end of its rule
	.choice-count {
		flex: none;
		font-size: 1.15rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--color-text-muted);

		.done & {
			color: var(--color-hint-good-deep);
		}
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

			em {
				font-size: 1.1rem;
			}
		}
	}

	.choice-note {
		font-size: var(--text-body);
		line-height: 1.4;
		color: var(--color-text-muted);
	}

	.hint-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		width: 100%;
		padding: 0.75rem 0.6rem;
		font: inherit;
		font-weight: 500;
		text-align: left;
		color: inherit;
		background: transparent;
		border: 0;
		border-radius: var(--rail-radius, 4px);
		cursor: pointer;
		transition: background-color 0.15s ease;

		&:hover {
			background: var(--color-hover);
		}
	}

	.hint-main {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		min-width: 0;
	}

	// a wrapped heading hangs off its mark: the second line lines up with
	// the first word, not under the mark
	.hint-title {
		padding-left: 1.6rem;
		text-indent: -1.6rem;
	}

	// the courses a row is about, as tiny chips in their own colours —
	// the same fill they wear on the grid
	.tags {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		padding-left: 1.6rem;
	}

	.tag {
		padding: 0.05rem 0.5rem;
		font-size: 1.1rem;
		font-weight: 600;
		line-height: 1.5;
		color: var(--color-text);
		border-radius: 3px;
		@include course-type-fill(false);
	}

	.tag-more {
		font-size: 1.1rem;
		color: var(--color-text-muted);
	}

	.chev {
		@include fold-chevron;
		margin: 0.6rem 0.4rem 0 0;
	}

	// an open group's hints read as subtext under its heading — no box,
	// muted, indented to start where the heading's words do
	.hint-detail {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: 100%;
		margin: 0;
		padding: 0 0.6rem 1rem 2.2rem;
		list-style: none;

		li {
			display: flex;
			align-items: flex-start;
			gap: 0.6rem;
		}

		li + li {
			padding-top: 0.4rem;
		}

		// the hint about the course open on the right
		li.here .chip-text {
			color: var(--color-text);
		}
	}

	// severity rides on a small mark — its shape says how bad — not a whole
	// tinted box per hint
	.tone-dot {
		@include severity-mark;
		margin-right: 0.68rem; // mark + gap = the 1.6rem the wrapped line hangs by
		vertical-align: -0.05em;
	}

	.chips {
		display: flex;
		flex-direction: column;
		padding: 0.6rem 1rem 1.2rem;
	}

	// one row per kind of hint, on a dotted rule — a stack of tinted boxes
	// read as a wall of warnings; the mark in front carries the severity
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

		// the text fills the row beside the cross-off ×
		// (a button can't nest inside a button)
		.chip-text {
			flex: 1;
			min-width: 0;
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
	}

	// the notes under the issues: facts, not problems — quieter, so they
	// never read as a second wall of warnings
	.chips.notes {
		padding-top: 0;

		.chip {
			color: var(--color-text-muted);
		}
	}

	.all-clear {
		padding: 1.2rem 1.6rem 1.4rem;
		font-size: var(--text-body);
		color: var(--color-text-muted);
	}

	.ref {
		margin: 1rem 1.6rem 0;
	}

	.ref-btn {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
		width: 100%;
		padding: 0.7rem 1rem;
		font: inherit;
		font-size: var(--text-body);
		white-space: normal;
		text-align: left;
		color: var(--color-text);
		background-color: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 6px;
		cursor: pointer;
		@include glossy;

		> span {
			flex: 1 1 12rem;
			min-width: 0;
			overflow-wrap: anywhere;
		}
	}

	// crossed-off rules live below the live hints, quiet and struck through —
	// still visible, so a waiver is a decision the student can see and undo,
	// not a hint that silently vanished
	.waived {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2rem 0.8rem;
		padding: 0 1.6rem 1.4rem;
		font-size: 1.2rem;
		color: var(--color-text-muted);
	}

	.wv {
		padding: 0;
		font: inherit;
		color: inherit;
		background: none;
		border: 0;
		cursor: pointer;

		&:hover {
			color: var(--color-text);
		}
	}

	// by finger: each hint row a fingertip tall
	@include touch {
		.hint-heading {
			padding-top: 1.1rem;
			padding-bottom: 1.1rem;
		}
	}
</style>
