<script lang="ts">
	import { onMount, tick } from 'svelte';

	let { onclose }: { onclose: () => void } = $props();

	const steps = [
		{
			target: 'programme',
			title: 'make this your degree',
			body: 'hi, this is tracey! start here: choose your major, add a minor or concentration, and pick a 3- or 4-year degree. the starting grid is an example to help you get going.'
		},
		{
			target: 'catalogue',
			title: 'find your courses',
			body: 'search the catalogue and filter by subject. the kccs filter shows your foundation courses. drag a course onto your plan to add it, or drag it back here to remove it.'
		},
		{
			target: 'board',
			title: 'see your whole degree',
			body: 'arrange courses by year and trimester. drag them between trimesters, or click a trimester in the overview for a closer look. year 1 t1 and t2 are for kccs foundation courses.'
		},
		{
			target: 'board-toggles',
			title: 'switch how you view it',
			body: 'grade view turns the grid into your transcript — enter grades and track your CGPA instead of credits. show codes / titles controls what each chip is labelled with.'
		},
		{
			target: 'board-actions',
			title: 'let it do the busywork',
			body: 'fill in the rest adds every course the recommended path still suggests, in one click — or click a single dashed course on the grid to add just that one. remove non-programme courses clears out anything on your grid that doesn’t count toward your major, minor, or concentration.'
		},
		{
			target: 'details',
			title: 'get to know a course',
			body: 'click any course to see its details here: credits, when it is offered, what you need to take first, and the courses it unlocks.'
		},
		{
			target: 'hints',
			title: 'keep your plan on track',
			body: 'hints flag things like missing prerequisites and credit loads as you edit. check reference plan opens the suggested path for your programme; the information section above tracks your credits and requirements.'
		},
		{
			target: 'settings',
			title: 'you’re ready to start',
			body: 'your plan saves automatically in this browser. open settings to keep named copies, change the theme, or adjust text size. you can replay this walkthrough any time with quick tour.'
		}
	];

	type Side = 'right' | 'left' | 'bottom' | 'top';
	let index = $state(0);
	let step = $derived(steps[index]);
	let dialog: HTMLDialogElement;
	let card: HTMLDivElement;
	let nextButton: HTMLButtonElement;
	let ready = $state(false);
	let highlight = $state({ left: 0, top: 0, width: 0, height: 0 });
	let placement = $state({ left: 0, top: 0, side: 'right' as Side, arrow: 30 });
	let target: HTMLElement | null = null;
	let observer: ResizeObserver;
	let frame = 0;
	const scrollPositions = new Map<HTMLElement, { left: number; top: number }>();
	const clamp = (value: number, min: number, max: number) =>
		Math.max(min, Math.min(value, Math.max(min, max)));

	function position() {
		if (!target || !card) return;
		const viewportWidth = document.documentElement.clientWidth;
		const viewportHeight = window.innerHeight;
		const bounds = target.getBoundingClientRect();
		let left = Math.max(8, bounds.left - 5);
		let top = Math.max(8, bounds.top - 5);
		let right = Math.min(viewportWidth - 8, bounds.right + 5);
		let bottom = Math.min(viewportHeight - 8, bounds.bottom + 5);

		// Columns scroll independently. Highlight only the part actually visible.
		for (let parent = target.parentElement; parent; parent = parent.parentElement) {
			const style = getComputedStyle(parent);
			const rect = parent.getBoundingClientRect();
			if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
				left = Math.max(left, rect.left);
				right = Math.min(right, rect.right);
			}
			if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
				top = Math.max(top, rect.top);
				bottom = Math.min(bottom, rect.bottom);
			}
		}
		highlight = { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };

		const { width, height } = card.getBoundingClientRect();
		const gap = 20;
		const margin = 16;
		const space: Record<Side, number> = {
			right: viewportWidth - right - gap - margin - width,
			left: left - gap - margin - width,
			bottom: viewportHeight - bottom - gap - margin - height,
			top: top - gap - margin - height
		};
		const sides: Side[] = ['right', 'left', 'bottom', 'top'];
		const side =
			sides.find((side) => space[side] >= 0) ??
			sides.reduce((best, side) => (space[side] > space[best] ? side : best));
		const centerX = (left + right) / 2;
		const centerY = (top + bottom) / 2;
		const x = clamp(
			side === 'right' ? right + gap : side === 'left' ? left - gap - width : centerX - width / 2,
			margin,
			viewportWidth - width - margin
		);
		const y = clamp(
			side === 'bottom' ? bottom + gap : side === 'top' ? top - gap - height : centerY - height / 2,
			margin,
			viewportHeight - height - margin
		);
		placement = {
			left: x,
			top: y,
			side,
			arrow:
				side === 'left' || side === 'right'
					? clamp(centerY - y, 24, height - 24)
					: clamp(centerX - x, 24, width - 24)
		};
		ready = true;
	}

	function schedulePosition() {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(position);
	}

	async function showStep() {
		await tick();
		if (!dialog?.open) return;
		if (target) observer.unobserve(target);
		target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
		if (!target) {
			// A removed component must never leave an invisible modal blocking the app.
			onclose();
			return;
		}
		for (let parent = target.parentElement; parent; parent = parent.parentElement) {
			if (!scrollPositions.has(parent)) {
				scrollPositions.set(parent, { left: parent.scrollLeft, top: parent.scrollTop });
			}
		}
		target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' });
		observer.observe(target);
		position();
		// The first card must be visible before the browser can focus its button.
		await tick();
		if (dialog?.open) nextButton.focus({ preventScroll: true });
	}

	// Some steps target a control that only exists in the DOM some of the time
	// (board-actions: the fill-in / clean-up row, which is absent once there's
	// nothing left to fill in or strip out). Walking past those instead of
	// stopping on them keeps the tour from spotlighting nothing.
	function hasTarget(i: number): boolean {
		return !!document.querySelector(`[data-tour="${steps[i].target}"]`);
	}

	function nextValidIndex(from: number, direction: number): number | null {
		for (let i = from; i >= 0 && i < steps.length; i += direction) {
			if (hasTarget(i)) return i;
		}
		return null;
	}

	function move(direction: number) {
		if (direction > 0 && index === steps.length - 1) {
			onclose();
			return;
		}
		const next = nextValidIndex(index + direction, direction);
		if (next === null) {
			if (direction > 0) onclose();
			return;
		}
		index = next;
		void showStep();
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		if (event.key === 'Tab') {
			const buttons = Array.from(
				dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
			);
			const first = buttons[0];
			const last = buttons[buttons.length - 1];
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
			return;
		}
		if (event.shiftKey) return;
		if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
			event.preventDefault();
			move(event.key === 'ArrowRight' ? 1 : -1);
		}
	}

	onMount(() => {
		const previousFocus = document.activeElement;
		observer = new ResizeObserver(schedulePosition);
		observer.observe(card);
		dialog.showModal();
		void showStep();
		window.addEventListener('resize', schedulePosition);
		window.addEventListener('scroll', schedulePosition, true);
		return () => {
			observer.disconnect();
			cancelAnimationFrame(frame);
			window.removeEventListener('resize', schedulePosition);
			window.removeEventListener('scroll', schedulePosition, true);
			dialog.close();
			for (const [element, position] of scrollPositions) {
				element.scrollTo({ ...position, behavior: 'instant' });
			}
			if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
				previousFocus.focus({ preventScroll: true });
			}
		};
	});
