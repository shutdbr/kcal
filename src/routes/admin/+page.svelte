<script lang="ts">
	// ─────────────────────────────────────────────
	// Prerequisite editor.
	//
	// Three columns, so a whole department can be worked through without ever
	// losing your place: pick a subject → pick a course → edit its edges. The
	// edit is a full replacement of that course's prerequisite list (see
	// prereqEdits.ts); the shipped list stays visible next to it so it is
	// always clear what was changed and what it was changed from.
	// ─────────────────────────────────────────────
	import { COURSES, SUBJECTS, byCode, hasCode } from '$lib/data';
	import {
		loadPrereqEdits,
		savePrereqEdits,
		parsePrereqEdits,
		type PrereqEdits
	} from '$lib/prereqEdits';
	import shippedCourses from '$lib/data/courses.json';

	// what the build shipped, before any edit — the "was" column, and what
	// "revert" restores. Read straight from the generated file so it can't
	// drift from what the pipeline produced.
	const shipped: Record<string, string[]> = Object.fromEntries(
		Object.entries((shippedCourses as { courses: Record<string, { prereqs: string[] }> }).courses).map(
			([code, c]) => [code, c.prereqs ?? []]
		)
	);

	let edits = $state<PrereqEdits>({});
	// the live prereq list for a course: the edit if there is one, else shipped
	const prereqsOf = (code: string): string[] => edits[code] ?? shipped[code] ?? [];
	const isEdited = (code: string) => code in edits;

	$effect(() => {
		edits = loadPrereqEdits();
	});

	// COURSES is already filtered to what the planner can actually place, which
	// is the graph worth editing — a 500-level course nobody can take is noise
	const sorted = [...COURSES].sort((a, b) => a.code.localeCompare(b.code));
	const subjects = SUBJECTS.filter((s) => s.id !== 'open').sort((a, b) => a.label.localeCompare(b.label));

	let subject = $state<string>('all');
	let search = $state('');
	let selectedCode = $state<string | null>(null);
	let onlyEdited = $state(false);

	let listed = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return sorted.filter((c) => {
			if (subject !== 'all' && !c.subjects.includes(subject)) return false;
			if (onlyEdited && !isEdited(c.code)) return false;
			if (!q) return true;
			return c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q);
		});
	});

	let selected = $derived(selectedCode && hasCode(selectedCode) ? byCode(selectedCode) : null);

	// ── the edit itself ──
	function setPrereqs(code: string, list: string[]) {
		const clean = [...new Set(list.filter((p) => hasCode(p) && p !== code))].sort();
		const base = [...(shipped[code] ?? [])].sort();
		// an edit that lands back on the shipped list is not an edit — drop the
		// key so the course stops reading as overridden
		const same = clean.length === base.length && clean.every((p, i) => p === base[i]);
		const next = { ...edits };
		if (same) delete next[code];
		else next[code] = clean;
		edits = next;
		savePrereqEdits(edits);
	}

	const addPrereq = (code: string, pre: string) => setPrereqs(code, [...prereqsOf(code), pre]);
	const dropPrereq = (code: string, pre: string) =>
		setPrereqs(
			code,
			prereqsOf(code).filter((p) => p !== pre)
		);

	function revert(code: string) {
		const next = { ...edits };
		delete next[code];
		edits = next;
		savePrereqEdits(edits);
	}

	// ── the "add a prerequisite" picker ──
	let addQuery = $state('');
	let addOpen = $state(false);
	let addCandidates = $derived.by(() => {
		if (!selected) return [];
		const q = addQuery.trim().toLowerCase();
		const already = new Set(prereqsOf(selected.code));
		return sorted
			.filter((c) => c.code !== selected!.code && !already.has(c.code))
			.filter((c) => !q || c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))
			.slice(0, 40);
	});

	// ── cycles ──
	// A cycle can't be scheduled: every course in it would wait forever for the
	// one before it, so the seeder silently leaves them all off the plan. Cheap
	// to check on every edit and the only way an edit can break the planner, so
	// it is checked here rather than discovered on the board.
	let cycles = $derived.by(() => {
		const state = new Map<string, 0 | 1 | 2>(); // unseen / on-stack / done
		const found: string[][] = [];
		const stack: string[] = [];
		const walk = (code: string) => {
			const s = state.get(code);
			if (s === 2) return;
			if (s === 1) {
				found.push([...stack.slice(stack.indexOf(code)), code]);
				return;
			}
			state.set(code, 1);
			stack.push(code);
			for (const p of prereqsOf(code)) if (hasCode(p)) walk(p);
			stack.pop();
			state.set(code, 2);
		};
		for (const c of sorted) walk(c.code);
		return found;
	});

	let editCount = $derived(Object.keys(edits).length);

	// ── export / import ──
	function exportEdits() {
		const blob = new Blob([JSON.stringify(edits, null, '\t')], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = 'tracey-prereq-edits.json';
		a.click();
		URL.revokeObjectURL(a.href);
	}

	let importEl: HTMLInputElement;
	async function importEdits(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			edits = parsePrereqEdits(JSON.parse(await file.text()));
			savePrereqEdits(edits);
		} catch {
			alert('that file is not readable prerequisite-edit JSON');
		}
		importEl.value = '';
	}

	let clearing = $state(false);
	let clearTimer: ReturnType<typeof setTimeout>;
	function clearAll() {
		if (!clearing) {
			clearing = true;
			clearTimer = setTimeout(() => (clearing = false), 4000);
			return;
		}
		clearTimeout(clearTimer);
		clearing = false;
		edits = {};
		savePrereqEdits(edits);
	}
