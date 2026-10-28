<script lang="ts">
	// ─────────────────────────────────────────────
	// Prerequisite tree for one programme.
	//
	// The planner enforces prerequisite order one course at a time; this is the
	// same graph seen whole, so a chain that has grown too long for the degree
	// (or an edge pointing the wrong way) shows up at a glance.
	//
	// Layout is computed, never measured: a node's column is its longest
	// prerequisite chain — "how many trimesters must come before this" — and
	// its row is picked to sit near its prerequisites. Because both are known
	// numbers, edge endpoints are exact and the SVG needs no DOM reading.
	// ─────────────────────────────────────────────
	import {
		MAJOR_SUBJECTS,
		PROGRAMME_SUBJECTS,
		byCode,
		electiveSetFor,
		hasCode,
		pickSetFor,
		requiredSetFor,
		subjectById
	} from '$lib/data';
	import type { ProgrammeRole } from '$lib/types';

	let subject = $state('mathematics');
	let role = $state<ProgrammeRole>('major');
	let fourYear = $state(true);
	let withElectives = $state(false);
	let hovered = $state<string | null>(null);

	let subjectOpts = $derived(role === 'major' ? MAJOR_SUBJECTS : PROGRAMME_SUBJECTS);

	// keep the subject valid when the role narrows the list (arts is a minor only)
	$effect(() => {
		if (!subjectOpts.some((s) => s.id === subject)) subject = subjectOpts[0].id;
	});

	// ── the programme's course set ──
	// required + the 'choose N from' pools, which are required choices; the
	// elective pool is opt-in because for a big department it is most of the
	// catalogue and buries the spine of the degree
	let core = $derived.by(() => {
		const set = new Set<string>();
		for (const c of requiredSetFor(subject, role, fourYear, false)) if (hasCode(c)) set.add(c);
		for (const c of pickSetFor(subject, role, fourYear, false)) if (hasCode(c)) set.add(c);
		return set;
	});
	let electives = $derived.by(() => {
		const set = new Set<string>();
		if (!withElectives) return set;
		for (const c of electiveSetFor(subject, role, fourYear, false)) if (hasCode(c) && !core.has(c)) set.add(c);
		return set;
	});

	// Prerequisites that sit OUTSIDE the programme are pulled in as ghost
	// nodes: a chain that silently stops at the department boundary reads as a
	// course with no prerequisites, which is the opposite of true.
	let graph = $derived.by(() => {
		const inProgramme = new Set([...core, ...electives]);
		const nodes = new Set(inProgramme);
		const queue = [...inProgramme];
		while (queue.length) {
			const code = queue.pop()!;
			for (const pre of byCode(code).prereqs) {
				if (!hasCode(pre) || nodes.has(pre)) continue;
				nodes.add(pre);
				queue.push(pre);
			}
		}
		// edges kept only between nodes we are drawing
		const prereqs = new Map<string, string[]>();
		const unlocks = new Map<string, string[]>();
		for (const code of nodes) {
			const ps = byCode(code).prereqs.filter((p) => nodes.has(p));
			prereqs.set(code, ps);
			for (const p of ps) unlocks.set(p, [...(unlocks.get(p) ?? []), code]);
		}
		return { nodes, prereqs, unlocks, inProgramme };
	});

	// Two ways to read a degree as a progression, because only one of them
	// exists for every department:
	//
	//   'prereq' — a course's column is its longest prerequisite chain. The
	//     real structure, wherever the department states it.
	//   'level'  — its column is its course band (100/200 → 300 → 400). Every
	//     course has one, and it is enforced (eligibleYears), so it is a real
	//     progression and not a guess.
	//
	// History, sociology, arts and the foundation core declare NO prerequisites
	// anywhere in the term CSVs. In prereq mode they are one flat column, which
	// is the truth but not much of a picture; level mode is what those degrees
	// actually look like.
	let mode = $state<'prereq' | 'level'>('prereq');

	const band = (code: string) => {
		const n = Number(code.match(/\d+/)?.[0] ?? 0);
		return n >= 400 ? 2 : n >= 300 ? 1 : 0;
	};

	// ── columns ──
	// A cycle (possible once /admin has been used) would recurse forever, so
	// a node already on the stack contributes nothing and is left to the
	// editor's own cycle warning to sort out.
	let levels = $derived.by(() => {
		const { nodes, prereqs } = graph;
		const depth = new Map<string, number>();
		if (mode === 'level') {
			for (const code of nodes) depth.set(code, band(code));
			return depth;
		}
		const onStack = new Set<string>();
		const walk = (code: string): number => {
			const known = depth.get(code);
			if (known !== undefined) return known;
			if (onStack.has(code)) return 0;
			onStack.add(code);
			let d = 0;
			for (const p of prereqs.get(code) ?? []) d = Math.max(d, walk(p) + 1);
			onStack.delete(code);
			depth.set(code, d);
			return d;
		};
		for (const code of nodes) walk(code);
		return depth;
	});

	const LEVEL_LABELS = ['100 / 200', '300', '400'];
	const columnLabel = (d: number) =>
		mode === 'level' ? (LEVEL_LABELS[d] ?? `${d}`) : d === 0 ? 'start' : `after ${d}`;

	const NODE_W = 168;
	const NODE_H = 56;
	const GAP_X = 84;
	const GAP_Y = 14;

	// ── rows: sit each course near its prerequisites ──
	// One left-to-right barycentre pass. Not optimal crossing-wise, but it is
	// stable, instant, and enough to keep a chain reading as a line.
	let placed = $derived.by(() => {
		const cols: string[][] = [];
		for (const [code, d] of levels) (cols[d] ??= []).push(code);
		const row = new Map<string, number>();
		cols.forEach((col, d) => {
			if (!col) return;
			if (d === 0) {
				col.sort((a, b) => a.localeCompare(b));
			} else {
				const bary = (code: string) => {
					const ps = (graph.prereqs.get(code) ?? []).map((p) => row.get(p)).filter((r) => r !== undefined);
					return ps.length ? ps.reduce((s, r) => s + r, 0) / ps.length : Number.MAX_SAFE_INTEGER;
				};
				col.sort((a, b) => bary(a) - bary(b) || a.localeCompare(b));
			}
			col.forEach((code, i) => row.set(code, i));
		});
		const nodes = [...graph.nodes].map((code) => ({
			code,
			level: levels.get(code) ?? 0,
			x: (levels.get(code) ?? 0) * (NODE_W + GAP_X),
			y: (row.get(code) ?? 0) * (NODE_H + GAP_Y)
		}));
		const width = cols.length * (NODE_W + GAP_X) - GAP_X;
		const height = Math.max(1, ...cols.filter(Boolean).map((c) => c.length)) * (NODE_H + GAP_Y) - GAP_Y;
		return { nodes, cols, width, height, pos: new Map(nodes.map((n) => [n.code, n])) };
	});

	let edges = $derived.by(() =>
		[...graph.nodes].flatMap((code) =>
			(graph.prereqs.get(code) ?? []).map((pre) => {
				const a = placed.pos.get(pre)!;
				const b = placed.pos.get(code)!;
				const x1 = a.x + NODE_W;
				const y1 = a.y + NODE_H / 2;
				const x2 = b.x;
				const y2 = b.y + NODE_H / 2;
				const bend = Math.max(28, (x2 - x1) / 2);
				return { key: `${pre}>${code}`, pre, code, d: `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}` };
			})
		)
	);

	// ── hover: the whole chain a course belongs to ──
	// Both directions, because the question a student's chain raises is "what
	// do I need before this, and what does it open up" — one without the other
	// only answers half of it.
	let lit = $derived.by(() => {
		if (!hovered) return null;
		const set = new Set<string>([hovered]);
		const back = [hovered];
		while (back.length) {
			const c = back.pop()!;
			for (const p of graph.prereqs.get(c) ?? []) if (!set.has(p)) (set.add(p), back.push(p));
		}
		const fwd = [hovered];
		while (fwd.length) {
			const c = fwd.pop()!;
			for (const u of graph.unlocks.get(c) ?? []) if (!set.has(u)) (set.add(u), fwd.push(u));
		}
		return set;
	});

	const kindOf = (code: string) =>
		core.has(code) ? 'core' : electives.has(code) ? 'elective' : 'external';

	// the longest chain on the board — the number that decides whether a
	// programme actually fits in its trimesters
	let longest = $derived(Math.max(0, ...[...levels.values()]) + 1);
