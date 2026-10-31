<script lang="ts">
	import { onMount } from 'svelte';
	import { DETAILS_OVERLAY_QUERY, RAIL_OVERLAY_QUERY } from '$lib/layout';
	// The side columns can be dragged wider or narrower by their inner edges.
	// Widths are this viewer's own, in rem so they follow the text size, and
	// always leave the board room; double-clicking an edge puts it back.
	type Panel = 'rail' | 'catalogue' | 'details';
	const PANEL_KEY = 'kcal-panel-widths';
	const PANELS: {
		id: Panel;
		label: string;
		base: number;
		min: number;
		max: number;
		side: 1 | -1;
	}[] = [
		{ id: 'rail', label: 'sidebar', base: 24, min: 20, max: 40, side: 1 },
		{ id: 'catalogue', label: 'catalogue', base: 30, min: 22, max: 52, side: 1 },
		// its edge is on its left, so dragging left widens it
		{ id: 'details', label: 'details', base: 32, min: 24, max: 52, side: -1 }
	];
	const BOARD_MIN = 48; // rem
	let {
		panelWidths = $bindable({}),
		resizing = $bindable<Panel | null>(null)
	}: { panelWidths?: Partial<Record<Panel, number>>; resizing?: Panel | null } = $props();
	let resizeFrom = { x: 0, width: 0, rootPx: 10 };

	const widthOf = (id: Panel) => panelWidths[id] ?? PANELS.find((p) => p.id === id)!.base;

	// a panel that slides in over the board takes no room from it
	const docked = (id: Panel) =>
		!(id === 'details' && matchMedia(DETAILS_OVERLAY_QUERY).matches) &&
		!(id === 'rail' && matchMedia(RAIL_OVERLAY_QUERY).matches);

	function setWidth(id: Panel, rem: number, rootPx: number) {
		const p = PANELS.find((q) => q.id === id)!;
		const others = PANELS.filter((q) => q.id !== id && docked(q.id)).reduce((sum, q) => sum + widthOf(q.id), 0);
		const roomy = window.innerWidth / rootPx - BOARD_MIN - others;
		panelWidths[id] = Math.round(Math.max(p.min, Math.min(p.max, roomy, rem)) * 10) / 10;
	}

	function savePanelWidths() {
		try {
			localStorage.setItem(PANEL_KEY, JSON.stringify(panelWidths));
		} catch {
			// widths just won't outlast the visit
		}
	}

	const rootPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;

	onMount(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(PANEL_KEY) ?? '{}') as Record<string, unknown>;
			for (const p of PANELS) {
				const w = saved[p.id];
				if (typeof w === 'number' && w >= p.min && w <= p.max) panelWidths[p.id] = w;
			}
		} catch {
			// unreadable or blocked storage, the default widths stand
		}
	});
</script>

{#each PANELS as p (p.id)}
	<!-- a focusable separator is the ARIA window-splitter pattern, which
		     the a11y lint doesn't know is interactive -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<div
		class="resizer resizer-{p.id}"
		class:active={resizing === p.id}
		role="separator"
		aria-orientation="vertical"
		aria-label="resize the {p.label}"
		aria-valuenow={widthOf(p.id)}
		aria-valuemin={p.min}
		aria-valuemax={p.max}
		tabindex="0"
		title="drag to resize · double-click to reset"
		onpointerdown={(e) => {
			if (e.button !== 0) return;
			e.currentTarget.setPointerCapture(e.pointerId);
			resizeFrom = { x: e.clientX, width: widthOf(p.id), rootPx: rootPx() };
			resizing = p.id;
		}}
		onpointermove={(e) => {
			if (resizing !== p.id) return;
			setWidth(
				p.id,
				resizeFrom.width + (p.side * (e.clientX - resizeFrom.x)) / resizeFrom.rootPx,
				resizeFrom.rootPx
			);
		}}
		onpointerup={() => {
			if (resizing !== p.id) return;
			resizing = null;
			savePanelWidths();
		}}
		onpointercancel={() => (resizing = null)}
		ondblclick={() => {
			delete panelWidths[p.id];
			savePanelWidths();
		}}
		onkeydown={(e) => {
			if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
			e.preventDefault();
			setWidth(p.id, widthOf(p.id) + (e.key === 'ArrowRight' ? 1.6 : -1.6) * p.side, rootPx());
			savePanelWidths();
		}}
	></div>
{/each}

<style lang="scss">
	@use '$lib/styles/mixins' as *;
	// a strip astride each inner column edge to drag by: nothing to see
	// until it's pointed at, then a plum line along the edge
	.resizer {
		position: absolute;
		top: 0;
		bottom: 0;
		z-index: 5;
		width: 9px;
		cursor: col-resize;
		touch-action: none;
		transform: translateX(-50%);

		&::after {
			content: '';
			position: absolute;
			top: 0;
			bottom: 0;
			left: 3px;
			width: 3px;
			background: var(--color-accent);
			opacity: 0;
			transition: opacity 160ms ease;
		}

		&:hover::after,
		&:focus-visible::after {
			opacity: 0.45;
		}

		&.active::after {
			opacity: 0.8;
		}

		&:focus-visible {
			outline: none;
		}
	}

	.resizer-rail {
		left: var(--rail-w);
	}

	.resizer-catalogue {
		left: calc(var(--rail-w) + var(--catalogue-w));
	}

	.resizer-details {
		right: var(--details-w);
		transform: translateX(50%);
	}

	@include mobile {
		.resizer {
			display: none;
		}
	}

	// a panel that slides in over the board has no edge to drag
	@include details-overlay {
		.resizer-details {
			display: none;
		}
	}

	// the sidebar shrinks to its strip, so the catalogue's edge moves in
	@include rail-overlay {
		.resizer-rail {
			display: none;
		}

		.resizer-catalogue {
			left: calc(var(--rail-strip-w) + var(--catalogue-w));
		}
	}

	// a fingertip-wide strip on a touch screen
	@include touch {
		.resizer {
			width: 20px;

			&::after {
				left: 8px;
			}
		}
	}
</style>
