<script lang="ts">
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
	let canvasTransfer = $state<CanvasImport | null>(null);
	let canvasError = $state('');

	onMount(() => {
		const reviewCode = new URL(location.href).searchParams.get('review');
		if (reviewCode && hasCode(reviewCode)) plan.revealCourse(reviewCode);
		const importing = location.hash.startsWith('#canvas-import=');
		if (importing) {
			const fragment = location.hash.slice('#canvas-import='.length);
			history.replaceState(history.state, '', location.pathname + location.search);
			try { canvasTransfer = parseCanvasImport(decodeURIComponent(fragment)); }
			catch (e) { canvasError = e instanceof Error ? e.message : 'Could not read the Canvas import.'; }
		}
		// Match the mobile gate: a phone visit must not consume the first tour.
		const media = window.matchMedia('(min-width: 769px)');
		const update = () => (desktop = media.matches);
		update();
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

	// on a phone: hand the link on to a laptop (the share sheet where there
	// is one, the clipboard otherwise)
	let linkCopied = $state(false);
	async function passLink() {
		const url = location.origin;
		try {
			if (navigator.share) await navigator.share({ title: 'kcal', url });
			else {
				await navigator.clipboard.writeText(url);
				linkCopied = true;
			}
		} catch {
			// share sheet dismissed, or clipboard blocked — the address bar has it
		}
	}

	// the catalogue prose is a separate chunk so it can't hold up first paint —
	// pull it in once the planner is up and the browser has a spare moment
	$effect(() => {
		if ('requestIdleCallback' in window) requestIdleCallback(() => loadDescriptions());
		else setTimeout(loadDescriptions, 400);
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

{#if tourRequested && desktop}
	<Intro onclose={dismissTour} />
{/if}

<svelte:head>
	<title>kcal</title>
</svelte:head>

<!-- phones get a polite "use a laptop" note instead of a cramped grid -->
<div class="mobile-gate">
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<rect x="3" y="5" width="18" height="12" rx="1.5" />
		<path d="M1.5 19.5h21" />
	</svg>
	<p>kcal needs a bigger screen —<br />please open it on a laptop</p>
	<button class="pass-link" onclick={passLink}>{linkCopied ? 'link copied ✓' : 'send the link to my laptop'}</button>
</div>

<div class="app" use:dragMotion>
	<aside class="rail">
		<Sidebar {plan} ontour={() => (tourRequested = true)} />
		<CanvasImportPanel {plan} initial={canvasTransfer} initialError={canvasError} />
		<HintsPanel {plan} />
	</aside>

	<Catalogue {plan} />

	<main class="board">
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
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M14.7 6.3a4 4 0 0 0 5 5l-8.4 8.4a2.4 2.4 0 0 1-3.4-3.4z" />
				<path d="M14.7 6.3 17.5 3.5" />
			</svg>
			beta ·{#if dataMonth}&nbsp;course data from {dataMonth} ·{/if}
			<button class="wip-feedback" onclick={() => (plan.feedbackDraft = '')}>something wrong? tell me</button>
		</p>

		<!-- the flash lives out here, not on the grid: a refused drop has to be
		     explained in the zoom view too, and the grid isn't mounted there -->
		{#if plan.flash}
			<div class="flash" transition:fly={{ y: 12, duration: 220 }}>{plan.flash}</div>
		{/if}
	</main>

	<!-- a fixed column, so picking a course never shoves a panel over the board -->
	<aside class="rightbar" data-tour="details">
		<DetailsPanel {plan} />
	</aside>
</div>

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

	.pass-link {
		padding: 1rem 2rem;
		font: inherit;
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--color-on-accent);
		background-color: var(--color-accent);
		border: 1px solid var(--color-control-deep);
		border-radius: 8px;
		@include glossy-accent;
	}

	// the app is locked to the viewport — each column scrolls on its own,
	// so nothing ever runs past the page
	.app {
		display: grid;
		grid-template-columns: 24rem 30rem minmax(0, 1fr) 32rem;
		height: 100vh;
		background: var(--color-bg);

		@include mobile {
			display: none;
		}
	}

	.rail {
		--rail-radius: 4px;
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
