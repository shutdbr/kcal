<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import type { Course } from '$lib/types';
	import { facultyOf, isCore, taughtBy, termLabel } from '$lib/data';
	import { reducedMotion } from '$lib/transitions';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	let { plan, course: c }: { plan: Plan; course: Course } = $props();
	let profs = $derived(facultyOf(c.code));
	// "01-Jan-19" → "2019"
	const joinedYear = (date?: string) => {
		const yy = date?.match(/(\d{2})$/)?.[1];
		return yy ? `20${yy}` : '';
	};

	// lecturers whose "courses taught" is unfolded — kept while moving between
	// courses, so someone you opened stays open
	let openTaught = $state<string[]>([]);
</script>

<!-- profs rotate every year, so this is context, not a promise — but
		     who they are and when to find them is what a student asks next -->
{#if !isCore(c.code) && profs.length}
	<div class="label">recently taught by</div>
	<div class="d-profs">
		{#each profs as p, pi (p.id)}
			{@const terms = taughtBy(p)}
			<div class="d-prof">
				{#if p.image_url}
					<img
						class="d-photo"
						src={p.image_url}
						alt=""
						loading="lazy"
						referrerpolicy="no-referrer"
					/>
				{:else}
					<span class="d-photo d-initials" aria-hidden="true"
						>{p.name
							.split(' ')
							.map((w) => w[0])
							.slice(0, 2)
							.join('')}</span
					>
				{/if}
				<div class="d-prof-text">
					<b>{p.name}</b>
					{#if p.position}<span class="d-muted"
							>{p.position}{#if joinedYear(p.date_of_joining)}
								· at Krea since {joinedYear(p.date_of_joining)}{/if}</span
						>{/if}
					{#if p.office_hours}<span><span class="d-muted">office hours</span> {p.office_hours}</span
						>{/if}
					<span class="d-prof-links">
						{#if p.email}<a href="mailto:{p.email}">email</a>{/if}
						{#if p.url}<a href={p.url} target="_blank" rel="noopener">profile ↗</a>{/if}
					</span>
					<!-- what they've taught lately, term by term (as kreabot lists it) —
							     each another course to jump to. Folded to a count until asked
							     for: it's the longest part of the card and the least asked about. -->
					{#if terms.length}
						{@const taughtOpen = openTaught.includes(p.id)}
						<div class="d-taught" class:open={taughtOpen}>
							<button
								class="d-taught-head"
								aria-expanded={taughtOpen}
								aria-controls="d-taught-{pi}"
								onclick={() =>
									(openTaught = taughtOpen
										? openTaught.filter((id) => id !== p.id)
										: [...openTaught, p.id])}
							>
								<span class="d-muted">courses taught</span>
								<span class="d-taught-count">{new Set(terms.flatMap((t) => t.codes)).size}</span>
								<span class="chev" aria-hidden="true"></span>
							</button>
							{#if taughtOpen}
								<div
									class="d-taught-list"
									id="d-taught-{pi}"
									transition:slide={{ duration: reducedMotion() ? 0 : 210, easing: cubicOut }}
								>
									{#each terms as t (t.term)}
										<span class="d-term">{termLabel(t.term)}</span>
										<ul>
											{#each t.codes as code (code)}
												<li>
													{#if code === c.code}
														<span class="d-this">{plan.courseLabel(code)}</span>
													{:else}
														<button class="d-taught-course" onclick={() => plan.revealCourse(code)}
															>{plan.courseLabel(code)}</button
														>
													{/if}
												</li>
											{/each}
										</ul>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{:else if !isCore(c.code) && c.faculty}
	<p class="d-faculty">recently taught by {c.faculty}</p>
{/if}

<style lang="scss">
	@use '$lib/styles/mixins' as *;
	// a lecturer: photo, name, role, and how to reach them
	.d-profs {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}

	.d-prof {
		display: flex;
		gap: 1rem;
		padding: 0.9rem 1rem;
		font-size: var(--text-body);
		line-height: 1.45;
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-divider);
		border-radius: 6px;
	}

	.d-photo {
		flex: none;
		width: 4.4rem;
		height: 4.4rem;
		object-fit: cover;
		border-radius: 50%;
		border: 1px solid var(--color-border-card);
		background: var(--color-subtle);
	}

	.d-initials {
		display: grid;
		place-items: center;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.d-prof-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.d-muted {
		color: var(--color-text-muted);
	}

	.d-taught {
		margin-top: 0.8rem;
		padding-top: 0.3rem;
		border-top: 1px dotted var(--color-border-light);
	}

	// the fold's handle: the label, how many courses wait behind it, and the
	// hints panel's chevron at the far end
	.d-taught-head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.4rem 0;
		font: inherit;
		text-align: left;
		background: none;
		border: 0;
		cursor: pointer;

		&:hover .d-muted {
			color: var(--color-text);
		}

		.chev {
			@include fold-chevron;
			margin: 0 0.4rem 0.3rem auto;
		}
	}

	.d-taught-count {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.d-taught-list {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.3rem;
		padding-bottom: 0.2rem;

		ul {
			display: flex;
			flex-direction: column;
			gap: 0.2rem;
			margin: 0;
			padding: 0;
			list-style: none;
		}

		ul + .d-term {
			margin-top: 0.3rem;
		}
	}

	// the term a group of courses ran in — a small label over its list
	.d-term {
		font-size: 1.1rem;
		font-weight: 700;
		letter-spacing: 0.03em;
		color: var(--color-text-muted);
	}

	// the course already open — named, not linked
	.d-this {
		font-weight: 600;
	}

	.d-taught-course {
		padding: 0;
		font: inherit;
		text-align: left;
		color: var(--color-text);
		background: none;
		border: 0;
		cursor: pointer;

		&:hover {
			text-decoration: underline;
			text-underline-offset: 0.2em;
		}
	}

	.d-prof-links {
		display: flex;
		gap: 1.2rem;
		margin-top: 0.2rem;

		a {
			color: var(--color-accent);
			text-underline-offset: 0.2em;

			&:hover {
				color: var(--color-text);
			}
		}
	}
	.d-faculty {
		font-size: 1.2rem;
		font-style: italic;
		color: var(--color-text-muted);
	}

	.label {
		@include section-label;
		margin-top: 0.6rem;
	}
	@include mobile {
		.d-prof {
			font-size: 1.5rem;
		}
		.d-taught-head {
			padding-top: 1rem;
			padding-bottom: 1rem;
		}
		.d-prof-links a {
			display: inline-flex;
			align-items: center;
			min-height: 4.4rem;
		}
	}
</style>
