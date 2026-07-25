<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import type { Course, CourseType } from '$lib/types';
	import { codeFor } from '$lib/data';
	import { sendCourse, receiveCourse } from '$lib/transitions';

	let {
		plan,
		course,
		type,
		placed = false,
		contextSubject = undefined
	}: {
		plan: Plan;
		course: Course;
		type: CourseType;
		placed?: boolean;
		contextSubject?: string;
	} = $props();

	// the code this course goes by in the subject you're browsing (HIST235
	// under history), and the other departments it's cross-listed with
	let shownCode = $derived(codeFor(course, contextSubject));
	let alsoCodes = $derived(course.codes.filter((c) => c !== shownCode));
	// the tools courses are cross-listed across every department — showing
	// all of them makes the card balloon, so cap it and count the rest
	const XLIST_MAX = 2;
	let xlistShown = $derived(alsoCodes.slice(0, XLIST_MAX));
	let xlistExtra = $derived(alsoCodes.length - xlistShown.length);
	// a 1-credit card is only a quarter of the row wide — too narrow for a
	// title or a crosslist row without looking broken. Show just the code,
	// centred, as a compact chip; the full details are one click away.
	let compact = $derived(course.credits <= 1);

	function dragstart(e: DragEvent) {
		e.dataTransfer?.setData('text/plain', course.code);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
		plan.dragging = course.code;
	}
</script>

{#if placed}
	<!-- a course already on the grid leaves a dashed placeholder; the ↩ button
	     lifts it back off, which flies it home to this slot (see the grid's
	     out:sendCourse) -->
	<div class="card placed" class:compact title="{shownCode} is already on your plan">
		<span class="code">{shownCode}</span>
		{#if !compact}
			<span class="title">{course.title}</span>
		{/if}
		<button
			class="unplace"
			aria-label="take {shownCode} back off the grid"
			title="take {shownCode} back off the grid"
			onclick={(e) => {
				e.stopPropagation();
				plan.remove(course.code);
			}}
		>
			↩
		</button>
	</div>
{:else}
	<div
		class="card"
		class:compact
		class:dragging={plan.dragging === course.code}
		data-type={type}
		data-prog={plan.accentOf(course.code)}
		draggable="true"
		role="listitem"
		in:receiveCourse={{ key: course.code }}
		out:sendCourse={{ key: course.code }}
		ondragstart={dragstart}
		ondragend={() => (plan.dragging = null)}
		onclick={() => (plan.selected = course)}
		title={compact ? `${shownCode} — ${course.title}` : `drag ${shownCode} onto the grid`}
	>
		<span class="code">
			{shownCode}
			{#if alsoCodes.length && !compact}
				<span class="xlist" title="cross-listed as {alsoCodes.join(', ')}">
					⇄ {xlistShown.join(' · ')}{xlistExtra > 0 ? ` +${xlistExtra}` : ''}
				</span>
			{/if}
		</span>
		{#if !compact}
			<span class="title">{course.title}</span>
		{/if}
	</div>
{/if}

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow: hidden; // nothing (a long crosslist row) may spill outside
		padding: 1rem 1.2rem;
		border-radius: 6px; // a touch rounder, so the shine reads as a curved face
		cursor: grab;
		transition:
			transform 0.15s ease,
			opacity 0.15s ease,
			box-shadow 0.2s ease;
		@include course-type-fill;
		@include card-shine;
		@include programme-accent;

		&:hover {
			transform: translateY(-2px);
			@include card-shine-hover;
		}

		&:active {
			cursor: grabbing;
		}

		// the source of an in-flight drag fades, so the cursor ghost reads as
		// the course being picked up out of the catalogue
		&.dragging {
			opacity: 0.4;
			transform: scale(0.98);
		}

		&.placed {
			background: transparent;
			border: 1.5px dashed var(--color-border-card);
			box-shadow: none;
			color: var(--color-text-muted);
			cursor: default;

			&:hover {
				transform: none;
			}
		}

		// 1-credit courses are a quarter-row wide — just the code, centred,
		// so the little card reads as a neat chip instead of a cramped mess
		&.compact {
			align-items: center;
			justify-content: center;
			text-align: center;
			padding: 1rem 0.4rem;

			.code {
				// small enough that a full 7-char code (MATH061) fits the
				// quarter-width card without clipping
				font-size: 1.1rem;
				letter-spacing: -0.02em;
			}
		}
	}

	.code {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.5rem;
		min-width: 0;
		max-width: 100%;
		font-size: 1.5rem;
		font-weight: 700;
	}

	// the cross-listed departments — muted so the code you're browsing
	// under stays the anchor, but visible so it's obvious it's shared.
	// Ellipsizes rather than pushing past the (often narrow) card edge.
	.xlist {
		min-width: 0;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: 1.15rem;
		font-weight: 600;
		color: var(--color-text-muted);
		padding: 0.1rem 0.5rem;
		background: var(--color-subtle);
		border-radius: 3px;
		white-space: nowrap;
	}

	// two lines then ellipsis — enough to tell courses apart without letting
	// a long title stretch the card taller than its neighbours
	.title {
		font-size: 1.4rem;
		line-height: 1.3;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	// small "take back" button tucked into the placed card's top-right corner
	.unplace {
		position: absolute;
		top: 0.3rem;
		right: 0.3rem;
		width: 1.8rem;
		height: 1.8rem;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		font-size: 1.2rem;
		line-height: 1;
		color: var(--color-text-muted);
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 3px;
		cursor: pointer;
		transition:
			transform 0.15s ease,
			background 0.15s ease,
			color 0.15s ease;

		&:hover {
			color: var(--color-text);
			background: var(--color-hover-medium);
			transform: scale(1.12);
		}
	}
</style>
