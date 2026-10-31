<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>Programmes · kcal</title>
	<meta name="description" content="Majors, minors and concentrations at Krea's SIAS: credits, required courses and choices for each." />
</svelte:head>

<h1>Programmes</h1>
<p class="lede">
	What each major, minor and concentration asks for: credits, required courses and the choices you make. These are
	the rules for the {data.batches} batches.
</p>

<ul class="subjects">
	{#each data.subjects as s (s.slug)}
		<li style:--hue={s.hue}>
			<a href="/programmes/{s.slug}">
				<span class="name">{s.label}</span>
				<span class="offers">{s.offers.join(' · ')}</span>
				<span class="count">{s.courses} courses</span>
			</a>
		</li>
	{/each}
</ul>

<style lang="scss">
	h1 {
		font-size: 3.2rem;
		letter-spacing: -0.02em;
	}

	.lede {
		max-width: 62ch;
		margin-top: 0.6rem;
		font-size: 1.6rem;
		line-height: 1.5;
		color: var(--color-text-muted);
	}

	.subjects {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(26rem, 1fr));
		gap: 1.2rem;
		margin-top: 3.2rem;
	}

	a {
		display: grid;
		gap: 0.4rem;
		height: 100%;
		padding: 1.6rem 1.8rem;
		color: var(--color-text);
		text-decoration: none;
		background: oklch(0.96 0.02 var(--hue, 300));
		border: 1px solid oklch(0.84 0.05 var(--hue, 300));
		border-left-width: 4px;
		border-radius: 6px;
		box-shadow: var(--shadow-card);
		transition: transform 0.15s var(--spring), box-shadow 0.15s ease;

		&:hover {
			transform: translateY(-2px);
			box-shadow: var(--shadow-card-hover);
		}
	}

	.name {
		font-size: 1.8rem;
		font-weight: 700;
	}

	.offers,
	.count {
		font-size: 1.3rem;
		color: var(--color-text-muted);
	}
</style>
