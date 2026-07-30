<script lang="ts">
	import { Plan } from '$lib/plan.svelte';
	import Sidebar from '$lib/components/sidebar/Sidebar.svelte';
	import HintsPanel from '$lib/components/sidebar/HintsPanel.svelte';
	import Catalogue from '$lib/components/catalogue/Catalogue.svelte';
	import OverviewGrid from '$lib/components/board/OverviewGrid.svelte';
	import TrimesterZoom from '$lib/components/board/TrimesterZoom.svelte';
	import DetailsPanel from '$lib/components/details/DetailsPanel.svelte';
	import Intro from '$lib/components/Intro.svelte';
	import { fly } from 'svelte/transition';
	import { loadDescriptions } from '$lib/descriptions.svelte';

	const plan = new Plan();

	// the catalogue prose is a separate chunk so it can't hold up first paint —
	// pull it in once the planner is up and the browser has a spare moment
	$effect(() => {
		if ('requestIdleCallback' in window) requestIdleCallback(() => loadDescriptions());
		else setTimeout(loadDescriptions, 400);
	});
</script>

<Intro />

<svelte:head>
	<title>tracey — kreabot's schedule planner</title>
</svelte:head>

<!-- phones get a polite "use a laptop" note instead of a cramped grid -->
<div class="mobile-gate">
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<rect x="3" y="5" width="18" height="12" rx="1.5" />
		<path d="M1.5 19.5h21" />
	</svg>
	<p>tracey needs a bigger screen —<br />please open it on a laptop</p>
</div>

<div class="app">
	<aside class="rail">
		<Sidebar {plan} />
		<HintsPanel {plan} />
	</aside>

	<Catalogue {plan} />

	<main class="board">
		<!-- wrapped so the footer below can be pushed to the bottom of the column
		     on a short plan, and stay pinned there while a long one scrolls -->
		<div class="board-main">
			{#if plan.zoom}
				<TrimesterZoom {plan} />
			{:else}
				<OverviewGrid {plan} />
			{/if}
		</div>

		<!-- tracey is still being built and students are already using it, so the
		     board says so plainly at the bottom rather than letting anyone take a
		     rough edge for the finished thing -->
		<p class="wip">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M14.7 6.3a4 4 0 0 0 5 5l-8.4 8.4a2.4 2.4 0 0 1-3.4-3.4z" />
				<path d="M14.7 6.3 17.5 3.5" />
			</svg>
			still under development
		</p>

		<!-- the flash lives out here, not on the grid: a refused drop has to be
		     explained in the zoom view too, and the grid isn't mounted there -->
		{#if plan.flash}
			<div class="flash" transition:fly={{ y: 12, duration: 220 }}>{plan.flash}</div>
		{/if}
	</main>

	<aside class="rightbar">
		<DetailsPanel {plan} />
	</aside>
</div>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	:global(html),
	:global(body) {
		height: 100%;
	}

	// pinned to the foot of the board column: pushed there by .board-main on a
	// short plan, held there by `sticky` while a long one scrolls past
	.wip {
		position: sticky;
		bottom: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		padding: 1rem 3.2rem;
		font-size: 1.3rem;
		color: var(--color-text-muted);
		background: var(--color-bg-board-page);
		border-top: 1px solid var(--color-border-light);

		svg {
			width: 1.5rem;
			height: 1.5rem;
		}
	}

	// transient one-liner: a refused drop, a rule the board just applied
	.flash {
		position: fixed;
		bottom: 2.4rem;
		right: 2.4rem;
		z-index: 40;
		padding: 1rem 1.6rem;
		font-size: 1.4rem;
		background: var(--color-hint-warn);
		border-radius: 4px;
		@include card-shine;
	}

	// on a phone the app hides entirely and the gate below takes over
	.mobile-gate {
		display: none;

		@include mobile {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 1.6rem;
			height: 100vh;
			padding: 2.4rem;
			background: var(--color-bg);
			color: var(--color-text);

			svg {
				width: 7.2rem;
				height: 7.2rem;
				color: var(--color-accent);
			}

			p {
				font-size: 1.6rem;
				line-height: 1.5;
				text-align: center;
				color: var(--color-text-muted);
			}
		}
	}

	// the app is locked to the viewport — each column scrolls on its own,
	// so nothing ever runs past the page
	.app {
		display: grid;
		grid-template-columns: 24rem 30rem 1fr 28rem;
		height: 100vh;
		background: var(--color-bg);

		@include mobile {
			display: none;
		}
	}

	.rail {
		display: flex;
		flex-direction: column;
		min-height: 0;
		border-right: 1px solid var(--color-border-warm);
		overflow-y: auto;

		@include mobile {
			overflow-y: visible;
		}
	}

	.board {
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		min-height: 0;
		// the middle column is its own cool zone — a very pale blue-grey field
		background: var(--color-bg-board-page);

		@include mobile {
			overflow-y: visible;
		}
	}

	// grows to fill a short board so the footer sits at the bottom, never
	// shrinks below its own content so a long one still scrolls
	.board-main {
		flex: 1 0 auto;
	}

	.rightbar {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow-y: auto;
		background: linear-gradient(to bottom, var(--color-bg-sidebar), var(--color-bg-sidebar-end));
		border-left: 1px solid var(--color-border-warm);

		@include mobile {
			overflow-y: visible;
		}
	}
</style>
