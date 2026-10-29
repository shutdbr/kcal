<script lang="ts">
	import { onMount } from 'svelte';
	import Modal from './Modal.svelte';
	import { SUBJECTS, departmentFaculty, facultyCourses } from '$lib/data';
	import type { Plan } from '$lib/plan.svelte';

	let { plan, onclose }: { plan: Plan; onclose: () => void } = $props();
	let subject = $state('');
	let search = $state('');
	let searchInput: HTMLInputElement;
	const subjects = SUBJECTS.filter((s) => departmentFaculty[s.id]?.length);
	const entries = subjects.flatMap((s) => departmentFaculty[s.id].map((person) => ({
		person, subject: s.id, courses: facultyCourses(person)
	})));
	let results = $derived.by(() => {
		const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
		return entries.filter((entry) => {
			if (subject && entry.subject !== subject) return false;
			const text = [entry.person.name, entry.person.position, entry.person.email, entry.subject,
				...entry.courses.flatMap((c) => [c.title, ...c.codes])].join(' ').toLowerCase();
			return words.every((word) => text.includes(word));
		});
	});

	onMount(() => {
		subject = plan.picks.major1;
		const trigger = document.activeElement;
		searchInput.focus();
		return () => { if (trigger instanceof HTMLElement) trigger.focus(); };
	});

	function openCourse(code: string) {
		plan.revealCourse(code);
		onclose();
	}
</script>

<Modal title="department guide" width="76rem" {onclose}>
	<div class="guide">
		<p class="intro">Find faculty, office hours, and courses across Krea’s departments. Directory information comes from kreabot; check a faculty profile for current details.</p>
		<div class="filters">
			<label>department
				<select bind:value={subject}>
					<option value="">all departments</option>
					{#each subjects as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
				</select>
			</label>
			<label>search faculty or courses
				<input bind:this={searchInput} bind:value={search} type="search" placeholder="Name, course title, or code" />
			</label>
		</div>
		<p class="result-count" role="status">{results.length} {results.length === 1 ? 'faculty profile' : 'faculty profiles'}</p>
		{#if !results.length}
			<p class="empty">No matching faculty. Try another name or choose all departments.</p>
		{/if}
		{#each results as entry (entry.subject + '/' + entry.person.id)}
			{@const p = entry.person}
			<article>
				<h3>{p.name}</h3>
				<p class="muted">{p.position || p.role?.replaceAll('-', ' ') || 'Faculty'} · {entry.subject}</p>
				{#if p.office_hours}<p><b>office hours</b> {p.office_hours}</p>{/if}
				{#if p.location}<p><b>office</b> {p.location}</p>{/if}
				{#if p.education?.length}<p>{p.education.join(' · ')}</p>{/if}
				<div class="links">
					{#if p.email}<a href="mailto:{p.email}">{p.email}</a>{/if}
					{#if p.url}<a href={p.url} target="_blank" rel="noopener noreferrer">faculty profile ↗</a>{/if}
				</div>
				{#if entry.courses.length}
					<details>
						<summary>courses in the catalogue ({entry.courses.length})</summary>
						<p class="muted">Listed teaching associations; instructors can change each term.</p>
						<ul>
							{#each entry.courses as course (course.code)}
								<li><button onclick={() => openCourse(course.code)}>{course.title} <span class="muted">{course.code}</span></button></li>
							{/each}
						</ul>
					</details>
				{:else}
					<p class="muted">No linked courses in this catalogue.</p>
				{/if}
			</article>
		{/each}
	</div>
</Modal>

<style lang="scss">
	.guide { font-size: var(--text-body); line-height: 1.6; color: var(--color-text); }
	.intro, .muted, .result-count { color: var(--color-text-muted); }
	.intro { margin-bottom: 1.6rem; }
	.filters { display: grid; grid-template-columns: 1fr 1.5fr; gap: 1.2rem; }
	label { display: flex; flex-direction: column; gap: 0.4rem; min-width: 0; }
	input, select {
		width: 100%; min-width: 0; padding: 0.7rem; font: inherit;
		color: var(--color-text); background: var(--color-bg-light);
		border: 1px solid var(--color-border-card); border-radius: 4px;
	}
	.result-count { margin: 1rem 0; }
	article { padding: 1.6rem 0; border-top: 1px solid var(--color-border-divider); }
	h3 { font-size: 1.6rem; font-weight: 600; }
	p { margin: 0.4rem 0; }
	b { font-weight: 600; margin-right: 0.5rem; }
	.links { display: flex; flex-wrap: wrap; gap: 0.5rem 1.6rem; overflow-wrap: anywhere; }
	a, button { color: var(--color-accent); }
	details { margin-top: 1rem; }
	summary { cursor: pointer; }
	ul { padding-left: 1.8rem; }
	button { padding: 0.25rem 0; border: 0; background: none; text-align: left; font: inherit; cursor: pointer; }
	button:hover { text-decoration: underline; }
	.empty { padding: 2rem 0; }
	@media (max-width: 600px) { .filters { grid-template-columns: 1fr; } }
</style>
