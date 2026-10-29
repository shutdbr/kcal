<script lang="ts">
	import PanelResizers from '$lib/components/layout/PanelResizers.svelte';
	import MobileNavigation from '$lib/components/layout/MobileNavigation.svelte';
	import { focusScope } from '$lib/focusScope';
	import { dragMotion } from '$lib/dragMotion';
	import { Plan } from '$lib/plan.svelte';
	import CanvasImportPanel from '$lib/components/CanvasImport.svelte';
	import { parseCanvasImport, type CanvasImport } from '$lib/canvasImport';
	import Sidebar from '$lib/components/sidebar/Sidebar.svelte';
	import HintsPanel from '$lib/components/sidebar/HintsPanel.svelte';
	import Catalogue from '$lib/components/catalogue/Catalogue.svelte';
	import OverviewGrid from '$lib/components/board/OverviewGrid.svelte';
	import TrimesterZoom from '$lib/components/board/TrimesterZoom.svelte';
	import DetailsPanel from '$lib/components/details/DetailsPanel.svelte';
	import Intro from '$lib/components/Intro.svelte';
	import Welcome from '$lib/components/Welcome.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import FeedbackForm from '$lib/components/FeedbackForm.svelte';
	import { DATA_UPDATED, hasCode } from '$lib/data';
	import { fly } from 'svelte/transition';
	import { loadDescriptions } from '$lib/descriptions.svelte';
	import { onMount } from 'svelte';

	const plan = new Plan();
	const INTRO_KEY = 'kcal-intro-seen';
	let tourRequested = $state(false);
	// a first visit opens on the welcome card (your degree), then the tour
	let welcomeOpen = $state(false);
	let desktop = $state(false);
	let ready = $state(false);
	let mobileView = $state<'catalogue' | 'board' | 'rail'>('catalogue');
	let detailsEl: HTMLElement;
	$effect(() => {
		if (!desktop && plan.selected?.code) detailsEl?.scrollTo({ top: 0 });
	});
	let canvasTransfer = $state<CanvasImport | null>(null);
	let canvasError = $state('');

	onMount(() => {
		const reviewCode = new URL(location.href).searchParams.get('review');
		if (reviewCode && hasCode(reviewCode)) plan.revealCourse(reviewCode);
		const importing = location.hash.startsWith('#canvas-import=');
		if (importing) {
			const fragment = location.hash.slice('#canvas-import='.length);
			history.replaceState(history.state, '', location.pathname + location.search);
			try {
				canvasTransfer = parseCanvasImport(decodeURIComponent(fragment));
			} catch (e) {
				canvasError = e instanceof Error ? e.message : 'Could not read the Canvas import.';
			}
		}
		// Keep the desktop walkthrough available after a phone visit.
		const media = window.matchMedia('(min-width: 1101px)');
		const update = () => (desktop = media.matches);
		update();
		ready = true;
		media.addEventListener('change', update);
		try {
			welcomeOpen = !importing && !reviewCode && !localStorage.getItem(INTRO_KEY);
		} catch {
			welcomeOpen = !importing && !reviewCode;
		}
		return () => media.removeEventListener('change', update);
	});

	function dismissTour() {
		tourRequested = false;
		try {
			localStorage.setItem(INTRO_KEY, '1');
		} catch {
			// Dismissal still works when browser storage is unavailable.
		}
	}

	// how current the course data is, said plainly in the footer
	const dataMonth = DATA_UPDATED?.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

	let panelWidths = $state<Partial<Record<'rail' | 'catalogue' | 'details', number>>>({});
	let resizing = $state<'rail' | 'catalogue' | 'details' | null>(null);

	// the catalogue prose is a separate chunk so it can't hold up first paint —
	// pull it in once the planner is up and the browser has a spare moment
	onMount(() => {
		if ('requestIdleCallback' in window) {
			const id = requestIdleCallback(() => loadDescriptions());
			return () => cancelIdleCallback(id);
		}
		const id = setTimeout(loadDescriptions, 400);
		return () => clearTimeout(id);
	});
</script>