</script>

<div class="admin">
	<!-- ── subjects + course list ── -->
	<aside class="col courses">
		<div class="col-head">
			<input class="search" type="search" placeholder="code or title" bind:value={search} />
			<select bind:value={subject}>
				<option value="all">all subjects</option>
				{#each subjects as s (s.id)}
					<option value={s.id}>{s.label}</option>
				{/each}
			</select>
			<label class="only-edited">
				<input type="checkbox" bind:checked={onlyEdited} />
				<span>edited only</span>
			</label>
		</div>

		<div class="list">
			{#each listed as c (c.code)}
				<button
					class="row"
					class:on={c.code === selectedCode}
					class:edited={isEdited(c.code)}
					onclick={() => {
						selectedCode = c.code;
						addQuery = '';
						addOpen = false;
					}}
				>
					<span class="r-code">{c.code}</span>
					<span class="r-title">{c.title}</span>
					<span class="r-n" title="{prereqsOf(c.code).length} prerequisites"
						>{prereqsOf(c.code).length || '·'}</span
					>
				</button>
			{:else}
				<p class="empty">no courses match</p>
			{/each}
		</div>
		<div class="col-foot">{listed.length} of {sorted.length} courses</div>
	</aside>

	<!-- ── the editor ── -->
	<section class="col editor">
		{#if !selected}
			<p class="empty pad">pick a course on the left to edit its prerequisites</p>
		{:else}
			{@const code = selected.code}
			<div class="e-head">
				<div>
					<h1>{code} <span class="e-title">{selected.title}</span></h1>
					<p class="e-meta">
						{selected.credits} cr · years {selected.eligibleYears.join('/') || '—'} · offered t{selected.offered.join(
							'/t'
						) || '—'} · {selected.subjects.join(', ')}
					</p>
				</div>
				{#if isEdited(code)}
					<button class="revert" onclick={() => revert(code)}>revert to source</button>
				{/if}
			</div>

			<div class="e-body">
				<div class="e-block">
					<h2>prerequisites</h2>
					<p class="e-note">
						must be completed in an <b>earlier</b> trimester. This list replaces the generated one
						outright — an empty list means "no prerequisites", and is itself an edit.
					</p>

					<div class="chips">
						{#each prereqsOf(code) as pre (pre)}
							<span class="chip" class:missing={!hasCode(pre)}>
								<span class="c-code">{pre}</span>
								{#if hasCode(pre)}<span class="c-title">{byCode(pre).title}</span>{:else}<span
										class="c-title">not in this catalogue</span
									>{/if}
								<button class="c-x" aria-label="remove {pre}" onclick={() => dropPrereq(code, pre)}>×</button
								>
							</span>
						{:else}
							<span class="none">no prerequisites</span>
						{/each}
					</div>

					<div class="adder">
						<button class="add-btn" onclick={() => (addOpen = !addOpen)}>
							{addOpen ? 'close' : '+ add a prerequisite'}
						</button>
						{#if addOpen}
							<div class="add-panel">
								<input
									class="search"
									type="search"
									placeholder="search all courses"
									bind:value={addQuery}
								/>
								<div class="add-list">
									{#each addCandidates as c (c.code)}
										<button
											class="row"
											onclick={() => {
												addPrereq(code, c.code);
												addQuery = '';
											}}
										>
											<span class="r-code">{c.code}</span>
											<span class="r-title">{c.title}</span>
										</button>
									{:else}
										<p class="empty">nothing matches</p>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				</div>

				<div class="e-block">
					<h2>generated by the pipeline</h2>
					<p class="e-note">what misc/generate.py read out of the term CSVs for this course.</p>
					<div class="chips ghost">
						{#each shipped[code] ?? [] as pre (pre)}
							<span class="chip">
								<span class="c-code">{pre}</span>
								<span class="c-title">{hasCode(pre) ? byCode(pre).title : 'not in this catalogue'}</span>
							</span>
						{:else}
							<span class="none">none</span>
						{/each}
					</div>
				</div>

				<div class="e-block">
					<h2>unlocks</h2>
					<p class="e-note">
						courses that name {code} as a prerequisite — edit those courses to change this.
					</p>
					<div class="chips ghost">
						{#each sorted.filter((c) => prereqsOf(c.code).includes(code)) as c (c.code)}
							<button class="chip link" onclick={() => (selectedCode = c.code)}>
								<span class="c-code">{c.code}</span>
								<span class="c-title">{c.title}</span>
							</button>
						{:else}
							<span class="none">nothing depends on this course</span>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</section>

	<!-- ── edit set: status, cycles, export ── -->
	<aside class="col side">
		<div class="col-head single">
			<strong>{editCount} edited course{editCount === 1 ? '' : 's'}</strong>
		</div>

		<div class="side-body">
			{#if cycles.length}
				<div class="alarm">
					<strong>{cycles.length} prerequisite cycle{cycles.length === 1 ? '' : 's'}</strong>
					<p>
						A course inside a cycle can never be scheduled — it waits on something that waits on it —
						so the seeder leaves every course in the loop off the plan. Break each one.
					</p>
					{#each cycles as cyc, i (i)}
						<button class="cyc" onclick={() => (selectedCode = cyc[0])}>{cyc.join(' → ')}</button>
					{/each}
				</div>
			{/if}

			{#if editCount}
				<div class="edited-list">
					{#each Object.keys(edits).sort() as code (code)}
						<button class="row" class:on={code === selectedCode} onclick={() => (selectedCode = code)}>
							<span class="r-code">{code}</span>
							<span class="r-title">
								{(shipped[code] ?? []).join(', ') || '—'} → {edits[code].join(', ') || '—'}
							</span>
						</button>
					{/each}
				</div>
			{:else}
				<p class="empty pad">no edits yet — the graph is exactly what the pipeline generated.</p>
			{/if}
		</div>

		<div class="side-foot">
			<p class="note">
				Edits are saved in this browser and applied everywhere on the next load — the planner, the
				hints, the seeder and the tree all read the same graph. Export to fold them back into
				misc/generate.py.
			</p>
			<div class="acts">
				<button onclick={exportEdits} disabled={!editCount}>export json</button>
				<button onclick={() => importEl.click()}>import</button>
				<button class="danger" class:confirming={clearing} onclick={clearAll} disabled={!editCount}>
					{clearing ? 'sure?' : 'clear all'}
				</button>
			</div>
			<button class="reload" onclick={() => location.reload()}>reload to apply</button>
			<input
				bind:this={importEl}
				type="file"
				accept="application/json"
				onchange={importEdits}
				hidden
			/>
		</div>
	</aside>
</div>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.admin {
		display: grid;
		grid-template-columns: 32rem 1fr 34rem;
		height: 100%;
		background: var(--color-bg);
	}

	.col {
		display: flex;
		flex-direction: column;
		min-height: 0;
		border-right: 1px solid var(--color-border-light);

		&:last-child {
			border-right: 0;
			border-left: 1px solid var(--color-border-light);
		}
	}

	.col-head {
		display: grid;
		gap: 0.6rem;
		padding: 1rem;
		background: var(--color-bg-sidebar);
		border-bottom: 1px solid var(--color-border-light);

		&.single {
			font-size: 1.3rem;
			color: var(--color-text);
		}
	}

	.col-foot {
		padding: 0.6rem 1rem;
		font-size: 1.1rem;
		color: var(--color-text-muted);
		border-top: 1px solid var(--color-border-light);
	}

	.search,
	select {
		width: 100%;
		padding: 0.5rem 0.7rem;
		font: inherit;
		font-size: 1.25rem;
		color: var(--color-text);
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 5px;
	}

	.only-edited {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1.2rem;
		color: var(--color-text-muted);
		cursor: pointer;
	}

	.list,
	.add-list,
	.edited-list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	// one course per line: code, title, and how many edges it carries
	.row {
		display: grid;
		grid-template-columns: 7.5rem 1fr auto;
		align-items: baseline;
		gap: 0.8rem;
		width: 100%;
		padding: 0.5rem 1rem;
		font: inherit;
		font-size: 1.2rem;
		text-align: left;
		color: var(--color-text);
		background: none;
		border: 0;
		border-bottom: 1px solid var(--color-border-light);
		cursor: pointer;

		&:hover {
			background: var(--color-hover-medium);
		}

		&.on {
			background: var(--color-bg-warm-start);
		}

		// an overridden course is marked in the list, so a department can be
		// scanned for what has already been touched
		&.edited .r-code::after {
			content: '•';
			margin-left: 0.4rem;
			color: var(--color-accent);
		}

		.r-code {
			font-weight: 700;
		}

		.r-title {
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
			color: var(--color-text-muted);
		}

		.r-n {
			font-variant-numeric: tabular-nums;
			color: var(--color-text-muted);
		}
	}

	.empty {
		@include empty-text;

		&.pad {
			padding: 2.4rem 1.6rem;
		}
	}

	// ── editor ──
	.editor {
		overflow-y: auto;
	}

	.e-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1.6rem;
		padding: 1.6rem 2rem;
		border-bottom: 1px solid var(--color-border-light);

		h1 {
			font-size: 1.8rem;
			font-weight: 700;
			color: var(--color-text);
		}

		.e-title {
			font-weight: 400;
			color: var(--color-text-muted);
		}

		.e-meta {
			margin-top: 0.3rem;
			font-size: 1.2rem;
			color: var(--color-text-muted);
		}
	}

	.revert,
	.add-btn,
	.reload,
	.acts button {
		padding: 0.5rem 1.1rem;
		font: inherit;
		font-size: 1.2rem;
		color: var(--color-text);
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 5px;
		cursor: pointer;

		&:hover:not(:disabled) {
			background: var(--color-hover-medium);
		}

		&:disabled {
			opacity: 0.45;
			cursor: default;
		}
	}

	.e-body {
		padding: 1.6rem 2rem 3rem;
	}

	.e-block + .e-block {
		margin-top: 2.4rem;
		padding-top: 1.6rem;
		border-top: 1px solid var(--color-border-light);
	}

	.e-block h2 {
		@include section-label;
	}

	.e-note {
		margin: 0.3rem 0 1rem;
		font-size: 1.2rem;
		line-height: 1.5;
		color: var(--color-text-muted);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.chip {
		display: inline-flex;
		align-items: baseline;
		gap: 0.6rem;
		padding: 0.45rem 0.5rem 0.45rem 0.8rem;
		font-size: 1.2rem;
		color: var(--color-text);
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 5px;

		.c-code {
			font-weight: 700;
		}

		.c-title {
			max-width: 26rem;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
			color: var(--color-text-muted);
		}

		.c-x {
			padding: 0 0.4rem;
			font-size: 1.4rem;
			line-height: 1;
			color: var(--color-text-muted);
			background: none;
			border: 0;
			cursor: pointer;

			&:hover {
				color: var(--color-danger);
			}
		}

		// an edge pointing at a code this build has no course for — kept and
		// flagged rather than dropped, since it is exactly the kind of thing
		// this page exists to find
		&.missing {
			border-color: var(--color-danger);
		}

		&.link {
			font: inherit;
			font-size: 1.2rem;
			cursor: pointer;

			&:hover {
				background: var(--color-hover-medium);
			}
		}
	}

	.chips.ghost .chip {
		background: none;
		border-style: dashed;
	}

	.none {
		font-size: 1.2rem;
		font-style: italic;
		color: var(--color-text-muted);
	}

	.adder {
		margin-top: 1rem;
	}

	.add-panel {
		margin-top: 0.8rem;
		border: 1px solid var(--color-border-card);
		border-radius: 6px;
		overflow: hidden;

		.search {
			border: 0;
			border-bottom: 1px solid var(--color-border-light);
			border-radius: 0;
		}

		.add-list {
			max-height: 28rem;
		}

		.row {
			grid-template-columns: 7.5rem 1fr;
		}
	}

	// ── side ──
	.side-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.alarm {
		margin: 1rem;
		padding: 1rem 1.2rem;
		background: var(--color-hint-warn);
		border: 1px solid var(--color-hint-warn-deep);
		border-radius: 6px;

		strong {
			font-size: 1.3rem;
			color: var(--color-text);
		}

		p {
			margin: 0.4rem 0 0.8rem;
			font-size: 1.15rem;
			line-height: 1.5;
			color: var(--color-text);
		}
	}

	.cyc {
		display: block;
		width: 100%;
		margin-top: 0.3rem;
		padding: 0.4rem 0.6rem;
		font: inherit;
		font-size: 1.15rem;
		text-align: left;
		color: var(--color-text);
		background: var(--color-bg-light);
		border: 1px solid var(--color-hint-warn-deep);
		border-radius: 4px;
		cursor: pointer;
	}

	.edited-list .row {
		grid-template-columns: 7.5rem 1fr;
	}

	.side-foot {
		padding: 1rem;
		border-top: 1px solid var(--color-border-light);

		.note {
			font-size: 1.1rem;
			line-height: 1.5;
			color: var(--color-text-muted);
		}
	}

	.acts {
		display: flex;
		gap: 0.6rem;
		margin-top: 0.8rem;

		button {
			flex: 1;
		}
	}

	.danger.confirming {
		color: var(--color-on-accent);
		background: var(--color-danger);
		border-color: var(--color-danger-deep);
	}

	.reload {
		width: 100%;
		margin-top: 0.6rem;
	}
</style>
