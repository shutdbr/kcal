<script lang="ts">
	import CourseList from '$lib/components/site/CourseList.svelte';

	let { data } = $props();
	const total = $derived(new Set(data.subjects.flatMap((s) => s.courses.map((c) => c.code))).size);
</script>

<svelte:head>
	<title>Courses · kcal</title>
	<meta name="description" content="Every undergraduate course at Krea's SIAS, by subject: credits, when it runs and who teaches it." />
</svelte:head>

<h1>Courses</h1>
<p class="lede">{total} undergraduate courses, listed under every subject that offers them.</p>

<nav class="jump" aria-label="subjects">
	{#each data.subjects as s (s.slug)}
		<a href="#{s.slug}" style:--hue={s.hue}>{s.label}</a>
	{/each}
</nav>

{#each data.subjects as s (s.slug)}
	<section id={s.slug} style:--hue={s.hue}>
		<h2>{s.label} <small>{s.courses.length}</small></h2>
		<CourseList courses={s.courses} />
	</section>
{/each}

<style lang="scss">
	h1 {
		font-size: 3.2rem;
		letter-spacing: -0.02em;
	}

	.lede {
		margin-top: 0.6rem;
		font-size: 1.6rem;
		color: var(--color-text-muted);
	}

	.jump {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin: 2.4rem 0 1.2rem;

		a {
			padding: 0.4rem 1rem;
			font-size: 1.3rem;
			color: var(--color-text);
			text-decoration: none;
			border-radius: 999px;
			background: oklch(0.93 0.03 var(--hue, 300));
			border: 1px solid oklch(0.82 0.05 var(--hue, 300));

			&:hover {
				background: oklch(0.89 0.05 var(--hue, 300));
			}
		}
	}

	section {
		padding-top: 2.4rem;
		margin-top: 2.4rem;
		border-top: 1px dotted var(--color-border-light);
		scroll-margin-top: 1.6rem;
	}

	h2 {
		margin-bottom: 1rem;
		font-size: 2rem;
		color: oklch(0.45 0.08 var(--hue, 300));

		small {
			font-size: 1.3rem;
			font-weight: 500;
			color: var(--color-text-muted);
		}
	}
</style>