</script>

<div class="tree-page">
	<div class="controls">
		<label>
			<span>programme</span>
			<select bind:value={role}>
				<option value="major">major</option>
				<option value="minor">minor</option>
				<option value="concentration">concentration</option>
			</select>
		</label>

		<label>
			<span>subject</span>
			<select bind:value={subject}>
				{#each subjectOpts as s (s.id)}
					<option value={s.id}>{s.label}</option>
				{/each}
			</select>
		</label>

		<label class="tick-row">
			<input type="checkbox" bind:checked={fourYear} />
			<span>4-year</span>
		</label>

		<label class="tick-row">
			<input type="checkbox" bind:checked={withElectives} />
			<span>include electives</span>
		</label>

		<label>
			<span>columns</span>
			<select bind:value={mode}>
				<option value="prereq">prerequisite depth</option>
				<option value="level">course level</option>
			</select>
		</label>

		<div class="stats">
			<span><b>{graph.nodes.size}</b> courses</span>
			<span><b>{edges.length}</b> edges</span>
			<span><b>{longest}</b> deep</span>
		</div>

		<div class="legend">
			<span class="key"><i class="k-core"></i>required</span>
			{#if withElectives}<span class="key"><i class="k-elective"></i>elective</span>{/if}
			<span class="key"><i class="k-external"></i>other dept.</span>
		</div>
	</div>

	<div class="canvas-scroll">
		{#if !graph.nodes.size}
			<p class="empty">
				{subjectById(subject).label} has no listed {role} courses in this catalogue.
			</p>
		{:else}
			<!-- a department can be flat because nobody filled the column in, or
			     because it genuinely gates nothing. History, sociology and arts
			     are the second kind — every prerequisite cell in the term CSVs
			     reads "--NA--" or "none except an open mind". Say so, rather than
			     letting a flat row read as a bug. -->
			{#if mode === 'prereq' && !edges.length}
				<p class="flat-note">
					{subjectById(subject).label} states no prerequisites anywhere in the term CSVs — nothing
					here gates anything. Switch <b>columns</b> to <b>course level</b> to see the degree's
					progression.
				</p>
			{/if}

			<div class="rulers" style="width:{placed.width}px">
				{#each placed.cols as col, d (d)}
					<div class="ruler" style="left:{d * (NODE_W + GAP_X)}px; width:{NODE_W}px">
						{columnLabel(d)}
						<em>{col?.length ?? 0}</em>
					</div>
				{/each}
			</div>

			<div
				class="canvas"
				class:dimmed={lit !== null}
				style="width:{placed.width}px; height:{placed.height}px"
			>
				<svg width={placed.width} height={placed.height} aria-hidden="true">
					{#each edges as e (e.key)}
						<path d={e.d} class:lit={lit?.has(e.pre) && lit?.has(e.code)} />
					{/each}
				</svg>

				{#each placed.nodes as n (n.code)}
					{@const c = byCode(n.code)}
					<div
						class="node {kindOf(n.code)}"
						class:lit={lit?.has(n.code)}
						style="left:{n.x}px; top:{n.y}px; width:{NODE_W}px; height:{NODE_H}px"
						role="listitem"
						onmouseenter={() => (hovered = n.code)}
						onmouseleave={() => (hovered = null)}
					>
						<span class="n-code">{c.code}</span>
						<span class="n-title">{c.title}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.tree-page {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--color-bg-board-page);
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 1.6rem;
		padding: 1rem 2rem;
		background: var(--color-bg-sidebar);
		border-bottom: 1px solid var(--color-border-light);

		label {
			display: flex;
			align-items: center;
			gap: 0.6rem;
			font-size: 1.25rem;
			color: var(--color-text-muted);
		}

		select {
			padding: 0.4rem 0.6rem;
			font: inherit;
			font-size: 1.25rem;
			color: var(--color-text);
			background: var(--color-bg-light);
			border: 1px solid var(--color-border-card);
			border-radius: 5px;
		}

		.tick-row {
			cursor: pointer;
		}
	}

	.stats {
		display: flex;
		gap: 1.2rem;
		margin-left: auto;
		font-size: 1.2rem;
		color: var(--color-text-muted);

		b {
			color: var(--color-text);
		}
	}

	.legend {
		display: flex;
		gap: 1rem;

		.key {
			display: flex;
			align-items: center;
			gap: 0.4rem;
			font-size: 1.15rem;
			color: var(--color-text-muted);
		}

		i {
			width: 1.1rem;
			height: 1.1rem;
			border-radius: 3px;
			border: 1px solid var(--color-border-card);
		}

		.k-core {
			background: var(--color-course-required);
		}
		.k-elective {
			background: var(--color-course-elective);
		}
		.k-external {
			background: none;
			border-style: dashed;
		}
	}

	// the whole tree scrolls as one surface — a wide programme is genuinely
	// wide, and squeezing it would cost the thing the page is for
	.canvas-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 1.6rem 2rem 4rem;
	}

	// column headers: how many courses must come before this one
	.flat-note {
		max-width: 62rem;
		margin-bottom: 1.4rem;
		padding: 0.9rem 1.2rem;
		font-size: 1.25rem;
		line-height: 1.5;
		color: var(--color-text);
		background: var(--color-hint-info);
		border: 1px solid var(--color-hint-info-deep);
		border-radius: 6px;
	}

	.rulers {
		position: relative;
		height: 2.4rem;
	}

	.ruler {
		position: absolute;
		top: 0;
		font-size: 1.1rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);

		em {
			font-style: normal;
			margin-left: 0.4rem;
			opacity: 0.7;
		}
	}

	.canvas {
		position: relative;
	}

	svg {
		position: absolute;
		inset: 0;
		overflow: visible;

		path {
			fill: none;
			stroke: var(--color-border-card);
			stroke-width: 1.5;
			transition: stroke 0.12s ease, opacity 0.12s ease;
		}
	}

	// hovering one course dims everything that is not on its chain, so a single
	// path through a crowded department can actually be followed
	.canvas.dimmed {
		svg path {
			opacity: 0.25;
		}
		svg path.lit {
			opacity: 1;
			stroke: var(--color-accent);
			stroke-width: 2;
		}
		.node {
			opacity: 0.3;
		}
		.node.lit {
			opacity: 1;
		}
	}

	.node {
		position: absolute;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.15rem;
		padding: 0.5rem 0.8rem;
		background: var(--color-course-required);
		border: 1px solid var(--color-border-card);
		border-radius: 6px;
		cursor: default;
		transition: opacity 0.12s ease, box-shadow 0.12s ease;
		@include card-shine;

		.n-code {
			font-size: 1.2rem;
			font-weight: 700;
			color: var(--color-text);
		}

		.n-title {
			overflow: hidden;
			font-size: 1.1rem;
			line-height: 1.25;
			color: var(--color-text-muted);
			display: -webkit-box;
			-webkit-line-clamp: 2;
			line-clamp: 2;
			-webkit-box-orient: vertical;
		}

		&.elective {
			background: var(--color-course-elective);
		}

		// a prerequisite from another department — on the chain, but not part
		// of the programme's own list
		&.external {
			background: none;
			border-style: dashed;
		}

		&.lit {
			border-color: var(--color-accent);
			@include card-shine-hover;
		}
	}

	.empty {
		@include empty-text;
		padding: 4rem;
	}
</style>
