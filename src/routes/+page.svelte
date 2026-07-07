<script lang="ts">
	import { Plan } from '$lib/plan.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import HintsPanel from '$lib/components/HintsPanel.svelte';
	import Catalogue from '$lib/components/Catalogue.svelte';
	import OverviewGrid from '$lib/components/OverviewGrid.svelte';
	import TrimesterZoom from '$lib/components/TrimesterZoom.svelte';
	import DetailsPanel from '$lib/components/DetailsPanel.svelte';

	const plan = new Plan();
</script>

<svelte:head>
	<title>tracey — kreabot's schedule planner</title>
</svelte:head>

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

	// the app is locked to the viewport — each column scrolls on its own,
	// so nothing ever runs past the page
	.app {
		display: grid;
		grid-template-columns: 24rem 30rem 1fr 28rem;
		height: 100vh;
		background: var(--color-bg);

		@include mobile {
			grid-template-columns: 1fr;
			height: auto;
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
