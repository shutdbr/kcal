<script lang="ts">
	import { ALL_COURSES, byCode, isCore } from '$lib/data';
	import { CANVAS_IMPORT_LIMIT, matchCanvasCourse, parseCanvasImport, type CanvasImport } from '$lib/canvasImport';
	import type { Plan } from '$lib/plan.svelte';
	import type { TrimNum } from '$lib/types';
	import Modal from './Modal.svelte';

	let { plan, initial = null, initialError = '' }: {
		plan: Plan; initial?: CanvasImport | null; initialError?: string;
	} = $props();
	let open = $state(false);
	let payload = $state<CanvasImport | null>(null);
	let choices = $state<string[]>([]);
	let slot = $state('');
	let error = $state('');
	let result = $state('');
	const catalogue = [...ALL_COURSES].filter((c) => !c.retired).sort((a, b) => a.code.localeCompare(b.code));
	const existing = $derived(new Set(Object.values(plan.placements).flat()));
	const target = $derived(slot.split('-').map(Number));
	const selected = $derived([...new Set(choices.filter(Boolean))]);
	const newCodes = $derived(selected.filter((code) => !existing.has(code)));
	const blocked = $derived(newCodes.filter((code) => {
		const c = byCode(code);
		return (c.pendingCredits && c.credits === 0) || (target[0] === 1 && target[1] !== 3 && !isCore(code));
	}));

	function load(data: CanvasImport) {
		payload = data;
		choices = data.courses.map((row) => {
			const matches = matchCanvasCourse(row, catalogue);
			return matches.length === 1 ? matches[0] : '';
		});
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
			load(parseCanvasImport(await file.text()));
		} catch (e) { error = e instanceof Error ? e.message : 'Could not open that file.'; }
		input.value = '';
	}

	function apply() {
		if (!slot || !newCodes.length || blocked.length) return;
		const added = plan.importCanvasCourses(newCodes, target[0], target[1] as TrimNum);
		result = `Added ${added.length} course${added.length === 1 ? '' : 's'} to year ${target[0]}, trimester ${target[1]}. Your other placements are unchanged.`;
	}
</script>

<button class="entry" onclick={() => (open = true)}>import from Canvas ↗</button>

{#if open}
	<Modal title="import from Canvas" width="76rem" onclose={() => (open = false)}>
		<div class="importer">
			<p>Bring your current courses into your plan. Review the matches and choose a trimester before adding them.</p>
			<details open={!payload}>
				<summary>Get the browser extension</summary>
				<ol>
					<li><a href="/downloads/kcal-canvas-extension.zip" download>Download the extension</a> and unzip it.</li>
					<li>Chrome / Edge: open Extensions, enable Developer mode, choose Load unpacked, and select the unzipped folder. Firefox: use about:debugging → This Firefox → Load Temporary Add-on → manifest.json.</li>
					<li>Sign in at <a href="https://canvas.krea.edu.in/courses" target="_blank" rel="noreferrer">Canvas → All Courses</a>. Click the extension, read your courses, then choose Review in kcal.</li>
				</ol>
				<p>The extension reads course names and terms on that page. It does not collect your password or grades. Firefox temporary installs last until you restart the browser.</p>
			</details>
			<label class="file">Or open a course list saved by the extension
				<input type="file" accept=".json,application/json" onchange={readFile} />
			</label>
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			{#if payload}
				<p>Canvas may keep older courses in its current list. Skip anything you are not taking this trimester. Courses already in your plan keep their existing position.</p>
				<div class="rows">
					{#each payload.courses as row, i}
						<div class="course-row">
							<div><strong>{row.name}</strong><small>{row.term || 'No term supplied by Canvas'}</small></div>
							<label>
								<span>Match in kcal</span>
								<select bind:value={choices[i]} aria-label={`Catalogue match for ${row.name}`} onchange={() => (result = '')}>
									<option value="">Skip / choose a course</option>
									{#each catalogue as course (course.code)}
										<option value={course.code}>{course.code} · {course.title}</option>
									{/each}
								</select>
								{#if choices[i] && existing.has(choices[i])}<small>Already in your plan · kept in place</small>
								{:else if !choices[i]}<small>Skipped until you choose a match</small>{/if}
							</label>
						</div>
					{/each}
				</div>
				<label class="target">Add new courses to
					<select bind:value={slot} onchange={() => (result = '')}>
						<option value="">Choose your year and trimester</option>
						{#each plan.years as year}{#each plan.trims as trim}
							<option value={`${year}-${trim}`}>Year {year} · Trimester {trim}</option>
						{/each}{/each}
					</select>
				</label>
				{#if slot && blocked.length}<p class="error">{blocked.join(', ')} cannot be added here. Year 1 T1/T2 accept foundation courses only; courses with unconfirmed credits must be resolved in admin. Choose another trimester or skip these courses.</p>{/if}
				<p class="note">New courses are added alongside your plan. Existing courses are never moved or removed. The planner will flag prerequisite, offering, and credit-load issues.</p>
				<button class="primary" disabled={!slot || !newCodes.length || blocked.length > 0} onclick={apply}>Add {newCodes.length} new course{newCodes.length === 1 ? '' : 's'}</button>
				{#if result}<p role="status">{result}</p>{/if}
			{/if}
		</div>
	</Modal>
{/if}

<style lang="scss">
	.entry { margin: 1rem 1.4rem; padding: .8rem; color: var(--color-accent); background: var(--color-bg-board-page); border: 1px solid var(--color-border); border-radius: 4px; font: inherit; cursor: pointer; }
	.importer { display: grid; gap: 1.6rem; font-size: 1.4rem; line-height: 1.5; color: var(--color-text); }
	p { margin: 0; }
	a { color: var(--color-accent); text-decoration: underline; }
	details { border: 1px solid var(--color-border); padding: 1.2rem; border-radius: 6px; }
	summary { cursor: pointer; font-weight: 600; }
	ol { padding-left: 2rem; margin: 1rem 0; }
	li { margin: .6rem 0; }
	label { display: grid; gap: .5rem; min-width: 0; }
	input, select { max-width: 100%; min-width: 0; padding: .7rem; font: inherit; color: var(--color-text); background: var(--color-bg-board-page); border: 1px solid var(--color-border); border-radius: 4px; }
	.rows { border-top: 1px solid var(--color-border); }
	.course-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1.6rem; padding: 1.4rem 0; border-bottom: 1px solid var(--color-border); }
	strong { overflow-wrap: anywhere; }
	small { display: block; color: var(--color-text-muted); font-size: 1.2rem; margin-top: .4rem; }
	.note { color: var(--color-text-muted); }
	.error { color: var(--color-text); border-left: 3px solid #bb4242; padding-left: 1rem; }
	.primary { justify-self: start; padding: 1rem 1.5rem; font: inherit; background: var(--color-accent); color: white; border: 0; border-radius: 5px; cursor: pointer; }
	.primary:disabled { opacity: .45; cursor: default; }
	@media (max-width: 600px) { .course-row { grid-template-columns: 1fr; } }
</style>
