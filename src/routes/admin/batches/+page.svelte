<script lang="ts">
	import { COURSES, PROGRAMME_SUBJECTS, requiredSetFor, electiveSetFor, pickSetFor, requiredCreditsFor, creditsFor } from '$lib/data';
	import { batchKey, loadBatchEdits, saveBatchEdits, type BatchRule } from '$lib/batchEdits';
	import type { ProgrammeRole } from '$lib/types';
	let edits = $state(loadBatchEdits());
	let year = $state(2026);
	let subject = $state('computer science');
	let role = $state<ProgrammeRole>('major');
	let fourYear = $state(true);
	let double = $state(false);
	let search = $state('');
	let message = $state('');
	let key = $derived(batchKey(year, subject, role, fourYear, double));
	let rule = $derived(edits[key] ?? { courses: {} });
	let required = $derived(new Set([...requiredSetFor(subject, role, fourYear, double), ...pickSetFor(subject, role, fourYear, double)]));
	let elective = $derived(new Set(electiveSetFor(subject, role, fourYear, double)));
	let baseCredits = $derived(requiredCreditsFor(subject, role, fourYear, double));
	let totalCredits = $derived(creditsFor(subject, role, fourYear, double));
	let courses = $derived(COURSES.filter(c => c.subject !== 'core' && (c.subjects.includes(subject) || c.code in rule.courses || required.has(c.code)) &&
		`${c.codes.join(' ')} ${c.title}`.toLowerCase().includes(search.toLowerCase())));
	function commit(next: BatchRule) {
		if (next.requiredCredits !== undefined && next.requiredCredits > totalCredits) { message = 'Required credits cannot exceed the programme total.'; return; }
		const updated = { ...edits, [key]: next };
		if (!Object.keys(next.courses).length && next.requiredCredits === undefined) delete updated[key];
		try { saveBatchEdits(updated); edits = updated; message = 'Saved in this browser. Open the planner to apply.'; }
		catch { message = 'Could not save. Browser storage may be full or unavailable.'; }
	}
	function setCourse(code: string, value: string) {
		const courses = { ...rule.courses };
		if (value === 'required' || value === 'elective') courses[code] = value; else delete courses[code];
		commit({ ...rule, courses });
	}
</script>

<h1>Batch requirements</h1>
<p class="intro">Every batch inherits the same curriculum. Override only the courses that changed for a specific batch, programme and degree track. Other batches stay unchanged.</p>
<div class="selectors">
	<label>Batch starts<select bind:value={year}>{#each [2022,2023,2024,2025,2026] as y}<option value={y}>{y}</option>{/each}</select></label>
	<label>Subject<select bind:value={subject}>{#each PROGRAMME_SUBJECTS as s}<option value={s.id}>{s.label}</option>{/each}</select></label>
	<label>Role<select bind:value={role}><option value="major">major</option><option value="minor">minor</option><option value="concentration">concentration</option></select></label>
	<label class="check"><input type="checkbox" bind:checked={fourYear} />4-year</label>
	{#if role === 'major'}<label class="check"><input type="checkbox" bind:checked={double} />double major</label>{/if}
</div>
<div class="budget">
	<label>Required credits <input type="number" min="0" max={totalCredits} placeholder={String(baseCredits ?? 'shared default')} value={rule.requiredCredits ?? ''}
		onchange={(e) => {
			const value = e.currentTarget.value;
			if (value !== '' && (!Number.isInteger(Number(value)) || Number(value) < 0)) { message = 'Enter a non-negative whole number.'; return; }
			commit({ ...rule, requiredCredits: value === '' ? undefined : Number(value) });
		}} /></label>
	<span>Blank inherits the default. Programme total: {totalCredits} cr.</span>
	<button onclick={() => commit({ courses: {} })} disabled={!edits[key]}>Reset this batch / track</button>
</div>
<p class="status" role="status">{message || `${Object.keys(rule.courses).length} course overrides for ${year}-${String(year + (fourYear ? 4 : 3)).slice(-2)}`}</p>
<input class="search" type="search" aria-label="find a course" placeholder="Find a course" bind:value={search} />
<table>
	<thead><tr><th>Course</th><th>Shared default</th><th>This batch</th></tr></thead>
	<tbody>{#each courses as c (c.code)}
		<tr class:changed={!!rule.courses[c.code]}><td><strong>{c.code}</strong> {c.title}</td><td>{required.has(c.code) ? 'required' : elective.has(c.code) || c.subjects.includes(subject) ? 'elective' : 'other'}</td>
			<td><select aria-label={`Requirement for ${c.code}`} value={rule.courses[c.code] ?? ''} onchange={(e) => setCourse(c.code, e.currentTarget.value)}>
				<option value="">inherit default</option><option value="required">required</option><option value="elective">elective</option>
			</select></td></tr>
	{/each}</tbody>
</table>
<p class="intro">Batch overrides are included in the courses page’s export / import file. Switching batches does not move courses in an edited student plan.</p>

<style>
	h1 { font-size: 2rem; margin-bottom: 1rem; }
	.intro { max-width: 85rem; line-height: 1.6; margin: 1rem 0 2rem; color: var(--color-text-muted); font-size: 1.4rem; }
	.selectors, .budget { display: flex; align-items: end; gap: 1.6rem; flex-wrap: wrap; margin: 1.6rem 0; font-size: 1.3rem; }
	label { display: flex; flex-direction: column; gap: .6rem; }
	.check { flex-direction: row; align-items: center; padding-bottom: .8rem; }
	select, input, button { padding: .7rem 1rem; border: 1px solid var(--color-border-card); border-radius: 4px; background: var(--color-bg-light); color: var(--color-text); font: inherit; }
	button { cursor: pointer; } button:disabled { opacity: .5; }
	.status { min-height: 2rem; font-size: 1.3rem; }
	.search { width: 32rem; margin: 1rem 0; }
	table { width: 100%; border-collapse: collapse; font-size: 1.3rem; }
	th, td { text-align: left; padding: 1rem; border-bottom: 1px solid var(--color-border-light); }
	th { color: var(--color-text-muted); } strong { margin-right: 1rem; }
	.changed { background: var(--color-hover-medium); }
</style>
