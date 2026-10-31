<script lang="ts">
	// ─────────────────────────────────────────────
	// Cross-listing and credit sharing.
	//
	// A cross-listed course is ONE course under several department codes
	// (HIST235 = LITT235 = ARTS229). Which codes it carries decides which
	// programmes it can count toward; the credit-sharing policy decides what
	// happens when it counts toward two of a student's programmes at once,
	// do its credits go to one of them (the first that claims it: majors
	// before minors before concentrations) or to both?
	//
	// Both are course edits (courseEdits.ts), so they save, export and revert
	// exactly like everything else on the courses page.
	// ─────────────────────────────────────────────
	import { ALL_COURSES, SUBJECTS, shippedCourse, subjectById } from '$lib/data';
	import { page } from '$app/state';
	import {
		CODE_RE,
		loadCourseEdits,
		loadShareDefault,
		saveCourseEdits,
		saveShareDefault,
		type CourseEdit,
		type CourseEdits,
		type CreditShare
	} from '$lib/courseEdits';

	let edits = $state<CourseEdits>({});
	let shareDefault = $state<CreditShare>('one');
	let dirty = $state(false);

	$effect(() => {
		edits = loadCourseEdits();
		shareDefault = loadShareDefault();
		const linked = page.url.searchParams.get('course');
		if (linked) {
			search = linked;
			show = 'all';
		}
	});

	const all = [...ALL_COURSES].sort((a, b) => a.code.localeCompare(b.code));
	const byCode = new Map(all.map((c) => [c.code, c]));
	const subjects = SUBJECTS.filter((s) => s.id !== 'open').sort((a, b) => a.label.localeCompare(b.label));

	// ── reading ──
	const shippedMap = (code: string) => shippedCourse(code)?.codesBySubject ?? byCode.get(code)!.codesBySubject;
	/** department → code, with the edit applied; its own department always first */
	function mapOf(code: string): [string, string][] {
		const c = byCode.get(code)!;
		const map = { ...(edits[code]?.codesBySubject ?? shippedMap(code)), [c.subject]: c.code };
		return [[c.subject, c.code], ...Object.entries(map).filter(([s]) => s !== c.subject)];
	}
	const listingEdited = (code: string) => edits[code]?.codesBySubject !== undefined;
	const shareOf = (code: string) => edits[code]?.share;

	// ── writing ──
	function write(code: string, change: (e: CourseEdit) => void) {
		const next = { ...edits };
		const e: CourseEdit = { ...(next[code] ?? {}) };
		change(e);
		if (Object.keys(e).length) next[code] = e;
		else delete next[code];
		edits = next;
		saveCourseEdits(edits);
		dirty = true;
	}

	function setListing(code: string, pairs: [string, string][]) {
		const map = Object.fromEntries(pairs);
		const shipped = shippedMap(code);
		const same =
			Object.keys(map).length === Object.keys(shipped).length &&
			Object.entries(map).every(([s, c]) => shipped[s] === c);
		write(code, (e) => {
			if (same) delete e.codesBySubject;
			else e.codesBySubject = map;
		});
	}

	const unlink = (code: string, subject: string) =>
		setListing(
			code,
			mapOf(code).filter(([s]) => s !== subject)
		);

	const setShare = (code: string, share: CreditShare | undefined) =>
		write(code, (e) => {
			if (share) e.share = share;
			else delete e.share;
		});

	function setDefault(share: CreditShare) {
		shareDefault = share;
		saveShareDefault(share);
		dirty = true;
	}

	// ── adding a department to a course ──
	let addingTo = $state<string | null>(null);
	let addSubject = $state('');
	let addCode = $state('');
	const suggest = (code: string, subject: string) =>
		subjectById(subject).short.toUpperCase() + (code.match(/\d+[A-Z]?$/)?.[0] ?? '');

	function openAdd(code: string) {
		addingTo = code;
		const taken = new Set(mapOf(code).map(([s]) => s));
		addSubject = subjects.find((s) => !taken.has(s.id))?.id ?? '';
		addCode = addSubject ? suggest(code, addSubject) : '';
	}

	let addError = $derived.by(() => {
		const c = addCode.trim().toUpperCase();
		if (!c) return 'enter a code';
		if (!CODE_RE.test(c)) return 'a code looks like HIST235';
		return '';
	});

	function confirmAdd() {
		if (!addingTo || addError || !addSubject) return;
		setListing(addingTo, [...mapOf(addingTo), [addSubject, addCode.trim().toUpperCase()]]);
		addingTo = null;
	}

	// ── the list ──
	let search = $state('');
	let show = $state<'crosslisted' | 'changed' | 'all'>('crosslisted');
	let listed = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return all.filter((c) => {
			const n = mapOf(c.code).length;
			if (show === 'crosslisted' && n < 2 && !listingEdited(c.code)) return false;
			if (show === 'changed' && !listingEdited(c.code) && !shareOf(c.code)) return false;
			if (!q) return true;
			return (
				mapOf(c.code).some(([, code]) => code.toLowerCase().includes(q)) ||
				(edits[c.code]?.title ?? c.title).toLowerCase().includes(q)
			);
		});
	});
	let crossCount = $derived(all.filter((c) => mapOf(c.code).length > 1).length);
	let overrideCount = $derived(Object.values(edits).filter((e) => e.share).length);
