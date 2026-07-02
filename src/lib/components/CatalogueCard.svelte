<script lang="ts">
	import type { Course, CourseType } from '$lib/types';

	let {
		course,
		type,
		placed = false,
		detailed = false
	}: { course: Course; type: CourseType; placed?: boolean; detailed?: boolean } = $props();

	function dragstart(e: DragEvent) {
		e.dataTransfer?.setData('text/plain', course.code);
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
	title={placed ? `${course.code} is already on your plan` : `drag ${course.code} onto the grid`}
>
	<span class="code">{course.code}</span>
	<span class="title">{course.title}</span>
	{#if detailed}
		<span class="faculty">{course.faculty}</span>
	{/if}
</div>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.card {
		display: flex;
		flex-direction: column;
		padding: 1rem 1.2rem;
		border-radius: 4px;
		cursor: grab;
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
		font-size: 1.5rem;
		font-weight: 700;
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

	.faculty {
		margin-top: 1rem;
		font-size: 1.3rem;
	}
</style>
