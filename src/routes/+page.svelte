<script lang="ts">
	import { Plan } from '$lib/plan.svelte';
	import Sidebar from '$lib/components/sidebar/Sidebar.svelte';
	import HintsPanel from '$lib/components/sidebar/HintsPanel.svelte';
	import Catalogue from '$lib/components/catalogue/Catalogue.svelte';
	import OverviewGrid from '$lib/components/board/OverviewGrid.svelte';
	import TrimesterZoom from '$lib/components/board/TrimesterZoom.svelte';
	import DetailsPanel from '$lib/components/details/DetailsPanel.svelte';
	import Intro from '$lib/components/Intro.svelte';

	const plan = new Plan();
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
		{#if plan.zoom}
			<TrimesterZoom {plan} />
		{:else}
			<OverviewGrid {plan} />
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
		overflow-y: auto;
		min-height: 0;
		// the middle column is its own cool zone — a very pale blue-grey field
		background: var(--color-bg-board-page);

		@include mobile {
			overflow-y: visible;
		}
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
