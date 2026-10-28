<script lang="ts">
	// The maintainer's side of kcal: the catalogue and the prerequisite graph
	// the whole planner rests on are generated from messy CSV text, and the
	// drop-form rules change from year to year — so they need somewhere to be
	// read, corrected and checked. Three pages, one shared header.
	import '../../app.scss';
	import './admin.scss';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const tabs = [
		{ href: '/admin', label: 'courses' },
		{ href: '/admin/crosslist', label: 'cross-listing' },
		{ href: '/admin/rules', label: 'rules' },
		{ href: '/admin/batches', label: 'batches' },
		{ href: '/admin/tree', label: 'tree' }
	];
</script>

<svelte:head>
	<title>kcal admin</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<header class="admin-bar">
	<div class="brand">
		<span class="logo">kcal</span>
		<span class="badge">admin</span>
	</div>
	<nav>
		{#each tabs as tab (tab.href)}
			<a href={tab.href} class:active={page.url.pathname === tab.href}>
				{tab.label}
			</a>
		{/each}
	</nav>
	<!-- a full reload, not a client-side hop: edits are read when the catalogue
	     module loads, so only a fresh load of the planner shows them -->
	<a class="to-planner" href="/" data-sveltekit-reload>open planner ↗</a>
</header>

<main class="admin-body adm">
	{@render children()}
</main>

<style lang="scss">
	:global(html),
	:global(body) {
		height: 100%;
	}

	.admin-bar {
		display: flex;
		align-items: center;
		gap: 2.4rem;
		height: 4.8rem;
		padding: 0 2rem;
		background: var(--color-bg-light);
		border-bottom: 1px solid var(--color-border-card);
	}

	.brand {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;

		.logo {
			font-size: 1.6rem;
			font-weight: 700;
			color: var(--color-text);
		}

		.badge {
			font-size: 1.2rem;
			color: var(--color-text-muted);
		}
	}

	nav {
		display: flex;
		align-self: stretch;
		gap: 0.4rem;
	}

	// tabs: an underline, nothing more
	nav a {
		display: flex;
		align-items: center;
		padding: 0 1rem;
		font-size: 1.3rem;
		color: var(--color-text-muted);
		text-decoration: none;
		border-bottom: 2px solid transparent;

		&:hover {
			color: var(--color-text);
		}

		&.active {
			color: var(--color-text);
			font-weight: 600;
			border-bottom-color: var(--color-accent);
		}
	}

	.to-planner {
		margin-left: auto;
		font-size: 1.3rem;
		font-weight: 600;
		color: var(--color-accent);
		text-decoration: none;

		&:hover {
			text-decoration: underline;
		}
	}

	.admin-body {
		height: calc(100% - 4.8rem);
		overflow: hidden;
	}
</style>
