<script lang="ts">
	import { loadBatchEdits, saveBatchEdits, parseBatchEdits } from '$lib/batchEdits';
	// ─────────────────────────────────────────────
	// Course editor.
	//
	// Three columns, so a whole department can be worked through without ever
	// losing your place: find a course → edit it → watch the change log. Every
	// property the planner reads is editable — title, credits, the required /
	// elective flag, when it runs, who can take it, and its prerequisites —
	// and every edit sits next to what the pipeline shipped, so it is always
	// clear what changed and what it changed from.
	//
	// Edits save to this browser the moment they are made (courseEdits.ts,
	// prereqEdits.ts) and apply on the planner's next load. Export bundles
	// them into one JSON file to hand back to the data pipeline.
	// ─────────────────────────────────────────────
	import {
		ALL_COURSES,
		CREDIT_SHARE_DEFAULT,
		SUBJECTS,
		hasCode,
		shippedCourse,
		subjectById,
		type ShippedCourse
	} from '$lib/data';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import {
		loadPrereqEdits,
		savePrereqEdits,
		parsePrereqEdits,
		type PrereqEdits
	} from '$lib/prereqEdits';
	import {
		CODE_RE,
		COURSE_FIELDS,
		loadCourseEdits,
		loadNewCourses,
		loadRuleEdits,
		loadShareDefault,
		parseCourseEdits,
		parseNewCourses,
		parseRuleEdits,
		parseShare,
		saveCourseEdits,
		saveNewCourses,
		saveRuleEdits,
		saveShareDefault,
		type CourseEdit,
		type CreditShare,
		type NewCourses,
		type CourseEdits,
		type CourseField,
		type RuleEdits
	} from '$lib/courseEdits';
	import type { TrimNum } from '$lib/types';
	import shippedCourses from '$lib/data/courses.json';
	import { fly, fade } from 'svelte/transition';

	const STEPS = [
		['find a course', 'search by code or title, or narrow to a department.'],
		['change anything', 'title, credits, when it runs, who can take it, prerequisites, cross-listing.'],
		['it saves instantly', 'every change is listed on the right — undo with Ctrl+Z.'],
		['check the planner', '“open planner” loads it exactly as students will see it.'],
		['publish', '“export” saves every change as one file for the next data build.']
	];

	// the prerequisite lists as generated, before any edit — the "was" for the
	// prerequisite editor, read straight from the file so it can't drift
	const shippedPrereqs: Record<string, string[]> = Object.fromEntries(
		Object.entries((shippedCourses as { courses: Record<string, { prereqs: string[] }> }).courses).map(
			([code, c]) => [code, c.prereqs ?? []]
		)
	);

	const FIELD_LABEL: Record<CourseField, string> = {
		title: 'title',
		credits: 'credits',
		required: 'university flag',
		offered: 'trimesters offered',
		eligibleYears: 'open to years',
		faculty: 'faculty'
	};

	let edits = $state<CourseEdits>({});
	let prereqEdits = $state<PrereqEdits>({});
	let ruleEdits = $state<RuleEdits>({}); // only carried through export/import here
	let newCourses = $state<NewCourses>({});
	let shareDefault = $state<CreditShare>(CREDIT_SHARE_DEFAULT);
	let loaded = $state(false);

	$effect(() => {
		edits = loadCourseEdits();
		prereqEdits = loadPrereqEdits();
		ruleEdits = loadRuleEdits();
		newCourses = loadNewCourses();
		shareDefault = loadShareDefault();
		loaded = true;
		// a link straight to one course: /admin?course=MATH341
		const linked = page.url.searchParams.get('course');
		if (linked && allIndex.has(linked)) selectedCode = linked;
	});

	// every course, retired ones too — the admin is where they come back from
	const allIndex = new Map(ALL_COURSES.map((c) => [c.code, c]));
	const known = (code: string) => allIndex.has(code);

	// ── reading a course: the edit if there is one, else what shipped ──
	const base = (code: string): ShippedCourse => shippedCourse(code) ?? allIndex.get(code)!;
	function valueOf<K extends CourseField>(code: string, field: K): ShippedCourse[K] {
		const e = edits[code]?.[field];
		return (e === undefined ? base(code)[field] : e) as ShippedCourse[K];
	}
	const titleOf = (code: string) => (known(code) ? valueOf(code, 'title') : code);
	const isRetired = (code: string) => edits[code]?.retired === true;
	const isAdded = (code: string) => allIndex.get(code)?.added === true;
	const prereqsOf = (code: string): string[] => prereqEdits[code] ?? shippedPrereqs[code] ?? [];
	const fieldEdited = (code: string, field: CourseField) => edits[code]?.[field] !== undefined;
	const isEdited = (code: string) => code in edits || code in prereqEdits;

	const sameList = (a: readonly unknown[], b: readonly unknown[]) =>
		a.length === b.length && a.every((x, i) => x === b[i]);

	// ── undo: every change pushes the state it replaced ──
	type Snapshot = { edits: CourseEdits; prereqEdits: PrereqEdits; what: string };
	let history = $state<Snapshot[]>([]);
	let toast = $state<string | null>(null);
	let toastTimer: ReturnType<typeof setTimeout>;

	function commit(nextEdits: CourseEdits, nextPrereqs: PrereqEdits, what: string) {
		history = [...history.slice(-49), { edits, prereqEdits, what }];
		edits = nextEdits;
		prereqEdits = nextPrereqs;
		saveCourseEdits(edits);
		savePrereqEdits(prereqEdits);
		dirty = true;
		say(`saved · ${what}`);
	}

	function say(msg: string) {
		toast = msg;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = null), 2600);
	}

	function undo() {
		const last = history.at(-1);
		if (!last) return;
		history = history.slice(0, -1);
		edits = last.edits;
		prereqEdits = last.prereqEdits;
		saveCourseEdits(edits);
		savePrereqEdits(prereqEdits);
		say(`undone · ${last.what}`);
	}

	// has anything changed since the planner last loaded the data?
	let dirty = $state(false);

	// ── field edits ──
	/** lay one field change onto an edit set (mutates `next`) */
	function applyField<K extends CourseField>(next: CourseEdits, code: string, field: K, value: CourseEdit[K]) {
		const shippedValue = base(code)[field];
		const unchanged = Array.isArray(value)
			? sameList(value, shippedValue as unknown[])
			: value === shippedValue;
		const edit: CourseEdit = { ...(next[code] ?? {}) };
		// an edit that lands back on the shipped value is not an edit
		if (unchanged) delete edit[field];
		else edit[field] = value;
		if (Object.keys(edit).length) next[code] = edit;
		else delete next[code];
	}

	function setField<K extends CourseField>(code: string, field: K, value: CourseEdit[K]) {
		const next: CourseEdits = { ...edits };
		applyField(next, code, field, value);
		commit(next, prereqEdits, `${code} ${FIELD_LABEL[field]}`);
	}

	const resetField = (code: string, field: CourseField) =>
		setField(code, field, base(code)[field] as CourseEdit[typeof field]);

	function toggleIn<T extends number>(list: T[], v: T): T[] {
		return (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]).sort((a, b) => a - b);
	}

	// ── prerequisite edits (full replacement of a course's list) ──
	function setPrereqs(code: string, list: string[]) {
		const clean = [...new Set(list.filter((p) => hasCode(p) && p !== code))].sort();
		const shippedList = [...(shippedPrereqs[code] ?? [])].sort();
		const next = { ...prereqEdits };
		if (sameList(clean, shippedList)) delete next[code];
		else next[code] = clean;
		commit(edits, next, `${code} prerequisites`);
	}
	const addPrereq = (code: string, pre: string) => setPrereqs(code, [...prereqsOf(code), pre]);
	const dropPrereq = (code: string, pre: string) =>
		setPrereqs(
			code,
			prereqsOf(code).filter((p) => p !== pre)
		);

	function revertCourse(code: string) {
		const next = { ...edits };
		delete next[code];
		const nextPre = { ...prereqEdits };
		delete nextPre[code];
		commit(next, nextPre, `${code} reverted`);
	}

	// ── availability, credit sharing ──
	function setFlag(code: string, what: string, change: (edit: CourseEdit) => void) {
		const next: CourseEdits = { ...edits };
		const edit: CourseEdit = { ...(next[code] ?? {}) };
		change(edit);
		if (Object.keys(edit).length) next[code] = edit;
		else delete next[code];
		commit(next, prereqEdits, `${code} ${what}`);
	}
	const setRetired = (code: string, retired: boolean) =>
		setFlag(code, retired ? 'retired' : 'back in the catalogue', (e) => {
			if (retired) e.retired = true;
			else delete e.retired;
		});
	const setShare = (code: string, share: CreditShare | undefined) =>
		setFlag(code, 'credit sharing', (e) => {
			if (share) e.share = share;
			else delete e.share;
		});

	// ── adding a course ──
	let adding = $state(false);
	let newCode = $state('');
	let newTitle = $state('');
	let newSubject = $state('mathematics');
	let newCodeClean = $derived(newCode.replace(/\s+/g, '').toUpperCase());
	let newError = $derived(
		!newCodeClean
			? ''
			: !CODE_RE.test(newCodeClean)
				? 'a code looks like MATH499 — four letters, three digits'
				: known(newCodeClean) || newCodeClean in newCourses
					? `${newCodeClean} already exists`
					: ''
	);

	function createCourse() {
		if (!newCodeClean || newError || !newTitle.trim()) return;
		const next = { ...newCourses, [newCodeClean]: { code: newCodeClean, title: newTitle.trim(), subject: newSubject } };
		saveNewCourses(next);
		// the catalogue is built once per page load, so a new course joins it
		// on a fresh load — straight to its own editor
		location.href = `/admin?course=${newCodeClean}`;
	}

	let deleting = $state(false);
	function deleteAdded(code: string) {
		if (!deleting) {
			deleting = true;
			setTimeout(() => (deleting = false), 4000);
			return;
		}
		const next = { ...newCourses };
		delete next[code];
		saveNewCourses(next);
		const e = { ...edits };
		delete e[code];
		saveCourseEdits(e);
		const pe = { ...prereqEdits };
		delete pe[code];
		savePrereqEdits(pe);
		location.href = '/admin';
	}

	// ── bulk: tick courses in the list, then change them all in one step ──
	let checked = $state<string[]>([]);
	let checkedSet = $derived(new Set(checked));
	const toggleCheck = (code: string) =>
		(checked = checkedSet.has(code) ? checked.filter((c) => c !== code) : [...checked, code]);

	function bulkField<K extends CourseField>(
		what: string,
		field: K,
		value: (code: string) => CourseEdit[K]
	) {
		const next: CourseEdits = { ...edits };
		for (const code of checked) applyField(next, code, field, value(code));
		commit(next, prereqEdits, `${checked.length} courses · ${what}`);
	}

	const bulkTrim = (t: TrimNum, on: boolean) =>
		bulkField(`${on ? 'offer in' : 'stop offering in'} t${t}`, 'offered', (code) => {
			const list = valueOf(code, 'offered').filter((x) => x !== t);
			return (on ? [...list, t] : list).sort((a, b) => a - b);
		});

	const bulkYear = (y: number, on: boolean) =>
		bulkField(`${on ? 'open to' : 'close to'} year ${y}`, 'eligibleYears', (code) => {
			const list = valueOf(code, 'eligibleYears').filter((x) => x !== y);
			return (on ? [...list, y] : list).sort((a, b) => a - b);
		});

	let bulkCredits = $state(4);

	function bulkClearPrereqs() {
		const next = { ...prereqEdits };
		for (const code of checked) {
			if ((shippedPrereqs[code] ?? []).length) next[code] = [];
			else delete next[code];
		}
		commit(edits, next, `${checked.length} courses · prerequisites removed`);
	}

	const bulkRetire = (retired: boolean) => {
		const next: CourseEdits = { ...edits };
		for (const code of checked) {
			const edit: CourseEdit = { ...(next[code] ?? {}) };
			if (retired) edit.retired = true;
			else delete edit.retired;
			if (Object.keys(edit).length) next[code] = edit;
			else delete next[code];
		}
		commit(next, prereqEdits, `${checked.length} courses ${retired ? 'retired' : 'restored'}`);
	};

	function bulkRevert() {
		const next = { ...edits };
		const nextPre = { ...prereqEdits };
		for (const code of checked) {
			delete next[code];
			delete nextPre[code];
		}
		commit(next, nextPre, `${checked.length} courses reverted`);
	}

	// ── the course list ──
	const sorted = [...ALL_COURSES].sort((a, b) => a.code.localeCompare(b.code));
	const subjects = SUBJECTS.filter((s) => s.id !== 'open').sort((a, b) => a.label.localeCompare(b.label));

	let subject = $state<string>('all');
	let search = $state('');
	type Show = 'all' | 'edited' | 'issues' | 'added' | 'retired' | 'crosslisted';
	let show = $state<Show>('all');
	const SHOW: { id: Show; label: string }[] = [
		{ id: 'all', label: 'all courses' },
		{ id: 'edited', label: 'edited' },
		{ id: 'issues', label: 'needs attention' },
		{ id: 'added', label: 'added here' },
		{ id: 'retired', label: 'retired' },
		{ id: 'crosslisted', label: 'cross-listed' }
	];
	let selectedCode = $state<string | null>(null);

	// ── data health: what would make the planner misbehave ──
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
	let inCycle = $derived(new Set(cycles.flat()));

	function issuesOf(code: string): string[] {
		const out: string[] = [];
		if (isRetired(code)) return out; // retired on purpose — nothing to fix
		if (!valueOf(code, 'offered').length) out.push('not offered in any trimester');
		if (!valueOf(code, 'eligibleYears').length) out.push('open to no year');
		if (valueOf(code, 'credits') === 0) out.push('worth 0 credits');
		if (prereqsOf(code).some((p) => !known(p) || isRetired(p))) out.push('a prerequisite is not in the catalogue');
		if (inCycle.has(code)) out.push('part of a prerequisite cycle');
		return out;
	}
	let issueCodes = $derived(new Set(sorted.filter((c) => issuesOf(c.code).length).map((c) => c.code)));

	let listed = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return sorted.filter((c) => {
			if (subject !== 'all' && !c.subjects.includes(subject)) return false;
			if (show === 'edited' && !isEdited(c.code)) return false;
			if (show === 'issues' && !issueCodes.has(c.code)) return false;
			if (show === 'added' && !c.added) return false;
			if (show === 'retired' && !isRetired(c.code)) return false;
			if (show === 'crosslisted' && c.codes.length < 2) return false;
			if (!q) return true;
			return (
				c.codes.some((x) => x.toLowerCase().includes(q)) || titleOf(c.code).toLowerCase().includes(q)
			);
		});
	});

	let selected = $derived(selectedCode ? (allIndex.get(selectedCode) ?? null) : null);

	function pick(code: string) {
		selectedCode = code;
		checked = [];
		addQuery = '';
		addOpen = false;
		deleting = false;
		// keep the address bar on this course, so it can be shared or reloaded
		try {
			const url = new URL(page.url);
			url.searchParams.set('course', code);
			replaceState(url, {});
		} catch {
			// before the router is ready — harmless
		}
	}

	// keyboard: ↑/↓ walk the list, so a department can be reviewed in one pass
	function listKey(e: KeyboardEvent) {
		if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
		e.preventDefault();
		const i = listed.findIndex((c) => c.code === selectedCode);
		const next = listed[Math.max(0, Math.min(listed.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
		if (next) {
			pick(next.code);
			document.getElementById(`row-${next.code}`)?.scrollIntoView({ block: 'nearest' });
		}
	}

	// ── the "add a prerequisite" picker ──
	let addQuery = $state('');
	let addOpen = $state(false);
	let addCandidates = $derived.by(() => {
		if (!selected) return [];
		const q = addQuery.trim().toLowerCase();
		const already = new Set(prereqsOf(selected.code));
		return sorted
			.filter((c) => c.code !== selected!.code && !already.has(c.code) && !isRetired(c.code))
			.filter((c) => !q || c.code.toLowerCase().includes(q) || titleOf(c.code).toLowerCase().includes(q))
			.slice(0, 40);
	});

	// ── the change log ──
	type Change = { code: string; field: string; was: string; now: string };
	const show1 = (v: unknown): string =>
		Array.isArray(v) ? v.join(', ') || 'none' : typeof v === 'boolean' ? (v ? 'required' : 'elective') : String(v || '—');
	const fmtField = (field: CourseField, v: unknown) =>
		field === 'offered'
			? (v as number[]).map((t) => `t${t}`).join(' ') || 'none'
			: field === 'eligibleYears'
				? (v as number[]).map((y) => `Y${y}`).join(' ') || 'none'
				: show1(v);

	let changes = $derived.by(() => {
		const out: Change[] = [];
		for (const code of Object.keys(newCourses).sort())
			out.push({ code, field: 'new course', was: '—', now: newCourses[code].title });
		for (const code of [...new Set([...Object.keys(edits), ...Object.keys(prereqEdits)])].sort()) {
			if (!known(code)) continue;
			const e = edits[code] ?? {};
			if (e.retired) out.push({ code, field: 'availability', was: 'in the catalogue', now: 'retired' });
			if (e.share)
				out.push({
					code,
					field: 'credit sharing',
					was: `site default (${shareDefault === 'all' ? 'all programmes' : 'one programme'})`,
					now: e.share === 'all' ? 'all programmes' : 'one programme'
				});
			if (e.codesBySubject)
				out.push({
					code,
					field: 'cross-listing',
					was: Object.values(base(code).codesBySubject).join(', '),
					now: Object.values({ ...e.codesBySubject, [allIndex.get(code)!.subject]: code }).join(', ')
				});
			for (const field of COURSE_FIELDS)
				if (fieldEdited(code, field))
					out.push({
						code,
						field: FIELD_LABEL[field],
						was: fmtField(field, base(code)[field]),
						now: fmtField(field, edits[code][field])
					});
			if (code in prereqEdits)
				out.push({
					code,
					field: 'prerequisites',
					was: show1(shippedPrereqs[code] ?? []),
					now: show1(prereqEdits[code])
				});
		}
		return out;
	});
	let editedCount = $derived(new Set(changes.map((c) => c.code)).size);
	let retiredCount = $derived(Object.values(edits).filter((e) => e.retired).length);
	let addedCount = $derived(Object.keys(newCourses).length);
	let ruleCount = $derived(Object.keys(ruleEdits).length);

	// ── export / import: everything /admin edits, in one file ──
	function exportAll() {
		const bundle = {
			relay: 'admin-edits',
			batchRequirements: loadBatchEdits(),
			version: 1,
			exported: new Date().toISOString(),
			courses: edits,
			prereqs: prereqEdits,
			rules: ruleEdits,
			newCourses,
			creditSharing: shareDefault
		};
		const blob = new Blob([JSON.stringify(bundle, null, '\t')], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `relay-admin-edits-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(a.href);
		say('exported every edit to one JSON file');
	}

	let importEl: HTMLInputElement;
	async function importAll(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			const raw = JSON.parse(await file.text());
			// a bundle from this page, or the older prerequisite-only export
			const bundle = raw && typeof raw === 'object' && ('courses' in raw || 'prereqs' in raw || 'rules' in raw);
			const nextEdits = bundle ? parseCourseEdits(raw.courses) : {};
			const nextPrereqs = parsePrereqEdits(bundle ? raw.prereqs : raw);
			commit(nextEdits, nextPrereqs, `imported ${file.name}`);
			if (bundle) {
				if ('batchRequirements' in raw) saveBatchEdits(parseBatchEdits(raw.batchRequirements));
				ruleEdits = parseRuleEdits(raw.rules);
				saveRuleEdits(ruleEdits);
				saveShareDefault(parseShare(raw.creditSharing));
				const added = parseNewCourses(raw.newCourses);
				// new courses only join the catalogue on a fresh load
				if (JSON.stringify(added) !== JSON.stringify(newCourses)) {
					saveNewCourses(added);
					location.reload();
				}
			}
		} catch {
			say('that file is not a readable relay edit file');
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
		commit({}, {}, 'cleared every course edit');
		// added courses go too — they leave the catalogue on a fresh load
		if (Object.keys(newCourses).length) {
			saveNewCourses({});
			location.reload();
		}
	}

</script>

<svelte:window
	onkeydown={(e) => {
		if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !(e.target instanceof HTMLInputElement)) {
			e.preventDefault();
			undo();
		}
	}}
/>

<div class="page">
	<!-- ── toolbar: where things stand, and the actions that touch everything ── -->
	<div class="toolbar">
		<div class="counts">
			<button class:on={show === 'all'} onclick={() => (show = 'all')}>
				<b>{sorted.length - retiredCount}</b> courses
			</button>
			<button class:on={show === 'edited'} onclick={() => (show = 'edited')}>
				<b>{editedCount}</b> changed
			</button>
			<button class:on={show === 'added'} onclick={() => (show = 'added')}>
				<b>{addedCount}</b> added
			</button>
			<button class:on={show === 'retired'} onclick={() => (show = 'retired')}>
				<b>{retiredCount}</b> retired
			</button>
			{#if issueCodes.size}
				<button class="bad" class:on={show === 'issues'} onclick={() => (show = 'issues')}>
					<b>{issueCodes.size}</b> need attention
				</button>
			{/if}
			{#if ruleCount}
				<a href="/admin/rules"><b>{ruleCount}</b> rule{ruleCount === 1 ? '' : 's'} changed</a>
			{/if}
		</div>
		<div class="tools">
			<button class="btn ghost sm" onclick={undo} disabled={!history.length} title="undo (Ctrl+Z)">↶ undo</button>
			<button class="btn sm" onclick={() => importEl.click()}>import</button>
			<button class="btn sm" onclick={exportAll} disabled={!changes.length && !ruleCount}>export</button>
			<button class="btn primary sm" onclick={() => (adding = true)}>+ new course</button>
			<input bind:this={importEl} type="file" accept="application/json" onchange={importAll} hidden />
		</div>
	</div>

	<div class="cols">
		<!-- ── the list ── -->
		<aside class="list-col">
			<div class="list-head">
				<input class="input" type="search" placeholder="search code or title" bind:value={search} />
				<div class="list-filters">
					<select class="input" bind:value={subject} aria-label="department">
						<option value="all">all departments</option>
						{#each subjects as s (s.id)}
							<option value={s.id}>{s.label}</option>
						{/each}
					</select>
					<select class="input" bind:value={show} aria-label="which courses">
						{#each SHOW as f (f.id)}
							<option value={f.id}>{f.label}</option>
						{/each}
					</select>
				</div>
			</div>

			<label class="select-all">
				<input
					type="checkbox"
					checked={listed.length > 0 && listed.every((c) => checkedSet.has(c.code))}
					indeterminate={checked.length > 0 && !listed.every((c) => checkedSet.has(c.code))}
					onchange={(e) =>
						(checked = e.currentTarget.checked
							? [...new Set([...checked, ...listed.map((c) => c.code)])]
							: checked.filter((c) => !listed.some((l) => l.code === c)))}
				/>
				<span>{checked.length ? `${checked.length} selected` : `select all ${listed.length}`}</span>
			</label>

			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div class="list" tabindex="0" role="listbox" aria-label="courses" onkeydown={listKey}>
				{#each listed as c (c.code)}
					<div class="row" class:on={c.code === selectedCode} class:checked={checkedSet.has(c.code)}>
						<input
							type="checkbox"
							aria-label="select {c.code}"
							checked={checkedSet.has(c.code)}
							onchange={() => toggleCheck(c.code)}
						/>
						<button
							id="row-{c.code}"
							class="row-main"
							class:retired={isRetired(c.code)}
							role="option"
							aria-selected={c.code === selectedCode}
							onclick={() => pick(c.code)}
						>
							<span class="r-code">{c.code}</span>
							<span class="r-title">{titleOf(c.code)}</span>
							<span class="r-flags">
								{#if issueCodes.has(c.code)}<i class="dot bad" title={issuesOf(c.code).join(', ')}></i>{/if}
								{#if isEdited(c.code)}<i class="dot" title="changed"></i>{/if}
								{#if c.added}<span class="tag new">new</span>{/if}
								{#if isRetired(c.code)}<span class="tag">retired</span>{/if}
							</span>
						</button>
					</div>
				{:else}
					<p class="empty">
						{show === 'edited'
							? 'nothing changed yet'
							: show === 'issues'
								? 'nothing needs attention'
								: show === 'added'
									? 'no courses added yet'
									: show === 'retired'
										? 'no retired courses'
										: 'no courses match'}
					</p>
				{/each}
			</div>
			<div class="list-foot">{listed.length} of {sorted.length} · ↑↓ to step through</div>
		</aside>

		<!-- ── the editor ── -->
		<section class="editor">
			{#if checked.length}
				<!-- bulk: one change, every ticked course, one undo step -->
				<div class="e-inner">
					<header class="e-head">
						<div>
							<span class="e-kicker">bulk edit</span>
							<h1>{checked.length} course{checked.length === 1 ? '' : 's'}</h1>
							<p class="e-meta">
								{checked.slice(0, 10).join(' · ')}{checked.length > 10 ? ` · +${checked.length - 10}` : ''}
							</p>
						</div>
						<button class="btn ghost sm" onclick={() => (checked = [])}>deselect</button>
					</header>

					<div class="section">
						<h2>schedule</h2>
						<div class="set">
							<span class="set-label">trimesters</span>
							<div class="bulk">
								{#each [1, 2, 3] as t (t)}
									<span class="b-pair">
										<button class="btn sm" onclick={() => bulkTrim(t as TrimNum, true)}>+ t{t}</button>
										<button class="btn sm" onclick={() => bulkTrim(t as TrimNum, false)}>− t{t}</button>
									</span>
								{/each}
							</div>
						</div>
						<div class="set">
							<span class="set-label">years</span>
							<div class="bulk">
								{#each [1, 2, 3, 4] as y (y)}
									<span class="b-pair">
										<button class="btn sm" onclick={() => bulkYear(y, true)}>+ Y{y}</button>
										<button class="btn sm" onclick={() => bulkYear(y, false)}>− Y{y}</button>
									</span>
								{/each}
							</div>
						</div>
					</div>

					<div class="section">
						<h2>properties</h2>
						<div class="set">
							<span class="set-label">credits</span>
							<div class="bulk">
								<input class="input num" type="number" min="0" max="24" bind:value={bulkCredits} />
								<button
									class="btn sm"
									onclick={() =>
										bulkField(`${bulkCredits} credits`, 'credits', () =>
											Math.max(0, Math.min(24, Math.round(bulkCredits || 0)))
										)}>apply</button
								>
							</div>
						</div>
						<div class="set">
							<span class="set-label">university flag</span>
							<div class="bulk">
								<button class="btn sm" onclick={() => bulkField('required', 'required', () => true)}>required</button>
								<button class="btn sm" onclick={() => bulkField('elective', 'required', () => false)}>elective</button>
							</div>
						</div>
						<div class="set">
							<span class="set-label">prerequisites</span>
							<div class="bulk">
								<button class="btn sm" onclick={bulkClearPrereqs}>remove all</button>
							</div>
						</div>
						<div class="set">
							<span class="set-label">availability</span>
							<div class="bulk">
								<button class="btn sm" onclick={() => bulkRetire(true)}>retire</button>
								<button class="btn sm" onclick={() => bulkRetire(false)}>bring back</button>
							</div>
						</div>
						<div class="set">
							<span class="set-label">start over</span>
							<div class="bulk">
								<button class="btn sm danger" onclick={bulkRevert}>revert to catalogue</button>
							</div>
						</div>
					</div>
				</div>
			{:else if selected}
				{@const code = selected.code}
				{@const issues = issuesOf(code)}
				<div class="e-inner">
					<header class="e-head">
						<div>
							<span class="e-kicker">
								{code}
								{#if selected.added}<span class="tag new">added</span>{/if}
								{#if isRetired(code)}<span class="tag">retired</span>{/if}
							</span>
							<h1>{valueOf(code, 'title')}</h1>
							<p class="e-meta">
								{selected.subjects.map((s) => subjectById(s).label).join(' · ')}
								{#if selected.codes.length > 1}· also {selected.codes.filter((x) => x !== code).join(', ')}{/if}
							</p>
						</div>
						{#if isEdited(code)}
							<button class="btn ghost sm" onclick={() => revertCourse(code)}>revert all</button>
						{/if}
					</header>

					{#if isRetired(code)}
						<div class="note">
							Retired — students can't see or place it.
							<button class="link" onclick={() => setRetired(code, false)}>bring it back</button>
						</div>
					{/if}
					{#if issues.length}
						<div class="note bad">{issues.join(' · ')}</div>
					{/if}

					<div class="section">
						<h2>basics</h2>
						<div class="set" class:changed={fieldEdited(code, 'title')}>
							<label class="set-label" for="f-title">title</label>
							<div>
								<input
									id="f-title"
									class="input"
									value={valueOf(code, 'title')}
									onchange={(e) => {
										const v = e.currentTarget.value.trim();
										if (v) setField(code, 'title', v);
										else e.currentTarget.value = valueOf(code, 'title');
									}}
								/>
								{@render was(code, 'title')}
							</div>
						</div>

						<div class="set" class:changed={fieldEdited(code, 'credits')}>
							<span class="set-label">credits</span>
							<div>
								<div class="stepper">
									<button
										aria-label="fewer credits"
										disabled={valueOf(code, 'credits') <= 0}
										onclick={() => setField(code, 'credits', valueOf(code, 'credits') - 1)}>−</button
									>
									<span class="num">{valueOf(code, 'credits')}</span>
									<button
										aria-label="more credits"
										disabled={valueOf(code, 'credits') >= 24}
										onclick={() => setField(code, 'credits', valueOf(code, 'credits') + 1)}>+</button
									>
								</div>
								{@render was(code, 'credits')}
							</div>
						</div>

						<div class="set" class:changed={fieldEdited(code, 'required')}>
							<span class="set-label">
								university flag
								<small>used when a department publishes no list</small>
							</span>
							<div>
								<div class="seg">
									<button class:on={valueOf(code, 'required')} onclick={() => setField(code, 'required', true)}
										>required</button
									>
									<button class:on={!valueOf(code, 'required')} onclick={() => setField(code, 'required', false)}
										>elective</button
									>
								</div>
								{@render was(code, 'required')}
							</div>
						</div>

						<div class="set" class:changed={fieldEdited(code, 'faculty')}>
							<label class="set-label" for="f-fac">faculty</label>
							<div>
								<input
									id="f-fac"
									class="input"
									placeholder="no one listed"
									value={valueOf(code, 'faculty')}
									onchange={(e) => setField(code, 'faculty', e.currentTarget.value.trim())}
								/>
								{@render was(code, 'faculty')}
							</div>
						</div>
					</div>

					<div class="section">
						<h2>schedule</h2>
						<div class="set" class:changed={fieldEdited(code, 'offered')}>
							<span class="set-label">
								runs in
								<small>placing it elsewhere shows a red hint</small>
							</span>
							<div>
								<div class="pills">
									{#each [1, 2, 3] as t (t)}
										<button
											class:on={valueOf(code, 'offered').includes(t as TrimNum)}
											aria-pressed={valueOf(code, 'offered').includes(t as TrimNum)}
											onclick={() => setField(code, 'offered', toggleIn(valueOf(code, 'offered'), t as TrimNum))}
											>t{t}</button
										>
									{/each}
								</div>
								{@render was(code, 'offered')}
							</div>
						</div>

						<div class="set" class:changed={fieldEdited(code, 'eligibleYears')}>
							<span class="set-label">open to</span>
							<div>
								<div class="pills">
									{#each [1, 2, 3, 4] as y (y)}
										<button
											class:on={valueOf(code, 'eligibleYears').includes(y)}
											aria-pressed={valueOf(code, 'eligibleYears').includes(y)}
											onclick={() => setField(code, 'eligibleYears', toggleIn(valueOf(code, 'eligibleYears'), y))}
											>Y{y}</button
										>
									{/each}
								</div>
								{@render was(code, 'eligibleYears')}
							</div>
						</div>
					</div>

					<div class="section">
						<h2>prerequisites</h2>
						<div class="set" class:changed={code in prereqEdits}>
							<span class="set-label">
								needs first
								<small>in an earlier trimester</small>
							</span>
							<div>
								<div class="chips">
									{#each prereqsOf(code) as pre (pre)}
										<span class="chip" class:missing={!hasCode(pre)}>
											<button class="c-main" onclick={() => known(pre) && pick(pre)} title={titleOf(pre)}>{pre}</button>
											<button class="c-x" aria-label="remove {pre}" onclick={() => dropPrereq(code, pre)}>×</button>
										</span>
									{:else}
										<span class="none">none</span>
									{/each}
								</div>
								<div class="adder">
									<input
										class="input"
										type="search"
										placeholder="add a prerequisite…"
										bind:value={addQuery}
										onkeydown={(e) => {
											if (e.key === 'Enter' && addQuery.trim() && addCandidates[0]) {
												addPrereq(code, addCandidates[0].code);
												addQuery = '';
											}
										}}
									/>
									{#if addQuery.trim()}
										<div class="add-list">
											{#each addCandidates.slice(0, 8) as c (c.code)}
												<button
													onclick={() => {
														addPrereq(code, c.code);
														addQuery = '';
													}}
												>
													<b>{c.code}</b>
													<span>{titleOf(c.code)}</span>
												</button>
											{:else}
												<p class="empty">nothing matches</p>
											{/each}
										</div>
									{/if}
								</div>
								<p class="was">
									{#if code in prereqEdits}was {(shippedPrereqs[code] ?? []).join(', ') || 'none'}
										<button class="link" onclick={() => setPrereqs(code, shippedPrereqs[code] ?? [])}>reset</button>
									{/if}
									{#if prereqsOf(code).length}
										<button class="link" onclick={() => setPrereqs(code, [])}>remove all</button>
									{/if}
								</p>
							</div>
						</div>

						<div class="set">
							<span class="set-label">
								unlocks
								<small>courses that need this one</small>
							</span>
							<div class="chips">
								{#each sorted.filter((c) => prereqsOf(c.code).includes(code)) as c (c.code)}
									<button class="chip plain" onclick={() => pick(c.code)} title={titleOf(c.code)}>{c.code}</button>
								{:else}
									<span class="none">nothing</span>
								{/each}
							</div>
						</div>
					</div>

					<div class="section">
						<h2>counting &amp; availability</h2>
						<div class="set" class:changed={edits[code]?.share !== undefined}>
							<span class="set-label">
								credit sharing
								<small>when it counts for two programmes</small>
							</span>
							<div>
								<div class="seg">
									<button class:on={edits[code]?.share === undefined} onclick={() => setShare(code, undefined)}
										>default ({shareDefault === 'all' ? 'both' : 'one'})</button
									>
									<button class:on={edits[code]?.share === 'one'} onclick={() => setShare(code, 'one')}
										>one only</button
									>
									<button class:on={edits[code]?.share === 'all'} onclick={() => setShare(code, 'all')}
										>both</button
									>
								</div>
								<p class="help">
									cross-listed codes and the site default live on <a class="link" href="/admin/crosslist?course={code}"
										>cross-listing</a
									>.
								</p>
							</div>
						</div>

						<div class="set" class:changed={isRetired(code)}>
							<span class="set-label">
								availability
								<small>retired courses stay here, hidden from students</small>
							</span>
							<div class="seg">
								<button class:on={!isRetired(code)} onclick={() => setRetired(code, false)}>available</button>
								<button class:on={isRetired(code)} onclick={() => setRetired(code, true)}>retired</button>
							</div>
						</div>

						{#if selected.added}
							<div class="set">
								<span class="set-label">delete</span>
								<div>
									<button class="btn sm danger" class:confirming={deleting} onclick={() => deleteAdded(code)}>
										{deleting ? 'click again to delete' : 'delete this course'}
									</button>
								</div>
							</div>
						{/if}
					</div>
				</div>
			{:else}
				<!-- nothing picked: how the admin works, in five lines -->
				<div class="welcome">
					<h1>course catalogue</h1>
					<p class="e-meta">every change here reaches students once it's exported and published.</p>
					<ol>
						{#each STEPS as [title, body], i (title)}
							<li>
								<span class="n">{i + 1}</span>
								<div><b>{title}</b><span>{body}</span></div>
							</li>
						{/each}
					</ol>
					<p class="help">tip: tick several courses on the left to change them all at once.</p>
				</div>
			{/if}
		</section>

		<!-- ── changes ── -->
		<aside class="log-col">
			<div class="log-head">
				<span>changes{#if changes.length}<b> {changes.length}</b>{/if}</span>
				{#if changes.length}
					<button class="btn ghost sm danger" class:confirming={clearing} onclick={clearAll}>
						{clearing ? 'sure?' : 'clear all'}
					</button>
				{/if}
			</div>

			<div class="log-body">
				{#if cycles.length}
					<div class="note bad cycles">
						<b>{cycles.length} prerequisite loop{cycles.length === 1 ? '' : 's'}</b> — no course in a loop can
						ever be scheduled.
						{#each cycles as cyc, i (i)}
							<button class="link" onclick={() => pick(cyc[0])}>{cyc.join(' → ')}</button>
						{/each}
					</div>
				{/if}

				{#each changes as ch (ch.code + ch.field)}
					<button class="log-item" class:on={ch.code === selectedCode} onclick={() => pick(ch.code)}>
						<span class="l-top"><b>{ch.code}</b> {ch.field}</span>
						<span class="l-diff"><s>{ch.was}</s> {ch.now}</span>
					</button>
				{:else}
					{#if loaded}
						<p class="empty">no changes — the catalogue is as generated</p>
					{/if}
				{/each}
			</div>

			<div class="log-foot">
				{#if dirty}
					<a class="btn primary" href="/" data-sveltekit-reload transition:fade={{ duration: 150 }}
						>see it in the planner ↗</a
					>
				{/if}
				<p class="help">saved in this browser · export to publish</p>
			</div>
		</aside>
	</div>

	{#if adding}
		<div
			class="backdrop"
			role="presentation"
			onclick={(e) => e.target === e.currentTarget && (adding = false)}
			onkeydown={(e) => e.key === 'Escape' && (adding = false)}
			transition:fade={{ duration: 120 }}
		>
			<form
				class="modal"
				onsubmit={(e) => {
					e.preventDefault();
					createCourse();
				}}
				transition:fly={{ y: 12, duration: 180 }}
			>
				<h2>new course</h2>
				<p class="help">starts as a 4-credit elective, every trimester, every year — refine it next.</p>
				<label class="m-field">
					<span>code</span>
					<!-- svelte-ignore a11y_autofocus -->
					<input class="input" bind:value={newCode} placeholder="MATH499" autofocus />
					{#if newError}<em class="err">{newError}</em>{/if}
				</label>
				<label class="m-field">
					<span>title</span>
					<input class="input" bind:value={newTitle} placeholder="Topics in Number Theory" />
				</label>
				<label class="m-field">
					<span>department</span>
					<select class="input" bind:value={newSubject}>
						{#each subjects as sub (sub.id)}
							<option value={sub.id}>{sub.label}</option>
						{/each}
					</select>
				</label>
				<div class="m-acts">
					<button type="button" class="btn" onclick={() => (adding = false)}>cancel</button>
					<button type="submit" class="btn primary" disabled={!newCodeClean || !!newError || !newTitle.trim()}
						>add course</button
					>
				</div>
			</form>
		</div>
	{/if}

	{#if toast}
		<div class="toast" role="status" transition:fly={{ y: 10, duration: 160 }}>{toast}</div>
	{/if}
</div>

{#snippet was(code: string, field: CourseField)}
	{#if fieldEdited(code, field)}
		<p class="was">
			was {fmtField(field, base(code)[field])}
			<button class="link" onclick={() => resetField(code, field)}>reset</button>
		</p>
	{/if}
{/snippet}

<style lang="scss">
	.page {
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	// ── toolbar ──
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.6rem;
		padding: 0.8rem 2rem;
		border-bottom: 1px solid var(--adm-line);
	}

	.counts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem;

		button,
		a {
			padding: 0.3rem 0.8rem;
			font: inherit;
			font-size: 1.25rem;
			color: var(--color-text-muted);
			text-decoration: none;
			background: none;
			border: 0;
			border-radius: 5px;
			cursor: pointer;

			b {
				color: var(--color-text);
				font-variant-numeric: tabular-nums;
			}

			&:hover {
				background: var(--color-hover-medium);
			}

			&.on {
				background: var(--color-bg);
			}

			&.bad b {
				color: var(--color-danger);
			}
		}
	}

	.tools {
		display: flex;
		gap: 0.5rem;
	}

	// ── three columns ──
	.cols {
		display: grid;
		grid-template-columns: 32rem minmax(0, 1fr) 30rem;
		flex: 1;
		min-height: 0;
	}

	.list-col,
	.log-col {
		display: flex;
		flex-direction: column;
		min-height: 0;
		background: var(--color-bg-sidebar);
	}

	.list-col {
		border-right: 1px solid var(--adm-line);
	}

	.log-col {
		border-left: 1px solid var(--adm-line);
	}

	.list-head {
		display: grid;
		gap: 0.5rem;
		padding: 1rem;
	}

	.list-filters {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;

		.input {
			font-size: 1.2rem;
		}
	}

	.select-all {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		padding: 0.4rem 1.2rem;
		font-size: 1.15rem;
		color: var(--color-text-muted);
		border-bottom: 1px solid var(--adm-line);
		cursor: pointer;
	}

	.list,
	.log-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;

		&:focus {
			outline: none;
		}
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		padding-left: 1.2rem;

		&:hover {
			background: var(--color-hover);
		}

		&.checked {
			background: var(--color-active);
		}

		&.on {
			background: var(--color-bg-light);
			box-shadow: inset 2px 0 0 var(--color-accent);
		}
	}

	.row-main {
		display: grid;
		grid-template-columns: 7.4rem minmax(0, 1fr) auto;
		align-items: baseline;
		gap: 0.6rem;
		flex: 1;
		min-width: 0;
		padding: 0.6rem 1.2rem 0.6rem 0.6rem;
		font: inherit;
		font-size: 1.25rem;
		text-align: left;
		color: var(--color-text);
		background: none;
		border: 0;
		cursor: pointer;

		.r-code {
			font-weight: 600;
		}

		.r-title {
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
			color: var(--color-text-muted);
		}

		.r-flags {
			display: flex;
			align-items: center;
			gap: 0.4rem;
		}

		&.retired .r-code,
		&.retired .r-title {
			text-decoration: line-through;
			opacity: 0.55;
		}
	}

	.dot {
		width: 0.6rem;
		height: 0.6rem;
		background: var(--color-accent);
		border-radius: 50%;

		&.bad {
			background: var(--color-danger);
		}
	}

	.list-foot {
		padding: 0.6rem 1.2rem;
		font-size: 1.1rem;
		color: var(--color-text-muted);
		border-top: 1px solid var(--adm-line);
	}

	// ── editor ──
	.editor {
		min-width: 0;
		overflow-y: auto;
	}

	.e-inner {
		max-width: 76rem;
		padding: 2.4rem var(--adm-pad) 6rem;
	}

	.e-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1.6rem;
		margin-bottom: 1.2rem;

		h1 {
			margin-top: 0.2rem;
			font-size: 2.2rem;
			font-weight: 700;
			line-height: 1.25;
		}
	}

	.e-kicker {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 1.2rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--color-accent);
	}

	.e-meta {
		margin-top: 0.3rem;
		font-size: 1.25rem;
		color: var(--color-text-muted);
	}

	.note + .note,
	.note + .section,
	.e-head + .note {
		margin-top: 0.8rem;
	}

	.note .link {
		margin-left: 0.6rem;
	}

	.stepper {
		display: inline-flex;
		align-items: center;
		border: 1px solid var(--adm-line-strong);
		border-radius: 6px;

		button {
			width: 3rem;
			height: 3rem;
			font: inherit;
			font-size: 1.6rem;
			color: var(--color-text);
			background: none;
			border: 0;
			cursor: pointer;

			&:hover:not(:disabled) {
				background: var(--color-hover-medium);
			}

			&:disabled {
				opacity: 0.3;
				cursor: default;
			}
		}

		.num {
			min-width: 3.6rem;
			font-size: 1.5rem;
			font-weight: 700;
			text-align: center;
			font-variant-numeric: tabular-nums;
		}
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		padding-top: 0.3rem;
	}

	.chip {
		display: inline-flex;
		align-items: stretch;
		font-size: 1.2rem;
		border: 1px solid var(--adm-line-strong);
		border-radius: 5px;
		overflow: hidden;

		.c-main,
		&.plain {
			padding: 0.3rem 0.7rem;
			font: inherit;
			font-size: 1.2rem;
			font-weight: 600;
			color: var(--color-text);
			background: none;
			border: 0;
			cursor: pointer;

			&:hover {
				background: var(--color-hover-medium);
			}
		}

		&.plain {
			border: 1px solid var(--adm-line-strong);
		}

		.c-x {
			padding: 0 0.6rem;
			font-size: 1.4rem;
			line-height: 1;
			color: var(--color-text-muted);
			background: none;
			border: 0;
			border-left: 1px solid var(--adm-line);
			cursor: pointer;

			&:hover {
				color: var(--color-danger);
			}
		}

		&.missing {
			border-color: var(--color-danger);
		}
	}

	.none {
		font-size: 1.2rem;
		color: var(--color-text-muted);
	}

	.adder {
		position: relative;
		max-width: 36rem;
		margin-top: 0.8rem;
	}

	.add-list {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		z-index: 5;
		overflow: hidden;
		background: var(--color-bg-light);
		border: 1px solid var(--adm-line-strong);
		border-radius: 6px;
		box-shadow: var(--shadow-card-hover);

		button {
			display: grid;
			grid-template-columns: 7.4rem minmax(0, 1fr);
			gap: 0.6rem;
			width: 100%;
			padding: 0.5rem 0.9rem;
			font: inherit;
			font-size: 1.2rem;
			text-align: left;
			color: var(--color-text);
			background: none;
			border: 0;
			cursor: pointer;

			span {
				overflow: hidden;
				white-space: nowrap;
				text-overflow: ellipsis;
				color: var(--color-text-muted);
			}

			&:hover,
			&:first-child {
				background: var(--color-hover-medium);
			}
		}
	}

	.bulk {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.b-pair {
		display: inline-flex;
		gap: 0.2rem;
		margin-right: 0.6rem;
	}

	.num {
		width: 7rem;
	}

	// ── empty state ──
	.welcome {
		max-width: 56rem;
		padding: 5rem var(--adm-pad);

		h1 {
			font-size: 2.2rem;
			font-weight: 700;
		}

		ol {
			margin: 2.4rem 0 1.6rem;
			padding: 0;
			list-style: none;
		}

		li {
			display: flex;
			gap: 1.2rem;
			padding: 1rem 0;
			border-top: 1px solid var(--adm-line);

			.n {
				flex: none;
				width: 2.2rem;
				height: 2.2rem;
				font-size: 1.15rem;
				font-weight: 700;
				line-height: 2.2rem;
				text-align: center;
				color: var(--color-accent);
				border: 1px solid var(--color-accent);
				border-radius: 50%;
			}

			b {
				display: block;
			}

			span {
				font-size: 1.25rem;
				color: var(--color-text-muted);
			}
		}
	}

	// ── changes ──
	.log-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 4.4rem;
		padding: 0.6rem 1.2rem;
		font-weight: 600;
		border-bottom: 1px solid var(--adm-line);

		b {
			color: var(--color-accent);
		}
	}

	.cycles {
		margin: 1rem;

		.link {
			display: block;
			margin: 0.4rem 0 0;
			text-align: left;
		}
	}

	.log-item {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		width: 100%;
		padding: 0.7rem 1.2rem;
		font: inherit;
		text-align: left;
		color: var(--color-text);
		background: none;
		border: 0;
		border-bottom: 1px solid var(--adm-line);
		cursor: pointer;

		&:hover {
			background: var(--color-hover);
		}

		&.on {
			background: var(--color-bg-light);
		}

		.l-top {
			font-size: 1.2rem;
			color: var(--color-text-muted);

			b {
				color: var(--color-text);
			}
		}

		.l-diff {
			font-size: 1.2rem;
			overflow-wrap: anywhere;

			s {
				margin-right: 0.4rem;
				color: var(--color-text-muted);
			}
		}
	}

	.log-foot {
		display: grid;
		gap: 0.6rem;
		padding: 1rem 1.2rem;
		border-top: 1px solid var(--adm-line);
		text-align: center;
	}

	// ── new-course dialog ──
	.backdrop {
		position: absolute;
		inset: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-backdrop);
	}

	.modal {
		width: 42rem;
		max-width: calc(100% - 3.2rem);
		padding: 2.2rem;
		background: var(--color-bg-light);
		border-radius: 10px;
		box-shadow: var(--shadow-card-hover);

		h2 {
			font-size: 1.8rem;
			font-weight: 700;
		}
	}

	.m-field {
		display: block;
		margin-top: 1.2rem;

		> span {
			display: block;
			margin-bottom: 0.4rem;
			font-size: 1.2rem;
			font-weight: 600;
		}

		.err {
			display: block;
			margin-top: 0.4rem;
			font-size: 1.15rem;
			font-style: normal;
			color: var(--color-danger);
		}
	}

	.m-acts {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
		margin-top: 2rem;
	}

	.toast {
		position: absolute;
		left: 50%;
		bottom: 2rem;
		z-index: 30;
		padding: 0.7rem 1.4rem;
		font-size: 1.2rem;
		color: var(--color-on-accent);
		background: var(--color-text);
		border-radius: 999px;
		transform: translateX(-50%);
	}
</style>
