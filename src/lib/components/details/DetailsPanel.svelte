<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import CourseFaculty from './CourseFaculty.svelte';
	import { byCode, canAudit, hasCode, isCore, satisfiedBy, termsOffered } from '$lib/data';
	import { trimesterName } from '$lib/types';
	import { descriptionOf, loadDescriptions } from '$lib/descriptions.svelte';
	import { GRADE_SCALE, OTHER_MARKS, type GradeMark } from '$lib/grades';

	let { plan }: { plan: Plan } = $props();

	// only jump to codes that exist in the catalogue; others stay plain text
	function jump(code: string) {
		plan.revealCourse(code);
	}

	// descriptions ship in their own chunk. The page asks for it on idle; if a
	// course is selected before that, ask right now, whichever lands first,
	// every course fills in from then on
	$effect(() => {
		if (plan.selected) loadDescriptions();
	});

	const DESC_FOLD = 280;
	let descOpenFor = $state<string | null>(null);
	let descOpen = $derived(descOpenFor !== null && descOpenFor === plan.selected?.code);

	// ── placing it without dragging ──
	// where the course sits now, and the trimester the picker offers: its own
	// slot if it's placed, otherwise the first one it fits cleanly into
	let placedAt = $derived(plan.placed.find((p) => p.code === plan.selected?.code) ?? null);
	let target = $derived.by(() => {
		const code = plan.selected?.code;
		if (!code) return '';
		if (placedAt) return `${placedAt.year}-${placedAt.trim}`;
		for (const y of plan.years)
			for (const t of plan.trims) if (plan.canDrop(code, y, t)) return `${y}-${t}`;
		return '2-1';
	});
	function placeIt() {
		const code = plan.selected?.code;
		if (!code || !target) return;
		const [y, t] = target.split('-').map(Number);
		plan.place(code, y, t as 1 | 2 | 3);
	}

	// ── a prerequisite against the plan: placed earlier (fine), placed too
	//    late, or nowhere yet, an interchangeable course counts as placed ──
	function prereqStatus(pre: string): { kind: 'ok' | 'late' | 'missing'; text: string } {
		const options = [byCode(pre).code, ...satisfiedBy(pre)];
		const at = plan.placed.filter((p) => options.includes(p.code)).sort((a, b) => a.year - b.year || a.trim - b.trim)[0];
		if (!at) return { kind: 'missing', text: 'not on plan' };
		const where = trimesterName(at.year, at.trim);
		if (placedAt && at.year * 10 + at.trim >= placedAt.year * 10 + placedAt.trim) return { kind: 'late', text: `${where} · too late` };
		return { kind: 'ok', text: `✓ ${where}` };
	}

	// shut on Esc, unless a dialog is open, which Esc closes first
	function onkey(e: KeyboardEvent) {
		if (e.key === 'Escape' && plan.selected && !document.querySelector('.backdrop'))
			plan.selected = null;
	}
</script>

<svelte:window onkeydown={onkey} />

