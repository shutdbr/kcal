<script lang="ts">
	import PanelResizers from '$lib/components/layout/PanelResizers.svelte';
	import MobileNavigation from '$lib/components/layout/MobileNavigation.svelte';
	import { COMPACT_LAYOUT_QUERY, DETAILS_OVERLAY_QUERY, RAIL_OVERLAY_QUERY } from '$lib/layout';
	import { focusScope } from '$lib/focusScope';
	import { dragMotion } from '$lib/dragMotion';
	import { touchDrag } from '$lib/touchDrag';
	import PixelIcon from '$lib/components/PixelIcon.svelte';
	import { Plan } from '$lib/plan.svelte';
	import CanvasImportPanel from '$lib/components/CanvasImport.svelte';
	import { parseCourseImport, type CourseImport } from '$lib/canvasImport';
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
	import { fade, fly } from 'svelte/transition';
	import { loadDescriptions } from '$lib/descriptions.svelte';
	import { onMount, tick } from 'svelte';
	import { readSharedPlan, sharedPlanIn } from '$lib/features/plans/share';
	import { savedPlans } from '$lib/features/plans/local-plans.svelte';

	const plan = new Plan();
	const INTRO_KEY = 'kcal-intro-seen';
	const PHONE_NOTE_KEY = 'kcal-phone-note-seen';
	let tourRequested = $state(false);
	// a phone's first visit says, once, that kcal is roomier on a laptop
	let phoneNote = $state(false);
	// a first visit opens on the welcome card (your degree), then the tour
	let welcomeOpen = $state(false);
	let desktop = $state(false);
	// on a tablet the desktop columns stay, but these slide in over the board
	let detailsSlide = $state(false);
	let railSlide = $state(false);
	// a panel slid in over the others holds the focus until it's closed
	let overlayDetails = $derived((!desktop || detailsSlide) && !!plan.selected);
	let overlayRail = $derived(desktop && railSlide && plan.railOpen);
	let ready = $state(false);
	let mobileView = $state<'catalogue' | 'board' | 'rail'>('catalogue');
	let detailsEl: HTMLElement;
	$effect(() => {
		if ((!desktop || detailsSlide) && plan.selected?.code) detailsEl?.scrollTo({ top: 0 });
	});
	// opening a course's details puts the sidebar away
	$effect(() => {
		if (plan.selected) plan.railOpen = false;
	});
	// the Canvas import opens from settings, or by itself when the extension
	// hands a course list over in the URL fragment
	let canvasOpen = $state(false);
	let canvasTransfer = $state<CourseImport | null>(null);
	let canvasError = $state('');

	onMount(() => {
		// arriving from a course page (/courses/X → "plan this course")
		const url = new URL(location.href);
		const linkedCourse = url.searchParams.get('course');
		if (linkedCourse) {
			url.searchParams.delete('course');
			history.replaceState(history.state, '', url);
			if (hasCode(linkedCourse)) plan.revealCourse(linkedCourse);
		}
		// a plan someone shared (#plan=…): read it, tidy the address bar, and
		// ask before anything changes — it is a copy, never a silent overwrite
		const sharedEncoded = sharedPlanIn(location.hash);
		if (sharedEncoded) {
			history.replaceState(history.state, '', location.pathname + location.search);
			readSharedPlan(sharedEncoded)
				.then((document) => (sharedPlan = document as Record<string, unknown>))
				.catch((e) => (sharedError = e instanceof Error ? e.message : 'This share link could not be read.'));
		}
		const importing = !!sharedEncoded || location.hash.startsWith('#canvas-import=');
		if (location.hash.startsWith('#canvas-import=')) {
			const fragment = location.hash.slice('#canvas-import='.length);
			history.replaceState(history.state, '', location.pathname + location.search);
			try {
				canvasTransfer = parseCourseImport(decodeURIComponent(fragment));
			} catch (e) {
				canvasError = e instanceof Error ? e.message : 'Could not read the Canvas import.';
			}
		}
		// Keep the desktop walkthrough available after a phone visit.
		const media = window.matchMedia(COMPACT_LAYOUT_QUERY);
		const detailsMedia = window.matchMedia(DETAILS_OVERLAY_QUERY);
		const railMedia = window.matchMedia(RAIL_OVERLAY_QUERY);
		const update = () => {
			desktop = !media.matches;
			detailsSlide = desktop && detailsMedia.matches;
			railSlide = desktop && railMedia.matches;
			if (!railSlide) plan.railOpen = false;
		};
		update();
		ready = true;
		void tick().then(() => plan.startHistory());
		for (const m of [media, detailsMedia, railMedia]) m.addEventListener('change', update);
		try {
			welcomeOpen = !importing && !linkedCourse && !localStorage.getItem(INTRO_KEY);
			phoneNote = welcomeOpen && !localStorage.getItem(PHONE_NOTE_KEY);
		} catch {
			welcomeOpen = phoneNote = !importing && !linkedCourse;
		}
		return () => {
			for (const m of [media, detailsMedia, railMedia]) m.removeEventListener('change', update);
		};
	});

	// its own key, so a laptop later in the same browser still gets the welcome
	function dismissPhoneNote() {
		phoneNote = false;
		try {
			localStorage.setItem(PHONE_NOTE_KEY, '1');
		} catch {
			// Dismissal still works when browser storage is unavailable.
		}
	}

	// ⌘Z / Ctrl+Z undo, ⇧⌘Z / Ctrl+Y redo — not while typing in a field,
	// where the browser's own undo belongs
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && plan.railOpen) plan.railOpen = false;
		if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
		if ((e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable]')) return;
		const key = e.key.toLowerCase();
		if (key === 'z' && !e.shiftKey) {
			e.preventDefault();
			plan.undo();
		} else if ((key === 'z' && e.shiftKey) || key === 'y') {
			e.preventDefault();
			plan.redo();
		}
	}

	// ── a shared plan, waiting for the student's say-so ──
	let sharedPlan = $state<Record<string, unknown> | null>(null);
	let sharedError = $state('');
	let sharedSummary = $derived.by(() => {
		if (!sharedPlan) return '';
		const placements = sharedPlan.placements as Record<string, string[]>;
		const courses = Object.values(placements).flat().filter(hasCode).length;
		const years = sharedPlan.fourYear === false ? '3-year' : '4-year';
		const batch = typeof sharedPlan.batchStartYear === 'number' ? `, batch ${sharedPlan.batchStartYear}` : '';
		return `${courses} course${courses === 1 ? '' : 's'} on a ${years} plan${batch}.`;
	});
	function openSharedPlan() {
		if (!sharedPlan) return;
		// your own board is kept, as a saved copy you can load back
		if (!savedPlans.full)
			savedPlans.save(`my plan, before a shared one (${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})`, plan.snapshot());
		plan.restore({ ...plan.snapshot(), grades: {}, ...sharedPlan, touched: true });
		sharedPlan = null;
	}

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