{#if welcomeOpen && desktop}
	<Welcome
		{plan}
		ondone={() => {
			welcomeOpen = false;
			tourRequested = true;
		}}
	/>
{/if}

{#if tourRequested}
	{#if desktop}
		<Intro onclose={dismissTour} />
	{:else}
		<Modal title="a quick tour" onclose={dismissTour}>
			<div class="mobile-help">
				<p>
					<b>Catalogue</b> — search courses or lecturers, filter by department, and tap any course for
					its description, prerequisites and reviews.
				</p>
				<p>
					<b>Your plan</b> — tap a course to add, move, remove or grade it. Tap a trimester for a closer
					look.
				</p>
				<p>
					<b>Your degree</b> — choose your programme, check progress and hints, import from Canvas, and
					open settings to save copies or change the theme.
				</p>
				<p>Your plan saves automatically in this browser.</p>
			</div>
		</Modal>
	{/if}
{/if}

<svelte:head>
	<title>kcal</title>
</svelte:head>

<div
	class="app"
	data-ready={ready}
	inert={!ready}
	class:resizing
	data-mobile-view={mobileView}
	class:details-open={!!plan.selected}
	use:dragMotion
	style:--rail-w={panelWidths.rail && `${panelWidths.rail}rem`}
	style:--catalogue-w={panelWidths.catalogue && `${panelWidths.catalogue}rem`}
	style:--details-w={panelWidths.details && `${panelWidths.details}rem`}
>
	<MobileNavigation bind:view={mobileView} credits={plan.totalPlacedCredits} />
	<PanelResizers bind:panelWidths bind:resizing />

	<aside class="rail" inert={!desktop && (mobileView !== 'rail' || !!plan.selected)}>
		<Sidebar {plan} ontour={() => (tourRequested = true)} />
		<CanvasImportPanel {plan} initial={canvasTransfer} initialError={canvasError} />
		<HintsPanel {plan} />
	</aside>

	<div class="catalogue-panel" inert={!desktop && (mobileView !== 'catalogue' || !!plan.selected)}>
		<Catalogue {plan} mobile={!desktop} />
	</div>

	<main class="board" inert={!desktop && (mobileView !== 'board' || !!plan.selected)}>
		<!-- wrapped so the footer below can be pushed to the bottom of the column
		     on a short plan, and stay pinned there while a long one scrolls -->
		<div class="board-main" data-tour="board">
			{#if plan.zoom}
				<TrimesterZoom {plan} />
			{:else}
				<OverviewGrid {plan} />
			{/if}
		</div>

		<!-- kcal is still being built and students are already using it, so the
		     board says so plainly at the bottom — with how current the course
		     data is, and the way to say when something's off -->
		<p class="wip">
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.7"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M14.7 6.3a4 4 0 0 0 5 5l-8.4 8.4a2.4 2.4 0 0 1-3.4-3.4z" />
				<path d="M14.7 6.3 17.5 3.5" />
			</svg>
			beta ·{#if dataMonth}&nbsp;course data from {dataMonth} ·{/if}
			<button class="wip-feedback" onclick={() => (plan.feedbackDraft = '')}
				>something wrong? tell me</button
			>
		</p>
	</main>

	<!-- a fixed column, so picking a course never shoves a panel over the board -->
	<aside
		class="rightbar"
		data-tour="details"
		bind:this={detailsEl}
		use:focusScope={!desktop && !!plan.selected}
		inert={!desktop && !plan.selected}
		aria-label="course details"
	>
		<DetailsPanel {plan} />
	</aside>
</div>

{#if plan.flash}
	<div class="flash" role="status" transition:fly={{ y: 12, duration: 220 }}>{plan.flash}</div>
{/if}

{#if plan.feedbackDraft !== null}
	<Modal title="feedback" onclose={() => (plan.feedbackDraft = null)}>
		<FeedbackForm {plan} prefill={plan.feedbackDraft} onsent={() => (plan.feedbackDraft = null)} />
	</Modal>
{/if}

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

	.wip-feedback {
		padding: 0;
		font: inherit;
		color: var(--color-accent);
		background: none;
		border: 0;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 0.2em;

		&:hover {
			color: var(--color-text);
		}
	}

	// transient one-liner: a refused drop, a rule the board just applied —
	// a plain white card, nothing more
	.flash {
		position: fixed;
		bottom: 2.4rem;
		right: 2.4rem;
		z-index: 40;
		padding: 1rem 1.6rem;
		font-size: 1.35rem;
		color: var(--color-text);
		background: var(--color-bg-card-start);
		border: 1px solid var(--color-border-card);
		border-radius: 8px;
	}

	// the app is locked to the viewport — each column scrolls on its own,
	// so nothing ever runs past the page
	.app {
		--rail-w: 24rem;
		--catalogue-w: 30rem;
		--details-w: 32rem;
		position: relative;
		display: grid;
		grid-template-columns: var(--rail-w) var(--catalogue-w) minmax(0, 1fr) var(--details-w);
		height: 100dvh;
		background: var(--color-bg);

		// mid-drag, the cursor holds wherever it wanders and no text gets
		// selected on the way
		&.resizing {
			cursor: col-resize;
			user-select: none;
		}
	}

	.catalogue-panel {
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	.rail {
		--rail-radius: 4px;
		display: flex;
		flex-direction: column;
		min-height: 0;
		border-right: 1px solid var(--color-border-warm);
		overflow-y: auto;
	}

	.board {
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		min-height: 0;
		// the middle column is its own cool zone — a very pale blue-grey field
		background: var(--color-bg-board-page);
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
	}
	.mobile-help {
		display: grid;
		gap: 1.6rem;
		font-size: 1.6rem;
		line-height: 1.6;
	}

	@include mobile {
		.app {
			display: grid;
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto minmax(0, 1fr) auto;
			overflow: hidden;
		}
		.rail,
		.board,
		.catalogue-panel {
			grid-area: 2 / 1;
			min-width: 0;
			border: 0;
		}
		.app:not([data-mobile-view='rail']) .rail,
		.app:not([data-mobile-view='board']) .board,
		.app:not([data-mobile-view='catalogue']) .catalogue-panel {
			display: none;
		}
		.rightbar {
			display: none;
			position: fixed;
			inset: 0;
			z-index: 30;
			padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
				env(safe-area-inset-left);
			overscroll-behavior: contain;
			border: 0;
		}
		.details-open .rightbar {
			display: flex;
		}
		.wip {
			position: static;
			flex-wrap: wrap;
			padding: 1.6rem;
			line-height: 1.6;
		}
		.flash {
			left: 1.6rem;
			right: 1.6rem;
			bottom: calc(8rem + env(safe-area-inset-bottom));
			font-size: 1.5rem;
		}
	}
</style>
