<script lang="ts">
	import { page } from '$app/state';
	import CourseList from '$lib/components/site/CourseList.svelte';

	let { data } = $props();
	const initials = $derived(
		data.name
			.split(' ')
			.map((w) => w[0])
			.slice(0, 2)
			.join('')
	);
</script>

<svelte:head>
	<title>{data.name} · kcal</title>
	<meta name="description" content="{data.name}{data.title ? `, ${data.title}` : ''} at Krea: office hours and courses taught." />
	<link rel="canonical" href="{page.url.origin}/lecturers/{data.id}" />
</svelte:head>

<a class="up" href="/lecturers">← all lecturers</a>

<header>
	{#if data.imageUrl}
		<img src={data.imageUrl} alt="" width="96" height="96" loading="lazy" referrerpolicy="no-referrer" />
	{:else}
		<span class="initials" aria-hidden="true">{initials}</span>
	{/if}
	<div>
		<h1>{data.name}</h1>
		{#if data.title}<p class="title">{data.title}</p>{/if}
		<p class="links">
			{#if data.email}<a href="mailto:{data.email}">{data.email}</a>{/if}
			{#if data.profileUrl}<a href={data.profileUrl} rel="noopener">university profile ↗</a>{/if}
		</p>
	</div>
</header>

{#if data.officeHours}
	<section>
		<h2>Office hours</h2>
		<p class="hours">{data.officeHours}</p>
	</section>
{/if}

{#if data.recent.length}
	<section>
		<h2>Recently taught</h2>
		{#each data.recent as t (t.term)}
			<h3>{t.term}</h3>
			<CourseList courses={t.courses} />
		{/each}
	</section>
{/if}

{#if data.courses.length > 0}
	<section>
		<h2>All their courses</h2>
		<CourseList courses={data.courses} />
	</section>
{/if}

<style lang="scss">
	.up {
		font-size: 1.35rem;
		color: var(--color-text-muted);
	}

	header {
		display: flex;
		align-items: center;
		gap: 2rem;
		margin-top: 1.6rem;
		padding-bottom: 2.4rem;
		border-bottom: 1px dotted var(--color-border-light);
	}

	img,
	.initials {
		flex: none;
		width: 9.6rem;
		height: 9.6rem;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid var(--color-border-card);
		background: var(--color-subtle);
	}

	.initials {
		display: grid;
		place-items: center;
		font-size: 3rem;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	h1 {
		font-size: 3.2rem;
		letter-spacing: -0.02em;
	}

	.title {
		margin-top: 0.2rem;
		font-size: 1.6rem;
		color: var(--color-text-muted);
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.6rem;
		margin-top: 0.8rem;
		font-size: 1.4rem;

		a {
			color: var(--color-accent);
		}
	}

	section {
		margin-top: 3.2rem;
	}

	h2 {
		margin-bottom: 1rem;
		font-size: 1.9rem;
	}

	h3 {
		margin: 1.6rem 0 0.4rem;
		font-size: 1.3rem;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
	}

	.hours {
		font-size: 1.55rem;
	}
</style>