{#if sharedPlan || sharedError}
	<Modal title="a shared plan" onclose={() => ((sharedPlan = null), (sharedError = ''))}>
		<div class="phone-note">
			{#if sharedError}
				<p>{sharedError}</p>
				<button onclick={() => (sharedError = '')}>ok</button>
			{:else}
				<p>Someone shared their plan with you: {sharedSummary}</p>
				<p class="shared-note">
					{savedPlans.full
						? 'Opening it replaces your board — your saved-plans list is full, so delete one in settings first to keep a copy.'
						: 'Opening it keeps your current plan as a saved copy (settings → saved plans).'}
				</p>
				<div class="shared-actions">
					<button onclick={openSharedPlan}>open the shared plan</button>
					<button class="secondary" onclick={() => (sharedPlan = null)}>keep my plan</button>
				</div>
			{/if}
		</div>
	</Modal>
{/if}

{#if phoneNote && !desktop}
	<Modal title="better on a laptop" onclose={dismissPhoneNote}>
		<div class="phone-note">
			<p>kcal is better used on a laptop.</p>
			<button onclick={dismissPhoneNote}>continue on phone</button>
		</div>
	</Modal>
{/if}

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
					its description, prerequisites and lecturers.
				</p>
				<p>
					<b>Your plan</b> — tap a course to add, move, remove or grade it. Tap a trimester for a closer
					look.
				</p>
				<p>
					<b>Your degree</b> — choose your programme, check progress and hints, import courses and grades, and
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

<svelte:window onkeydown={onKey} />

<div
	class="app"
	data-ready={ready}
	data-layout={desktop ? 'desktop' : 'phone'}
	inert={!ready}
	class:resizing
	data-mobile-view={mobileView}
	class:details-open={!!plan.selected}
	class:rail-open={plan.railOpen}
	use:dragMotion
	use:touchDrag
	style:--rail-w={panelWidths.rail && `${panelWidths.rail}rem`}
	style:--catalogue-w={panelWidths.catalogue && `${panelWidths.catalogue}rem`}
	style:--details-w={panelWidths.details && `${panelWidths.details}rem`}
>
	<MobileNavigation bind:view={mobileView} credits={plan.totalPlacedCredits} />
	<PanelResizers bind:panelWidths bind:resizing />

	<!-- where the sidebar doesn't fit (an iPad held upright) it folds to this
	     strip at the left edge, and slides back in over the catalogue -->
	<div class="rail-strip">
		<button aria-expanded={plan.railOpen} aria-controls="rail" onclick={() => (plan.railOpen = !plan.railOpen)}>
			<PixelIcon name="gear" />
			<span>your degree</span>
		</button>
	</div>

	<!-- a tap beside a slid-in panel puts it away -->
	{#if desktop && (overlayDetails || overlayRail)}
		<button
			class="scrim"
			tabindex="-1"
			aria-label="close"
			onclick={() => {
				plan.selected = null;
				plan.railOpen = false;
			}}
			transition:fade={{ duration: 160 }}
		></button>
	{/if}

	<aside
		id="rail"
		class="rail"
		use:focusScope={overlayRail}
		inert={desktop
			? overlayDetails || (railSlide && !plan.railOpen)
			: mobileView !== 'rail' || overlayDetails}
	>
		<Sidebar {plan} ontour={() => (tourRequested = true)} onimport={() => (canvasOpen = true)} />
		<HintsPanel {plan} />
	</aside>

	<div
		class="catalogue-panel"
		inert={desktop ? overlayDetails || overlayRail : mobileView !== 'catalogue' || overlayDetails}
	>
		<Catalogue {plan} mobile={!desktop} />
	</div>

	<main
		class="board"
		inert={desktop ? overlayDetails || overlayRail : mobileView !== 'board' || overlayDetails}
	>
		<!-- wrapped so the footer below can be pushed to the bottom of the column
		     on a short plan, and stay pinned there while a long one scrolls -->
		<div class="board-main" data-tour="board">
			{#if plan.zoom}
				<TrimesterZoom {plan} touchLayout={!desktop} />
			{:else}
				<OverviewGrid {plan} touchLayout={!desktop} />
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
			<span class="site-links">· <a href="/courses">courses</a> · <a href="/programmes">programmes</a> · <a href="/lecturers">lecturers</a></span>
		</p>
	</main>

	<!-- a fixed column, so picking a course never shoves a panel over the board -->
	<aside
		class="rightbar"
		data-tour="details"
		bind:this={detailsEl}
		use:focusScope={overlayDetails}
		inert={(!desktop || detailsSlide) && !plan.selected}
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

{#if plan.storageError}<p class="flash" role="alert">{plan.storageError}</p>{/if}

<CanvasImportPanel {plan} bind:open={canvasOpen} initial={canvasTransfer} initialError={canvasError} />

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

	.site-links a {
		color: var(--color-accent);
		text-underline-offset: 0.2em;

		&:hover {
			color: var(--color-text);
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
		--rail-strip-w: 5.2rem;
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
	.shared-note {
		font-size: 1.35rem;
		color: var(--color-text-muted);
	}

	.shared-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;

		.secondary {
			color: var(--color-text);
			background: var(--color-bg-light);
			background-image: none;
			border-color: var(--color-border-card);
		}
	}

	.phone-note {
		display: grid;
		gap: 2rem;
		font-size: 1.6rem;
		line-height: 1.6;

		button {
			padding: 1rem 1.6rem;
			font: inherit;
			font-size: 1.5rem;
			font-weight: 700;
			color: var(--color-on-accent);
			background-color: var(--color-accent);
			border: 1px solid var(--color-control-deep);
			border-radius: 6px;
			cursor: pointer;
			@include glossy-accent;
		}
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
		.catalogue-panel { container: catalogue / inline-size; }
		.board { container: plan / inline-size; }
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
	// the folded sidebar's strip — only where the sidebar doesn't fit
	.rail-strip {
		display: none;
		min-height: 0;
		background: linear-gradient(to bottom, var(--color-bg-sidebar), var(--color-bg-sidebar-end));
		border-right: 1px solid var(--color-border-warm);

		button {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 1rem;
			width: 100%;
			padding: 1.6rem 0;
			font: inherit;
			font-size: 1.3rem;
			font-weight: 600;
			color: var(--color-text-muted);
			background: none;
			border: 0;
			cursor: pointer;

			&:hover,
			&[aria-expanded='true'] {
				color: var(--color-accent);
			}

			span {
				writing-mode: vertical-rl;
				transform: rotate(180deg);
			}
		}
	}

	// behind a slid-in panel: a faint dim to tap on to put it away
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 29;
		padding: 0;
		background: rgba(20, 30, 50, 0.14);
		border: 0;
		cursor: default;
	}

	// Tablets: the desktop columns, less the details — they slide in from the
	// right over the board when a course is picked, and back out after
	@include details-overlay {
		.app {
			grid-template-columns: var(--rail-w) var(--catalogue-w) minmax(0, 1fr);
		}

		.rightbar {
			position: fixed;
			top: 0;
			right: 0;
			bottom: 0;
			z-index: 30;
			width: min(var(--details-w), 90vw);
			padding-right: env(safe-area-inset-right);
			box-shadow: -10px 0 30px rgba(20, 30, 50, 0.18);
			transform: translateX(100%);
			visibility: hidden;
			transition:
				transform 0.3s var(--ease-out),
				visibility 0s 0.3s;
		}

		.details-open .rightbar {
			transform: none;
			visibility: visible;
			transition: transform 0.34s var(--ease-out);
		}
	}

	// …and an iPad held upright: the sidebar folds to its strip and slides in
	// from the left the same way
	@include rail-overlay {
		.app {
			grid-template-columns: var(--rail-strip-w) var(--catalogue-w) minmax(0, 1fr);
		}

		.rail-strip {
			display: block;
		}

		.rail {
			position: fixed;
			top: 0;
			left: 0;
			bottom: 0;
			z-index: 30;
			width: min(calc(var(--rail-w) + 4rem), 90vw);
			padding-left: env(safe-area-inset-left);
			background: var(--color-bg);
			box-shadow: 10px 0 30px rgba(20, 30, 50, 0.18);
			transform: translateX(-100%);
			visibility: hidden;
			transition:
				transform 0.3s var(--ease-out),
				visibility 0s 0.3s;
		}

		.rail-open .rail {
			transform: none;
			visibility: visible;
			transition: transform 0.34s var(--ease-out);
		}
	}
</style>