<header class="col-header">
	<h2>course</h2>
	{#if plan.selected}
		<button
			class="close"
			aria-label="close course details"
			title="close (Esc)"
			onclick={() => (plan.selected = null)}>×</button
		>
	{/if}
</header>
{#if plan.selected}
	{@const c = plan.selected}
	{@const ran = termsOffered(c.code)}
	{@const desc = descriptionOf(c.code)}
	<div class="details">
		<div class="d-head">
			{#if plan.showCodes}<span class="d-code">{c.code}</span>{/if}
			<span class="d-title">{c.title}</span>
			{#if plan.showCodes && c.codes.length > 1}
				<span class="d-xlist"
					>cross-listed as {c.codes.filter((x) => x !== c.code).join(' · ')}</span
				>
			{/if}
		</div>

		{#if c.pendingCredits && c.credits === 0}<p class="d-no-audit">
				Offered in T2. Credits and prerequisites were not supplied; confirm these in admin before
				planning this course.
			</p>{/if}
		<div class="d-meta">
			<div class="d-stat">
				<span class="d-stat-label">credits</span>
				<span class="d-stat-value">{c.pendingCredits && c.credits === 0 ? 'TBC' : c.credits}</span>
			</div>
			<div class="d-stat">
				<span class="d-stat-label">offered</span>
				<span class="d-stat-value">{c.offered.map((t) => `t${t}`).join(' ') || '–'}</span>
				{#if ran.length}<span class="d-stat-sub" title="every term it ran: {ran.join(', ')}">last {ran[0]}</span>{/if}
			</div>
			<div class="d-stat">
				<span class="d-stat-label">type</span>
				<span class="d-stat-value">{plan.courseType(c.code)}</span>
			</div>
		</div>

		<!-- what it needs and what it opens up, the planning decisions, come
		     before the controls and the prose; each prerequisite says where it
		     is on the plan -->
		{#if c.prereqs.length}
			<div class="label">needs first</div>
			<div class="d-chips">
				{#each c.prereqs as p (p)}
					{#if hasCode(p)}
						{@const status = prereqStatus(p)}
						<button class="d-chip" data-status={status.kind} onclick={() => jump(p)}>
							{plan.courseLabel(p)}<span class="d-chip-status">{status.text}</span>
						</button>
					{:else}
						<span class="d-chip" data-status="missing">{p}<span class="d-chip-status">not in the catalogue</span></span>
					{/if}
				{/each}
			</div>
		{/if}

		{#if c.unlocks.some(hasCode)}
			<div class="label">unlocks</div>
			<div class="d-chips">
				{#each c.unlocks.filter(hasCode) as u (u)}
					<button class="d-chip" onclick={() => jump(u)}>{plan.courseLabel(u)}</button>
				{/each}
			</div>
		{/if}

		<!-- where it is on the plan, and a way to put it there without
		     dragging, keyboard, touch, or just quicker -->
		<div class="d-place">
			<span class="d-place-where">
				{#if placedAt}on your plan in <b>{trimesterName(placedAt.year, placedAt.trim)}</b>{:else}not on
					your plan yet{/if}
			</span>
			<div class="d-place-row">
				<select bind:value={target} aria-label="trimester to put {c.code} in">
					{#each plan.years as y (y)}
						{#each plan.trims as t (t)}
							<option value="{y}-{t}" disabled={plan.coreOnly(y, t) && !isCore(c.code)}>
								{trimesterName(y, t)}{c.offered.length && !c.offered.includes(t) ? ' (not offered)' : ''}
							</option>
						{/each}
					{/each}
				</select>
				<button
					class="d-place-go"
					disabled={!!placedAt && target === `${placedAt.year}-${placedAt.trim}`}
					onclick={placeIt}>{placedAt ? 'move' : 'add to plan'}</button
				>
				{#if placedAt}
					<button class="d-place-remove" onclick={() => plan.remove(c.code)}>remove</button>
				{/if}
			</div>
		</div>

		{#if plan.placedCodes.has(c.code)}
			{#if plan.gradeMode}
				<!-- grade dropdown: letters count toward CGPA, Withdrawn / Incomplete
				     don't. Hidden while auditing, since an audit carries no grade. -->
				{#if !plan.isAudit(c.code)}
					<label class="d-grade">
						<span>grade</span>
						<select
							value={plan.gradeOf(c.code) ?? ''}
							onchange={(e) =>
								plan.setGrade(c.code, (e.currentTarget.value || null) as GradeMark | null)}
						>
							<option value="">not graded</option>
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
				{/if}
				<!-- audit sits under the grade, taking a course off the CGPA -->
				{#if canAudit(c.code)}
					<label class="d-audit">
						<input
							type="checkbox"
							checked={plan.isAudit(c.code)}
							onchange={() => {
								plan.toggleAudit(c.code);
								if (plan.isAudit(c.code)) plan.setGrade(c.code, null);
							}}
						/>
						<span>I'm taking this as an audit</span>
					</label>
				{/if}
			{:else if canAudit(c.code)}
				<label class="d-audit">
					<input
						type="checkbox"
						checked={plan.isAudit(c.code)}
						onchange={() => plan.toggleAudit(c.code)}
					/>
					<span>I'm taking this as an audit</span>
				</label>
			{:else}
				<!-- drop-form rule: audits are 2/4-credit courses, never KCCS/391/490/491 -->
				<p class="d-no-audit">this course can't be taken as an audit</p>
			{/if}
		{/if}

		{#if desc}
			{@const long = desc.length > DESC_FOLD}
			<div class="label">about</div>
			<div class="d-desc">
				<p class:folded={long && !descOpen}>{desc}</p>
				{#if long}
					<button
						class="d-more"
						aria-expanded={descOpen}
						onclick={() => (descOpenFor = descOpen ? null : c.code)}
					>
						{descOpen ? 'read less' : 'read more'}
					</button>
				{/if}
			</div>
		{/if}

		<CourseFaculty {plan} course={c} />

	</div>
{:else}
	<!-- the column a first-timer sees empty: how the planner works, and what
	     the little marks on the courses mean -->
	<div class="d-empty">
		<p>pick a course on the grid or in the catalogue to see it here.</p>

		<div class="label">how it works</div>
		<ul class="guide">
			<li><b>drag</b> a course from the catalogue onto a trimester, or between trimesters</li>
			<li><b>click a trimester</b> on the grid to zoom in on it</li>
			<li>
				<b>hints</b> on the left flag anything that breaks a rule, click one to find its course
			</li>
			<li><b>grade view</b>, above the grid, turns the plan into your transcript</li>
		</ul>

		<div class="label">reading the marks</div>
		<ul class="marks">
			<li><span class="m-dot" aria-hidden="true"></span>required by your programme</li>
			<li>
				<span class="m-mark" data-kind="warn" aria-hidden="true"></span>breaks a rule, a
				prerequisite out of order, say
			</li>
			<li>
				<span class="m-mark" data-kind="caution" aria-hidden="true"></span>worth a look, under the
				credit minimum, say
			</li>
			<li>
				<span class="m-mark" data-kind="info" aria-hidden="true"></span>a note, counts on the
				transcript only, say
			</li>
		</ul>
	</div>
{/if}

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.col-header {
		@include card-header;
		justify-content: space-between;
		border-bottom: 1px solid var(--color-border);

		h2 {
			font-size: 1.8rem;
			font-weight: 600;
			color: var(--color-text);
		}
	}

	.d-empty {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		padding: 1.6rem;
		font-size: var(--text-body);
		line-height: 1.5;
		color: var(--color-text-muted);

		.label {
			@include section-label;
			margin-top: 0.8rem;
			padding-top: 1rem;
			border-top: 1px dotted var(--color-border-light);
		}

		ul {
			display: flex;
			flex-direction: column;
			gap: 0.6rem;
			margin: 0;
			padding: 0;
			list-style: none;
		}

		b {
			color: var(--color-text);
		}

		.marks li {
			display: flex;
			align-items: baseline;
			gap: 0.8rem;
		}
	}

	.m-dot {
		@include required-dot;
		align-self: center;
	}

	.m-mark {
		@include severity-mark;
		align-self: center;
	}

	.close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.8rem;
		height: 2.8rem;
		font-size: 2.2rem;
		line-height: 1;
		color: var(--color-text-muted);
		background: none;
		border: none;
		border-radius: 4px;
		cursor: pointer;

		&:hover {
			color: var(--color-text);
			background: var(--color-hover-medium);
		}
	}

	.d-place {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 1rem 1.2rem;
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-divider);
		border-radius: 6px;
	}

	.d-place-where {
		font-size: 1.3rem;
		color: var(--color-text-muted);

		b {
			font-weight: 700;
			color: var(--color-text);
		}
	}

	.d-place-row {
		display: flex;
		gap: 0.6rem;

		select {
			flex: 1;
			min-width: 0;
			padding: 0.5rem 0.6rem;
			font: inherit;
			font-size: 1.3rem;
			color: var(--color-text);
			background-color: var(--color-bg-light);
			border: 1px solid var(--color-border-card);
			border-radius: 4px;
			box-shadow: var(--shadow-well);
		}
	}

	.d-place-go {
		padding: 0.5rem 1.2rem;
		font: inherit;
		font-size: 1.3rem;
		font-weight: 600;
		color: var(--color-on-accent);
		background-color: var(--color-accent);
		border: 1px solid var(--color-control-deep);
		border-radius: 4px;
		cursor: pointer;
		@include glossy-accent;

		&:disabled {
			opacity: 0.6;
			cursor: default;
		}
	}

	.d-place-remove {
		padding: 0.5rem 1rem;
		font: inherit;
		font-size: 1.3rem;
		@include store-button;
	}

	.details {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		padding: 1.4rem;

		.label {
			@include section-label;
			margin-top: 0.6rem;
		}
	}

	.d-head {
		display: flex;
		flex-direction: column;
		justify-content: center;
		// reserve room for a two-line title so a one-line course doesn't shrink
		// the box and shove everything below it up and down between selections
		min-height: 9rem;
		@include card;

		.d-code {
			font-size: 1.8rem;
			font-weight: 700;
		}

		.d-title {
			font-size: 1.4rem;
			line-height: 1.35;
		}

		.d-xlist {
			margin-top: 0.4rem;
			font-size: 1.2rem;
			font-weight: 600;
			color: var(--color-text-muted);
		}
	}

	.d-meta {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.8rem;
	}

	.d-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		// a fixed height so credits / offered / type stay the same size box no
		// matter how long their value is, the panel doesn't jump between courses
		min-height: 5.6rem;
		padding: 0.6rem 0.4rem;
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 4px;
		@include card-shine;

		.d-stat-label {
			font-size: 1.1rem;
			color: var(--color-text-muted);
			text-transform: uppercase;
			letter-spacing: 0.05em;
		}

		.d-stat-value {
			font-size: 1.5rem;
			font-weight: 700;
			white-space: nowrap; // "t1 t2 t3" / "elective" never wrap to a 2nd line
		}

		// when it last ran, under the trimesters it runs in
		.d-stat-sub {
			font-size: 1.05rem;
			color: var(--color-text-muted);
			white-space: nowrap;
		}
	}

	// SMS-bar: two flush segments in one tray, with a little retro depth, a
	// beveled tray, a lit groove between, and a recessed field
	.d-grade {
		display: flex;
		align-items: stretch;
		overflow: hidden;
		min-height: 3.6rem;
		background: linear-gradient(
			to bottom,
			var(--color-bg-card-start) 0%,
			var(--color-bg-card-end) 100%
		);
		border: 1px solid var(--color-border-card);
		border-radius: 9px;
		box-shadow: var(--shadow-inset);

		// the label segment, flush to the left edge
		span {
			flex-shrink: 0;
			display: flex;
			align-items: center;
			padding: 0 1.1rem;
			font-size: 1.05rem;
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0.06em;
			color: var(--color-text-muted);
			// beveled groove: a shade then a lit edge
			border-right: 1px solid var(--color-border-card);
			box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.55);
		}

		// the recessed field, filling the rest
		select {
			flex: 1;
			min-width: 0;
			padding: 0 0.9rem;
			font-size: 1.35rem;
			font-weight: 600;
			color: var(--color-text);
			background: var(--color-bg-light);
			border: none;
			box-shadow: var(--shadow-well);
			cursor: pointer;
		}
	}

	.d-audit {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 1.3rem;
		color: var(--color-text);
		cursor: pointer;

		input {
			@include tick(1.5rem);
		}
	}

	.d-no-audit {
		@include empty-text;
	}

	.d-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.d-chip {
		display: inline-flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.5rem 1rem;
		font-size: 1.3rem;
		font-weight: 600;
		color: var(--color-text);
		background-color: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 5px;
		text-align: left;
		cursor: pointer;
		@include glossy;
		// keep the lit face, drop only the outer shadow
		box-shadow: var(--shadow-inset);
		&:hover {
			box-shadow: var(--shadow-inset-hover);
		}

		// where the prerequisite stands, in words, with colour as a second cue
		.d-chip-status {
			font-size: 1.1rem;
			font-weight: 500;
			color: var(--color-text-muted);
		}

		&[data-status='ok'] .d-chip-status {
			color: var(--color-hint-good-deep);
		}

		&[data-status='late'] {
			border-color: var(--color-danger);

			.d-chip-status {
				color: var(--color-danger);
				font-weight: 600;
			}
		}

		&[data-status='missing'] .d-chip-status {
			color: color-mix(in srgb, var(--color-hint-caution-deep) 65%, var(--color-text));
		}
	}

	.d-desc {
		font-size: 1.3rem;
		line-height: 1.55;
		padding: 1rem 1.2rem;
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-divider);
		border-radius: 4px;

		.folded {
			display: -webkit-box;
			-webkit-line-clamp: 5;
			line-clamp: 5;
			-webkit-box-orient: vertical;
			overflow: hidden;
		}
	}

	.d-more {
		margin-top: 0.4rem;
		padding: 0;
		font: inherit;
		color: var(--color-accent);
		background: none;
		border: 0;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 0.2em;

		&:hover {
			color: var(--color-text);
		}
	}
	// by finger (a tablet's slid-in details too): the close and placing
	// controls a fingertip tall
	@include touch {
		.close {
			width: 4.4rem;
			height: 4.4rem;
			font-size: 2.6rem;
		}
		.d-place-go,
		.d-place-remove,
		.d-place-row select {
			min-height: 4.4rem;
		}
		.d-more {
			padding-top: 1rem;
			padding-bottom: 1rem;
		}
	}
	@include mobile {
		.col-header {
			position: sticky;
			top: 0;
			z-index: 2;
			flex-shrink: 0;
			background: var(--color-bg-sidebar);
			padding: 0.8rem 1.8rem;
		}
		.close {
			width: 4.4rem;
			height: 4.4rem;
			font-size: 2.6rem;
		}
		.details {
			padding: 1.8rem;
			gap: 1.6rem;
		}
		.d-head .d-title {
			font-size: 2.4rem;
			line-height: 1.3;
		}
		.d-desc,
		.d-place-where,
		.d-audit {
			font-size: 1.5rem;
		}
		.d-place-row {
			flex-wrap: wrap;
		}
		.d-place-row select {
			flex: 1 0 100%;
			width: 100%;
		}
		.d-place-go {
			flex: 1;
		}
		.d-place-remove {
			padding: 0.8rem 1.6rem;
		}
		.d-more {
			padding-top: 1rem;
			padding-bottom: 1rem;
		}
	}
</style>
