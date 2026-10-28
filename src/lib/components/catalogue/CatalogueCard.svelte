<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import type { Course, CourseType } from '$lib/types';
	import { codeFor } from '$lib/data';
	import { courseIn, courseOut } from '$lib/transitions';

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
	let label = $derived(plan.courseLabel(course.code, shownCode));
	// a quarter-width card only has room for one short line
	let compactText = $derived(plan.showCodes ? shownCode : course.title);
	let alsoCodes = $derived(course.codes.filter((c) => c !== shownCode));
	// the tools courses are cross-listed across every department — showing
	// all of them makes the card balloon, so cap it and count the rest
	const XLIST_MAX = 2;
	let xlistShown = $derived(alsoCodes.slice(0, XLIST_MAX));
	let xlistExtra = $derived(alsoCodes.length - xlistShown.length);
	// a 1-credit card is only a quarter of the row wide — too narrow for a
	// title or crosslist row without clipping; clamp the title to two lines.
	let pending = $derived(course.pendingCredits && course.credits === 0);
	let compact = $derived(!pending && course.credits <= 1);
	// a card with the whole catalogue row to itself (see Catalogue's spans) —
	// the only width with room for a worded "on plan" button
	let fullRow = $derived(pending || course.credits >= 3);
	// the fill alone doesn't say "required" to someone who hasn't read the
	// legend, so required courses also lead with a dot (no room on a chip)
	let showReq = $derived(type === 'required' && !compact);

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
	<div data-course-card tabindex="-1" class="card placed" class:compact title="{label} is already on your plan">
		{#if plan.showCodes || compact}<span class="code">{compact ? compactText : shownCode}</span>{/if}
		{#if !compact}
			<span class="title">{course.title}</span>
		{/if}
		<button
			class="unplace"
			class:icon={!fullRow}
			aria-label="take {label} back off the grid"
			title="take {label} back off the grid"
			onclick={(e) => {
				e.stopPropagation();
				plan.remove(course.code);
			}}
		>
			<!-- says what it is ("on plan") and, under the cursor, what it does -->
			{#if fullRow}<span class="state">on plan ↩</span><span class="act">remove ↩</span>{:else}↩{/if}
		</button>
	</div>
{:else}
	<button
		type="button"
		data-course-card
		class="card"
		class:compact
		class:dragging={plan.dragging === course.code}
		data-type={type}
		style:--hue={plan.hueOf(course.code)}
		draggable={!pending}
		in:courseIn={{ key: course.code }}
		out:courseOut={{ key: course.code }}
		ondragstart={dragstart}
		ondragend={() => (plan.dragging = null)}
		onclick={() => (plan.selected = course)}
		title={pending ? `${label} — credits awaiting confirmation` : `drag ${label} onto the grid`}
	>
		{#if plan.showCodes || compact}
		<span class="code">
			{#if showReq}<span class="req-dot" role="img" aria-label="required" title="required by your programme"></span>{/if}
			{compact ? compactText : shownCode}
			{#if alsoCodes.length && !compact}
				<span class="xlist" title="cross-listed as {alsoCodes.join(', ')}">
					⇄ {xlistShown.join(' · ')}{xlistExtra > 0 ? ` +${xlistExtra}` : ''}
				</span>
			{/if}
		</span>
		{/if}
		{#if !compact}
			<!-- with codes switched off there's no code row, so the dot leads the title -->
			<span class="title">{#if showReq && !plan.showCodes}<span class="req-dot" role="img" aria-label="required" title="required by your programme"></span>{/if}{course.title}</span>
			<!-- with codes off there's no code row to carry the cross-listing,
			     so it gets a line of its own under the title -->
			{#if !plan.showCodes && alsoCodes.length}
				<span class="xlist alone" title="cross-listed as {alsoCodes.join(', ')}">
					⇄ {xlistShown.join(' · ')}{xlistExtra > 0 ? ` +${xlistExtra}` : ''}
				</span>
			{/if}
		{/if}
		{#if pending}<span class="pending">credits to confirm</span>{/if}
	</button>
{/if}

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.pending { font-size: var(--text-body); color: var(--color-text-muted); margin-top: .5rem; }
	.card {
		position: relative;
		text-align: left;
		font: inherit;
		color: var(--color-text);
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
		@include course-type-fill(false);
		box-shadow: var(--shadow-inset);

		&:hover {
			transform: translateY(-1px);
			box-shadow: var(--shadow-inset-hover);
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
				// quarter-width card without clipping; a title ellipsizes
				display: block;
				overflow: hidden;
				white-space: nowrap;
				text-overflow: ellipsis;
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
		font-size: var(--text-body);
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
		font-weight: 400;
		color: var(--color-text-muted);
		white-space: nowrap;

		&.alone {
			margin-top: 0.3rem;
		}
	}

	.req-dot {
		@include required-dot;
		align-self: center;

		.title & {
			margin-right: 0.5rem;
			vertical-align: 0.1em;
		}
	}

	// two lines then ellipsis — enough to tell courses apart without letting
	// a long title stretch the card taller than its neighbours
	.title {
		font-size: var(--text-body);
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
		min-width: 1.8rem;
		height: 1.8rem;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 0.5rem;
		font-size: 1.1rem;
		line-height: 1;
		color: var(--color-text-muted);
		background: none;
		border: none;
		cursor: pointer;
		transition:
			transform 0.15s ease,
			color 0.15s ease;

		&:hover {
			color: var(--color-text);
			transform: scale(1.06);
		}

		.act {
			display: none;
		}

		&:hover,
		&:focus-visible {
			.state {
				display: none;
			}

			.act {
				display: inline;
			}
		}
	}

	.unplace.icon {
		padding: 0;
	}
</style>