</script>

<div class="page">
	<div class="inner">
		<header class="head">
			<div>
				<h1>cross-listing</h1>
				<p class="lead">
					One course, several department codes. The codes decide which programmes a course can count
					toward; credit sharing decides what happens when it counts toward two of a student's programmes
					at once.
				</p>
			</div>
			{#if dirty}
				<a class="btn primary sm" href="/" data-sveltekit-reload>see it in the planner ↗</a>
			{/if}
		</header>

		<div class="section">
			<h2>credit sharing, site default</h2>
			<div class="set">
				<span class="set-label">
					a course that counts for two programmes
					<small>e.g. a major and a minor</small>
				</span>
				<div>
					<div class="seg">
						<button class:on={shareDefault === 'one'} onclick={() => setDefault('one')}>counts for one</button>
						<button class:on={shareDefault === 'all'} onclick={() => setDefault('all')}>counts for both</button>
					</div>
					<p class="help">
						{#if shareDefault === 'one'}
							its credits go to the first programme that claims it, majors before minors before
							concentrations, so a student must take more courses to finish both.
						{:else}
							its credits count toward every programme it belongs to, so one course can fill two
							requirements at once.
						{/if}
						Any course below can override this.
					</p>
				</div>
			</div>
		</div>

		<div class="section">
			<h2>courses</h2>
			<div class="filters">
				<input class="input" type="search" placeholder="search code or title" bind:value={search} />
				<div class="seg">
					<button class:on={show === 'crosslisted'} onclick={() => (show = 'crosslisted')}
						>cross-listed · {crossCount}</button
					>
					<button class:on={show === 'changed'} onclick={() => (show = 'changed')}
						>changed · {Object.values(edits).filter((e) => e.codesBySubject || e.share).length}</button
					>
					<button class:on={show === 'all'} onclick={() => (show = 'all')}>all</button>
				</div>
			</div>
			{#if overrideCount}
				<p class="help">{overrideCount} course{overrideCount === 1 ? '' : 's'} override the default.</p>
			{/if}

			<div class="table">
				<div class="tr th">
					<span>course</span>
					<span>listed as</span>
					<span>credits count for</span>
				</div>
				{#each listed.slice(0, 200) as c (c.code)}
					{@const pairs = mapOf(c.code)}
					<div class="tr" class:changed={listingEdited(c.code) || shareOf(c.code)}>
						<div class="t-course">
							<a class="code" href="/admin?course={c.code}">{c.code}</a>
							<span class="title">{edits[c.code]?.title ?? c.title}</span>
						</div>

						<div class="t-codes">
							{#each pairs as [subject, code], i (subject)}
								<span class="code-chip" class:home={i === 0} title={subjectById(subject).label}>
									<span class="cc-dept">{subjectById(subject).short}</span>
									<b>{code}</b>
									{#if i > 0}
										<button aria-label="remove {code}" onclick={() => unlink(c.code, subject)}>×</button>
									{/if}
								</span>
							{/each}
							{#if addingTo === c.code}
								<form
									class="add"
									onsubmit={(e) => {
										e.preventDefault();
										confirmAdd();
									}}
								>
									<select
										class="input"
										bind:value={addSubject}
										onchange={() => (addCode = suggest(c.code, addSubject))}
									>
										{#each subjects.filter((s) => !pairs.some(([ps]) => ps === s.id)) as s (s.id)}
											<option value={s.id}>{s.label}</option>
										{/each}
									</select>
									<input class="input code-in" bind:value={addCode} aria-label="code in that department" />
									<button class="btn sm primary" disabled={!!addError}>add</button>
									<button type="button" class="btn sm ghost" onclick={() => (addingTo = null)}>cancel</button>
								</form>
							{:else}
								<button class="link add-link" onclick={() => openAdd(c.code)}>+ department</button>
							{/if}
							{#if listingEdited(c.code)}
								<button class="link muted" onclick={() => setListing(c.code, Object.entries(shippedMap(c.code)))}
									>reset</button
								>
							{/if}
						</div>

						<div class="seg small">
							<button class:on={!shareOf(c.code)} onclick={() => setShare(c.code, undefined)}
								>default</button
							>
							<button class:on={shareOf(c.code) === 'one'} onclick={() => setShare(c.code, 'one')}>one</button>
							<button class:on={shareOf(c.code) === 'all'} onclick={() => setShare(c.code, 'all')}>both</button>
						</div>
					</div>
				{:else}
					<p class="empty">nothing matches</p>
				{/each}
				{#if listed.length > 200}
					<p class="empty">showing 200 of {listed.length}, search to narrow down</p>
				{/if}
			</div>
		</div>
	</div>
</div>

<style lang="scss">
	.page {
		height: 100%;
		overflow-y: auto;
	}

	.inner {
		max-width: 110rem;
		margin: 0 auto;
		padding: 2.4rem var(--adm-pad) 6rem;
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 2rem;
		margin-bottom: 1rem;

		h1 {
			font-size: 2.2rem;
			font-weight: 700;
		}
	}

	.lead {
		max-width: 64rem;
		margin-top: 0.4rem;
		font-size: 1.3rem;
		line-height: 1.55;
		color: var(--color-text-muted);
	}

	.filters {
		display: flex;
		gap: 1rem;
		align-items: center;

		.input {
			max-width: 32rem;
		}
	}

	.table {
		margin-top: 1.2rem;
	}

	.tr {
		display: grid;
		grid-template-columns: minmax(18rem, 2fr) minmax(0, 3fr) auto;
		align-items: center;
		gap: 1.6rem;
		padding: 0.8rem 0.4rem;
		border-bottom: 1px solid var(--adm-line);

		&.changed {
			box-shadow: inset 2px 0 0 var(--color-accent);
			padding-left: 1rem;
		}

		&.th {
			padding-top: 0;
			font-size: 1.05rem;
			font-weight: 700;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			color: var(--color-text-muted);
		}
	}

	.t-course {
		display: flex;
		flex-direction: column;
		min-width: 0;

		.code {
			font-weight: 700;
			color: var(--color-text);
			text-decoration: none;

			&:hover {
				color: var(--color-accent);
			}
		}

		.title {
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
			font-size: 1.2rem;
			color: var(--color-text-muted);
		}
	}

	.t-codes {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}

	.code-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.2rem 0.3rem 0.2rem 0.6rem;
		font-size: 1.2rem;
		border: 1px solid var(--adm-line-strong);
		border-radius: 5px;

		&.home {
			padding-right: 0.6rem;
			background: var(--color-bg);
			border-color: transparent;
		}

		.cc-dept {
			font-size: 1rem;
			text-transform: uppercase;
			color: var(--color-text-muted);
		}

		button {
			padding: 0 0.3rem;
			font-size: 1.3rem;
			line-height: 1;
			color: var(--color-text-muted);
			background: none;
			border: 0;
			cursor: pointer;

			&:hover {
				color: var(--color-danger);
			}
		}
	}

	.add-link {
		font-size: 1.2rem;
	}

	.muted {
		font-size: 1.15rem;
		font-weight: 400;
		color: var(--color-text-muted);
	}

	.add {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;

		.input {
			width: auto;
			padding: 0.25rem 0.6rem;
			font-size: 1.2rem;
		}

		.code-in {
			width: 9rem;
			text-transform: uppercase;
		}
	}

	.seg.small button {
		padding: 0.25rem 0.8rem;
		font-size: 1.15rem;
	}
</style>