</script>

<!-- A native modal keeps keyboard focus in the tour and the plan inert. -->
<dialog
	bind:this={dialog}
	class="tour"
	aria-labelledby="tour-title"
	aria-describedby="tour-body"
	{onkeydown}
	oncancel={(event) => {
		event.preventDefault();
		onclose();
	}}
>
	<div class="tour-content" class:ready>
		<div
			class="spotlight"
			aria-hidden="true"
			style="left: {highlight.left}px; top: {highlight.top}px; width: {highlight.width}px; height: {highlight.height}px"
		></div>
		<div
			bind:this={card}
			class="callout"
			data-side={placement.side}
			style="left: {placement.left}px; top: {placement.top}px; --arrow: {placement.arrow}px"
		>
			<span class="arrow" aria-hidden="true"></span>
			<div class="callout-content">
				<header>
					<span class="eyebrow">a quick tour</span>
					<button class="skip" onclick={onclose}>skip tour</button>
				</header>
				<div aria-live="polite" aria-atomic="true">
					<p class="step-count">{index + 1} of {steps.length}</p>
					<h2 id="tour-title">{step.title}</h2>
					<p id="tour-body">{step.body}</p>
				</div>
				<footer>
					<div class="progress" aria-hidden="true">
						{#each steps as _, i}<span class:current={i === index} class:done={i < index}
							></span>{/each}
					</div>
					<div class="actions">
						<button class="back" onclick={() => move(-1)} disabled={index === 0}>back</button>
						<button class="next" bind:this={nextButton} onclick={() => move(1)}>
							{index === steps.length - 1 ? 'done' : 'next'}
							<span aria-hidden="true">→</span>
						</button>
					</div>
				</footer>
			</div>
		</div>
	</div>
</dialog>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.tour {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		max-width: none;
		max-height: none;
		margin: 0;
		padding: 0;
		overflow: hidden;
		border: none;
		background: transparent;
		color: var(--color-text);

		&::backdrop {
			background: transparent;
		}
	}

	.tour-content {
		visibility: hidden;
		&.ready {
			visibility: visible;
		}
	}

	.spotlight {
		position: fixed;
		border-radius: 8px;
		box-shadow: 0 0 0 100vmax var(--color-backdrop);
		pointer-events: none;
	}

	.callout {
		position: fixed;
		width: clamp(300px, 34rem, 380px);
		max-width: calc(100vw - 32px);
		font-size: max(14px, 1.4rem);
		background: var(--color-bg-card-start);
		border: 1px solid var(--color-border-card);
		border-radius: 10px;
		box-shadow: var(--shadow-card-hover);
	}

	.callout-content {
		position: relative;
		max-height: calc(100dvh - 32px);
		overflow-y: auto;
		padding: 20px;
	}

	.arrow {
		position: absolute;
		width: 14px;
		height: 14px;
		background: var(--color-bg-card-start);
		border: 1px solid var(--color-border-card);
		transform: rotate(45deg);
	}

	[data-side='right'] .arrow {
		left: -8px;
		top: calc(var(--arrow) - 7px);
		border-right: 0;
		border-top: 0;
	}
	[data-side='left'] .arrow {
		right: -8px;
		top: calc(var(--arrow) - 7px);
		border-left: 0;
		border-bottom: 0;
	}
	[data-side='bottom'] .arrow {
		top: -8px;
		left: calc(var(--arrow) - 7px);
		border-right: 0;
		border-bottom: 0;
	}
	[data-side='top'] .arrow {
		bottom: -8px;
		left: calc(var(--arrow) - 7px);
		border-left: 0;
		border-top: 0;
	}

	header,
	footer,
	.actions,
	.progress {
		display: flex;
		align-items: center;
	}
	header,
	footer {
		justify-content: space-between;
		gap: 12px;
	}
	.eyebrow {
		font-size: 12px;
		font-weight: 600;
		color: var(--color-accent);
	}
	.step-count {
		margin-top: 16px;
		font-size: 12px;
		color: var(--color-text-muted);
	}
	h2 {
		margin-top: 4px;
		font-size: max(20px, 2rem);
		line-height: 1.2;
		font-weight: 600;
	}
	#tour-body {
		margin-top: 10px;
		line-height: 1.6;
	}
	footer {
		margin-top: 22px;
	}
	.actions {
		gap: 8px;
	}
	.progress {
		gap: 5px;
		span {
			width: 5px;
			height: 5px;
			border-radius: 50%;
			background: var(--color-border-card);
		}
		.done {
			background: var(--color-accent);
			opacity: 0.5;
		}
		.current {
			width: 15px;
			border-radius: 4px;
			background: var(--color-accent);
		}
	}
	button {
		padding: 8px 10px;
		font-size: 13px;
		color: var(--color-text);
		background: transparent;
		border: 1px solid transparent;
		border-radius: 6px;
		cursor: pointer;
		&:hover:not(:disabled) {
			background-color: var(--color-hover-medium);
		}
		&:focus-visible {
			outline: 2px solid var(--color-accent);
			outline-offset: 3px;
		}
		&:disabled {
			opacity: 0.4;
			cursor: default;
		}
	}
	.skip {
		padding: 4px 0 4px 8px;
		color: var(--color-text-muted);
		font-size: 12px;
	}
	.next {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--color-on-accent);
		background-color: var(--color-accent);
		border-color: var(--color-control-deep);
		font-weight: 600;
		@include glossy-accent;
		&:hover:not(:disabled) {
			background-color: var(--color-accent);
			filter: brightness(1.08);
		}
	}
</style>
