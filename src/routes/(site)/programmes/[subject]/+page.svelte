<script lang="ts">
	import CourseList from '$lib/components/site/CourseList.svelte';

	let { data } = $props();
	const credits = (n: number) => `${n} credit${n === 1 ? '' : 's'}`;
</script>

<svelte:head>
	<title>{data.subject.label} programmes · kcal</title>
	<meta
		name="description"
		content="The {data.subject.label} major, minor and concentration at Krea: credits, required courses and choices."
	/>
</svelte:head>

<header style:--hue={data.subject.hue}>
	<a class="up" href="/programmes">← all programmes</a>
	<h1>{data.subject.label}</h1>
	<p class="lede">The rules for the {data.batches} batches. Jump to a programme:</p>
	<nav aria-label="programmes">
		{#each data.programmes as p (p.key)}<a href="#{p.key}">{p.label}</a>{/each}
	</nav>
</header>

{#each data.programmes as p (p.key)}
	<section id={p.key}>
		<h2>{p.label}</h2>
		<p class="credits">
			<b>{credits(p.credits.total)}</b>
			{#if p.credits.required !== null}· {p.credits.required} required{/if}
			{#if p.credits.elective}· {p.credits.elective} elective{/if}
		</p>

		<h3>Required</h3>
		<CourseList courses={p.required} empty="No fixed course, see the choices below." />

		{#each p.choices as choice, i (i)}
			<h3>{choice.rule} <small>choose {choice.pick}</small></h3>
			<CourseList courses={choice.options} />
		{/each}

		{#if p.electives.length}
			<details>
				<summary>Electives that count <small>{p.electives.length}</small></summary>
				<CourseList courses={p.electives} />
			</details>
		{/if}
	</section>
{/each}

<style lang="scss">
	header {
		padding-bottom: 2.4rem;
		border-bottom: 1px dotted var(--color-border-light);
	}

	.up {
		font-size: 1.35rem;
		color: var(--color-text-muted);
	}

	h1 {
		margin-top: 0.8rem;
		font-size: 3.4rem;
		letter-spacing: -0.02em;
		color: oklch(0.42 0.08 var(--hue, 300));
	}

	.lede {
		margin-top: 0.6rem;
		font-size: 1.55rem;
		color: var(--color-text-muted);
	}

	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin-top: 1.2rem;

		a {
			padding: 0.4rem 1rem;
			font-size: 1.3rem;
			color: var(--color-text);
			text-decoration: none;
			background: var(--color-bg-light);
			border: 1px solid var(--color-border-card);
			border-radius: 999px;

			&:hover {
				background: var(--color-hover);
			}
		}
	}

	section {
		margin-top: 3.2rem;
		padding: 2rem 2.2rem;
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 8px;
		box-shadow: var(--shadow-card);
		scroll-margin-top: 1.6rem;
	}

	h2 {
		font-size: 2.2rem;
	}

	.credits {
		margin-top: 0.4rem;
		font-size: 1.45rem;
		color: var(--color-text-muted);

		b {
			color: var(--color-text);
		}
	}

	h3 {
		margin: 2rem 0 0.6rem;
		font-size: 1.5rem;

		small {
			margin-left: 0.6rem;
			font-size: 1.2rem;
			font-weight: 500;
			color: var(--color-text-muted);
		}
	}

	details {
		margin-top: 2rem;

		summary {
			cursor: pointer;
			font-size: 1.5rem;
			font-weight: 700;

			small {
				font-weight: 500;
				color: var(--color-text-muted);
			}
		}
	}
</style>
