<script lang="ts">
	import { ALL_COURSES, byCode, isCore } from '$lib/data';
	import { CANVAS_IMPORT_LIMIT, groupCanvasCourses, matchCanvasCourse, parseCourseImport, type CanvasImport, type CourseImport } from '$lib/canvasImport';
	import type { Plan } from '$lib/plan.svelte';
	import type { TrimNum } from '$lib/types';
	import Modal from './Modal.svelte';
	import ExamImportPanel from '$lib/features/plans/ExamImportPanel.svelte';
	import { examRecord } from '$lib/features/plans/exam-record.svelte';
	import type { ExamImport } from '$lib/features/plans/exam-import';

	// opened from settings, or straight away when the extension hands a course
	// list over in the URL fragment
	let { plan, open = $bindable(false), initial = null, initialError = '' }: {
		plan: Plan; open?: boolean; initial?: CourseImport | null; initialError?: string;
	} = $props();
	let payload = $state<CanvasImport | null>(null);
	let examPayload = $state<ExamImport | null>(null);
	let choices = $state<string[]>([]);
	// one target trimester per Canvas term, as "year-trim" ('' = not added)
	let slots = $state<string[]>([]);
	let error = $state('');
	let result = $state('');
	const catalogue = [...ALL_COURSES].filter((c) => !c.retired).sort((a, b) => a.code.localeCompare(b.code));
	const existing = $derived(new Set(Object.values(plan.placements).flat()));
	const groups = $derived(payload ? groupCanvasCourses(payload.courses) : []);
	const target = (slot: string) => slot.split('-').map(Number) as [number, TrimNum];
	// what "add" would place: the first time a course comes up, in its term's
	// trimester. Already planned, unmatched, or no trimester chosen → nothing.
	const assigned = $derived.by(() => {
		const out = new Map<string, number>(); // code → group index
		groups.forEach((group, gi) => {
			if (!slots[gi]) return;
			for (const i of group.rows) {
				const code = choices[i];
				if (code && !existing.has(code) && !out.has(code)) out.set(code, gi);
			}
		});
		return out;
	});
	const blocked = $derived(groups.map((_, gi) => {
		if (!slots[gi]) return [];
		const [year, trim] = target(slots[gi]);
		return [...assigned].filter(([, g]) => g === gi).map(([code]) => code).filter((code) => {
			const c = byCode(code);
			return (c.pendingCredits && c.credits === 0) || (plan.coreOnly(year, trim) && !isCore(code));
		});
	}));
	const anyBlocked = $derived(blocked.some((codes) => codes.length));
	const enrollmentLabel = { past: 'past', current: 'current', future: 'upcoming' } as const;

	// a term kcal can read lands in the matching trimester of your batch
	function suggestSlot(parsed: (typeof groups)[number]['parsed']) {
		if (!parsed) return '';
		const year = parsed.startYear - plan.batchStartYear + 1;
		return plan.years.includes(year) ? `${year}-${parsed.trim}` : '';
	}

	function load(data: CourseImport) {
		if (data.version === 3) { examPayload = data; payload = null; error = result = ''; open = true; return; }
		examPayload = null;
		payload = data;
		choices = data.courses.map((row) => {
			const matches = matchCanvasCourse(row, catalogue);
			return matches.length === 1 ? matches[0] : '';
		});
		slots = groupCanvasCourses(data.courses).map((group) => suggestSlot(group.parsed));
		error = result = '';
		open = true;
	}
	$effect(() => { if (initial) load(initial); });
	$effect(() => { if (initialError) { error = initialError; open = true; } });

	async function readFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			if (file.size > CANVAS_IMPORT_LIMIT) throw new Error('The course list file is too large.');
			load(parseCourseImport(await file.text()));
		} catch (e) { error = e instanceof Error ? e.message : 'Could not open that file.'; }
		input.value = '';
	}

	function apply() {
		if (!assigned.size || anyBlocked) return;
		const added = plan.importCanvasCourses(groups.map((_, gi) => {
			const [year, trim] = target(slots[gi] || '0-1');
			return { codes: [...assigned].filter(([, g]) => g === gi).map(([code]) => code), year, trim };
		}).filter((g) => g.codes.length));
		const trims = new Set(added.map((a) => `${a.year}-${a.trim}`)).size;
		result = `Added ${added.length} course${added.length === 1 ? '' : 's'} across ${trims} trimester${trims === 1 ? '' : 's'}. Your other placements are unchanged.`;
	}
</script>

