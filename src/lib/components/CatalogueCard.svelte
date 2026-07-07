<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import type { Course, CourseType } from '$lib/types';
	import { codeFor } from '$lib/data';

	let {
		plan,
		course,
		type,
		placed = false,
		detailed = false,
		contextSubject = undefined
	}: {
		plan: Plan;
		course: Course;
		type: CourseType;
		placed?: boolean;
		detailed?: boolean;
		contextSubject?: string;
	} = $props();

	// the code this course goes by in the subject you're browsing (HIST235
	// under history), and the other departments it's cross-listed with
	let shownCode = $derived(codeFor(course, contextSubject));
	let alsoCodes = $derived(course.codes.filter((c) => c !== shownCode));

	function dragstart(e: DragEvent) {
		e.dataTransfer?.setData('text/plain', course.code);
		plan.dragging = course.code;
	}
</script>

<div
	class="card"
	class:placed
	class:detailed
	data-type={type}
	draggable={!placed}
	role="listitem"
	ondragstart={dragstart}
	ondragend={() => (plan.dragging = null)}
	onclick={() => (plan.selected = course)}
	title={placed ? `${shownCode} is already on your plan` : `drag ${shownCode} onto the grid`}
>
	<span class="code">
		{shownCode}
		{#if alsoCodes.length}
			<span class="xlist" title="cross-listed as {alsoCodes.join(', ')}">
				⇄ {alsoCodes.join(' · ')}
			</span>
		{/if}
	</span>
	<span class="title">{course.title}</span>
	<span class="credits">credits : {course.credits}</span>
	{#if placed}
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
	{/if}
</div>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 0;
		padding: 1rem 1.2rem;
		border-radius: 4px;
		cursor: grab;
		transition: box-shadow 0.2s ease;
		@include course-type-fill;
		@include card-shine;

		&:hover {
			@include card-shine-hover;
		}

		&.placed {
			background: transparent;
			border: 1.5px dashed var(--color-border-card);
			box-shadow: none;
			color: var(--color-text-muted);
			cursor: default;
		}
	}

	.code {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.5rem;
		font-size: 1.5rem;
		font-weight: 700;
	}

	// the cross-listed departments — muted so the code you're browsing
	// under stays the anchor, but visible so it's obvious it's shared
	.xlist {
		font-size: 1.15rem;
		font-weight: 600;
		color: var(--color-text-muted);
		padding: 0.1rem 0.5rem;
		background: var(--color-subtle);
		border-radius: 3px;
		white-space: nowrap;
	}

	.title {
		font-size: 1.4rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.detailed .title {
		white-space: normal;
	}

	.credits {
		margin-top: 0.2rem;
		font-size: 1.2rem;
		color: var(--color-text-muted);
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

		&:hover {
			color: var(--color-text);
			background: var(--color-hover-medium);
		}
	}
</style>
