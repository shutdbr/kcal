<script lang="ts">
	let { data } = $props();
	const teaching = $derived(data.lecturers.filter((l) => l.courses > 0));
	const directory = $derived(data.lecturers.filter((l) => l.courses === 0));
</script>

<svelte:head>
	<title>Lecturers · kcal</title>
	<meta name="description" content="Who teaches at Krea's SIAS: positions, office hours and the courses each lecturer has taught." />
</svelte:head>

<h1>Lecturers</h1>
<p class="lede">{teaching.length} people who have taught undergraduate courses recently, and the rest of the directory.</p>

<ul class="people">
	{#each teaching as l (l.id)}
		<li>
			<a href="/lecturers/{l.id}">{l.name}</a>
			<span>{l.title || 'lecturer'} · {l.courses} course{l.courses === 1 ? '' : 's'}</span>
		</li>
	{/each}
</ul>

{#if directory.length}
	<h2>Also in the directory</h2>
	<ul class="people">
		{#each directory as l (l.id)}
			<li><a href="/lecturers/{l.id}">{l.name}</a>{#if l.title}<span>{l.title}</span>{/if}</li>
		{/each}
	</ul>
{/if}

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

	h2 {
		margin-top: 4rem;
		padding-top: 2.4rem;
		border-top: 1px dotted var(--color-border-light);
		font-size: 2rem;
	}

	.people {
		list-style: none;
		columns: 2 30rem;
		column-gap: 3.2rem;
		margin-top: 2rem;

		li {
			break-inside: avoid;
			display: grid;
			padding: 0.6rem 0;
		}

		a {
			font-size: 1.55rem;
			font-weight: 600;
			color: var(--color-text);
		}

		span {
			font-size: 1.25rem;
			color: var(--color-text-muted);
		}
	}
</style>