{#if open && examPayload}
	<ExamImportPanel {plan} data={examPayload} onclose={() => open = false} onback={() => examPayload = null} />
{:else if open}
	<Modal title="import courses & grades" width="76rem" onclose={() => (open = false)}>
		<div class="importer">
			<p><strong>Local import. No automatic uploads.</strong> The extension runs only when clicked and reads no passwords, login tokens or student profile. Imported data is saved in this browser. Saving a plan to your account is a separate, explicit action.</p>
			{#if examRecord.data}<button class="primary" onclick={() => examPayload = examRecord.data}>View saved mark list on this device</button>{/if}
			{#if examRecord.error}<p role="alert">{examRecord.error}</p>{/if}
			<details open={!payload}>
				<summary>Get the browser extension</summary>
				<ol>
					<li><a href="/downloads/kcal-canvas-extension.zip" download>Download the extension</a> and unzip it.</li>
					<li>Chrome / Edge: open Extensions, enable Developer mode, choose Load unpacked, and select the unzipped folder. Firefox: use about:debugging → This Firefox → Load Temporary Add-on → manifest.json.</li>
					<li>Open <a href="https://oe.krea.edu.in/krea/my_mark/" target="_blank" rel="noreferrer">Krea Exam → My Mark List</a>, click the extension, then Read this page locally → Review in kcal. <a href="https://canvas.krea.edu.in/courses" target="_blank" rel="noreferrer">Canvas → All Courses</a> is also supported.</li>
				</ol>
				<p>Version 0.3.0 reads course codes, titles, terms, grades and credits from Krea Exam, or course names and terms from Canvas. Reload the extension after updating. Firefox temporary installs last until you restart the browser.</p>
			</details>
			<label class="file">Or open a course list saved by the extension
				<input type="file" accept=".json,application/json" onchange={readFile} />
			</label>
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			{#if payload}
				<p>Trimesters are suggested from your batch ({plan.batchStartYear}). Courses already in your plan stay where they are.</p>
				{#each groups as group, gi}
					<section class="term">
						<div class="term-head">
							<div>
								<strong>{group.term || 'No term supplied by Canvas'}</strong>
								<small>{enrollmentLabel[group.enrollment]} · {group.rows.length} course{group.rows.length === 1 ? '' : 's'}</small>
							</div>
							<label>
								<span>Add to</span>
								<select bind:value={slots[gi]} aria-label={`Trimester for ${group.term || 'courses with no term'}`} onchange={() => (result = '')}>
									<option value="">Don't add this term</option>
									{#each plan.years as year}{#each plan.trims as trim}
										<option value={`${year}-${trim}`}>Year {year} · Trimester {trim}</option>
									{/each}{/each}
								</select>
							</label>
						</div>
						{#each group.rows as i}
							{@const code = choices[i]}
							<div class="course-row">
								<div><strong>{payload.courses[i].name}</strong></div>
								<label>
									<span>Match in kcal</span>
									<select bind:value={choices[i]} aria-label={`Catalogue match for ${payload.courses[i].name}`} onchange={() => (result = '')}>
										<option value="">Skip / choose a course</option>
										{#each catalogue as course (course.code)}
											<option value={course.code}>{course.code} · {course.title}</option>
										{/each}
									</select>
									{#if code && existing.has(code)}<small>Already in your plan · kept in place</small>
									{:else if code && slots[gi] && assigned.get(code) !== gi}<small>Also in an earlier term · added there once</small>
									{:else if !code}<small>Skipped until you choose a match</small>{/if}
								</label>
							</div>
						{/each}
						{#if blocked[gi].length}<p class="error">{blocked[gi].join(', ')} cannot go in Year {target(slots[gi])[0]} · Trimester {target(slots[gi])[1]}. Year 1 T1/T2 accept foundation courses only; courses with unconfirmed credits must be resolved in admin. Choose another trimester or skip these courses.</p>{/if}
					</section>
				{/each}
				<p class="note">New courses are added alongside your plan. Existing courses are never moved or removed. The planner will flag prerequisite, offering, and credit-load issues.</p>
				<button class="primary" disabled={!assigned.size || anyBlocked} onclick={apply}>Add {assigned.size} new course{assigned.size === 1 ? '' : 's'}</button>
				{#if result}<p role="status">{result}</p>{/if}
			{/if}
		</div>
	</Modal>
{/if}

<style lang="scss">
	.importer { display: grid; gap: 1.6rem; font-size: 1.4rem; line-height: 1.5; color: var(--color-text); }
	p { margin: 0; }
	a { color: var(--color-accent); text-decoration: underline; }
	details { border: 1px solid var(--color-border); padding: 1.2rem; border-radius: 6px; }
	summary { cursor: pointer; font-weight: 600; }
	ol { padding-left: 2rem; margin: 1rem 0; }
	li { margin: .6rem 0; }
	label { display: grid; gap: .5rem; min-width: 0; }
	input, select { max-width: 100%; min-width: 0; padding: .7rem; font: inherit; color: var(--color-text); background: var(--color-bg-board-page); border: 1px solid var(--color-border); border-radius: 4px; }
	.term { border-top: 1px solid var(--color-border); }
	.term-head { display: grid; grid-template-columns: 1fr 1fr; gap: 1.6rem; align-items: end; padding: 1.4rem 0; border-bottom: 1px dotted var(--color-border); }
	.term .error { margin: 1rem 0; }
	.course-row:last-of-type { border-bottom: 0; }
	.course-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1.6rem; padding: 1.4rem 0; border-bottom: 1px solid var(--color-border); }
	strong { overflow-wrap: anywhere; }
	small { display: block; color: var(--color-text-muted); font-size: 1.2rem; margin-top: .4rem; }
	.note { color: var(--color-text-muted); }
	.error { color: var(--color-text); border-left: 3px solid #bb4242; padding-left: 1rem; }
	.primary { justify-self: start; padding: 1rem 1.5rem; font: inherit; background: var(--color-accent); color: white; border: 0; border-radius: 5px; cursor: pointer; }
	.primary:disabled { opacity: .45; cursor: default; }
	@media (max-width: 600px) { .course-row, .term-head { grid-template-columns: 1fr; } }
</style>
