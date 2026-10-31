<script lang="ts">
	import { page } from '$app/state';
	import { DATA_UPDATED } from '$lib/data';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const sections = [
		{ href: '/courses', label: 'courses' },
		{ href: '/programmes', label: 'programmes' },
		{ href: '/lecturers', label: 'lecturers' }
	];
	const current = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	const updated = DATA_UPDATED?.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
</script>

<div class="site">
	<header class="masthead">
		<a class="brand" href="/">kcal</a>
		<nav aria-label="site">
			{#each sections as s (s.href)}
				<a href={s.href} aria-current={current(s.href) ? 'page' : undefined}>{s.label}</a>
			{/each}
			<a class="plan" href="/">open the planner →</a>
		</nav>
	</header>

	<main>
		{@render children()}
	</main>

	<footer>
		<p>
			Course data from Krea's term sheets{updated ? ` (${updated})` : ''}; programme rules from the departments' FYUP
			documents. Check anything that matters with your department.
		</p>
	</footer>
</div>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.site {
		display: grid;
		grid-template-rows: auto 1fr auto;
		min-height: 100%;
		background: linear-gradient(to bottom, var(--color-bg-warm-start), var(--color-bg-warm-end) 40rem, var(--color-bg));
	}

	.masthead {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 1.2rem 3.2rem;
		padding: 2rem max(2.4rem, calc((100% - 96rem) / 2));
		border-bottom: 1px dotted var(--color-border-light);
	}

	.brand {
		font-size: 2.4rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--color-accent);
		text-decoration: none;
	}

	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 2rem;
		flex: 1;
		font-size: 1.5rem;

		a {
			color: var(--color-text-muted);
			text-decoration: none;
			padding-bottom: 0.2rem;
			border-bottom: 2px solid transparent;

			&:hover {
				color: var(--color-text);
			}

			&[aria-current='page'] {
				color: var(--color-text);
				border-bottom-color: var(--color-accent);
			}
		}

		.plan {
			margin-left: auto;
			color: var(--color-accent);
			font-weight: 600;
		}
	}

	main {
		width: 100%;
		max-width: 96rem;
		margin: 0 auto;
		padding: 3.2rem 2.4rem 6.4rem;
	}

	footer {
		padding: 2rem 2.4rem 3.2rem;
		border-top: 1px dotted var(--color-border-light);
		font-size: 1.25rem;
		color: var(--color-text-muted);
		text-align: center;
	}

	@include mobile {
		.masthead {
			padding: 1.6rem;
		}

		nav .plan {
			margin-left: 0;
		}

		main {
			padding: 2.4rem 1.6rem 4.8rem;
		}
	}
</style>
