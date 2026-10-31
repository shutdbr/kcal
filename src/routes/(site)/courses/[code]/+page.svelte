<script lang="ts">
	import { page } from '$app/state';
	import CourseList from '$lib/components/site/CourseList.svelte';

	let { data } = $props();

	const trimesters = (ts: number[]) => (ts.length ? ts.map((t) => `T${t}`).join(', ') : 'not scheduled yet');
	const years = (ys: number[]) => (ys.length ? `year ${ys.join(', ')}` : 'any year');
	const list = (xs: string[]) => xs.join(', ');
	const summary = $derived(
		[`${data.credits}-credit course`, data.offered.length ? `runs in ${trimesters(data.offered)}` : '', data.subject]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<svelte:head>
	<title>{data.code} {data.title} · kcal</title>
	<meta name="description" content="{data.code} {data.title}: {summary}." />
	<link rel="canonical" href="{page.url.origin}/courses/{data.code}" />
</svelte:head>

<article>
	<header>
		<p class="codes">
			{#each data.listings as l (l.code)}<a href={l.href} title={l.subject}>{l.code}</a>{/each}
		</p>
		<h1>{data.title}</h1>
		<p class="lede">{summary}</p>
		<a class="plan" href="/?course={data.code}">plan this course →</a>
	</header>

	<dl class="facts">
		<div><dt>credits</dt><dd>{data.creditsPending ? 'to be confirmed' : data.credits}</dd></div>
		<div><dt>runs in</dt><dd>{trimesters(data.offered)}</dd></div>
		<div><dt>open to</dt><dd>{years(data.eligibleYears)}</dd></div>
		{#if data.terms.length}<div><dt>last offered</dt><dd>{data.terms[0]}</dd></div>{/if}
	</dl>

	{#if data.description}
		<section>
			<h2>About</h2>
			<p class="prose">{data.description}</p>
		</section>
	{/if}

	<section>
		<h2>Before this</h2>
		<CourseList courses={data.prerequisites} empty="No prerequisites." />
		{#if data.equivalents.length}
			<p class="note">Interchangeable with — take one of these, not both:</p>
			<CourseList courses={data.equivalents} />
		{/if}
	</section>

	{#if data.unlocks.length}
		<section>
			<h2>Leads on to</h2>
			<CourseList courses={data.unlocks} />
		</section>
	{/if}

	{#if data.programmes.length}
		<section>
			<h2>In these programmes</h2>
			<p class="note">For the {data.batches} batches.</p>
			<ul class="programmes">
				{#each data.programmes as p (p.slug)}
					<li>
						<a href="/programmes/{p.slug}">{p.subject}</a>
						{#if p.required.length}<span><b>required</b> — {list(p.required)}</span>{/if}
						{#if p.choice.length}<span><b>one of a choice</b> — {list(p.choice)}</span>{/if}
						{#if p.elective.length}<span><b>elective</b> — {list(p.elective)}</span>{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.lecturers.length}
		<section>
			<h2>Recently taught by</h2>
			<ul class="people">
				{#each data.lecturers as l (l.id)}
					<li><a href="/lecturers/{l.id}">{l.name}</a>{#if l.title}<span>{l.title}</span>{/if}</li>
				{/each}
			</ul>
			{#if data.terms.length > 1}<p class="note">Offered in {data.terms.join(', ')}.</p>{/if}
		</section>
	{/if}
</article>

<style lang="scss">
	header {
		padding-bottom: 2.4rem;
		border-bottom: 1px dotted var(--color-border-light);
	}

	.codes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;

		a {
			padding: 0.2rem 0.8rem;
			font-size: 1.3rem;
			font-weight: 700;
			letter-spacing: 0.02em;
			color: var(--color-text);
			text-decoration: none;
			background: var(--color-course-required);
			border: 1px solid var(--color-course-required-deep);
			border-radius: 4px;
		}
	}

	h1 {
		margin-top: 1rem;
		font-size: 3.4rem;
		line-height: 1.15;
		letter-spacing: -0.02em;
	}

	.lede {
		margin-top: 0.8rem;
		font-size: 1.6rem;
		color: var(--color-text-muted);
	}

	.plan {
		display: inline-block;
		margin-top: 1.6rem;
		padding: 0.8rem 1.6rem;
		font-size: 1.4rem;
		font-weight: 600;
		color: var(--color-on-accent);
		text-decoration: none;
		background-color: var(--color-accent);
		border: 1px solid var(--color-control-deep);
		border-radius: 6px;
		background-image: var(--gloss-face-accent);
	}

	.facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 1.2rem;
		margin: 2.4rem 0;

		div {
			padding: 1.2rem 1.4rem;
			background: var(--color-bg-light);
			border: 1px solid var(--color-border-card);
			border-radius: 6px;
		}

		dt {
			font-size: 1.15rem;
			font-weight: 700;
			letter-spacing: 0.06em;
			text-transform: uppercase;
			color: var(--color-text-muted);
		}

		dd {
			margin-top: 0.4rem;
			font-size: 1.6rem;
		}
	}

	section {
		margin-top: 3.2rem;
	}

	h2 {
		margin-bottom: 1rem;
		font-size: 1.9rem;
	}

	.prose {
		max-width: 68ch;
		font-size: 1.55rem;
		line-height: 1.65;
		white-space: pre-line;
	}

	.note {
		margin: 1.2rem 0 0.6rem;
		font-size: 1.35rem;
		color: var(--color-text-muted);
	}

	.programmes,
	.people {
		list-style: none;
		display: grid;
		gap: 0.8rem;
		font-size: 1.45rem;

		li {
			display: flex;
			flex-wrap: wrap;
			gap: 0.2rem 1.2rem;
			align-items: baseline;
		}

		a {
			font-weight: 600;
			color: var(--color-text);
			min-width: 18rem;
		}

		span {
			color: var(--color-text-muted);
		}
	}

	.programmes b {
		font-weight: 600;
		color: var(--color-text);
	}
</style>
