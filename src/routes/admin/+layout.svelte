<script lang="ts">
	// The maintainer's side of tracey: the prerequisite graph the whole planner
	// rests on is generated from messy CSV text, so it needs somewhere to be
	// read, corrected and checked. Two pages, one shared header.
	import '../../app.scss';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const tabs = [
		{ href: '/admin', label: 'prerequisites' },
		{ href: '/admin/tree', label: 'tree' }
	];
</script>

<svelte:head>
	<title>tracey admin</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<header class="admin-bar">
	<a class="brand" href="/">← tracey</a>
	<nav>
		{#each tabs as tab (tab.href)}
			<a href={tab.href} class:active={page.url.pathname === tab.href}>{tab.label}</a>
		{/each}
	</nav>
</header>

<main class="admin-body">
	{@render children()}
</main>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	:global(html),
	:global(body) {
		height: 100%;
	}

	.admin-bar {
		display: flex;
		align-items: center;
		gap: 2.4rem;
		padding: 1rem 2rem;
		background: linear-gradient(to bottom, var(--color-bg-header-start), var(--color-bg-header-end));
		border-bottom: 1px solid var(--color-border-card);

		.brand {
			font-size: 1.4rem;
			font-weight: 600;
			color: var(--color-text);
			text-decoration: none;
		}

		nav {
			display: flex;
			gap: 0.6rem;
		}

		nav a {
			padding: 0.5rem 1.2rem;
			font-size: 1.3rem;
			color: var(--color-text-muted);
			text-decoration: none;
			border: 1px solid transparent;
			border-radius: 999px;

			&:hover {
				color: var(--color-text);
			}

			&.active {
				color: var(--color-text);
				background: var(--color-bg-light);
				border-color: var(--color-border-card);
			}
		}
	}

	.admin-body {
		height: calc(100% - 4.6rem);
		overflow: hidden;
	}
</style>
