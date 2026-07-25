<script lang="ts">
	// the shell every dialog in the app shares: backdrop, titled card, close
	// button, esc-to-close, click-outside-to-close
	import { fade, fly } from 'svelte/transition';
	import type { Snippet } from 'svelte';

	let {
		title,
		width = '46rem',
		onclose,
		children
	}: { title: string; width?: string; onclose: () => void; children: Snippet } = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<!-- only a click on the backdrop ITSELF closes — one that bubbled up out of
     the card is a click on the card -->
<div
	class="backdrop"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && onclose()}
	transition:fade={{ duration: 150 }}
>
	<div
		class="box"
		role="dialog"
		aria-modal="true"
		aria-label={title}
		style="--w: {width}"
		transition:fly={{ y: 14, duration: 220 }}
	>
		<header>
			<h2>{title}</h2>
			<button class="x" aria-label="close" onclick={onclose}>×</button>
		</header>
		<div class="body">
			{@render children()}
		</div>
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2.4rem;
		background: var(--color-backdrop);
	}

	.box {
		display: flex;
		flex-direction: column;
		width: var(--w);
		max-width: 100%;
		max-height: 100%;
		background: linear-gradient(to bottom, var(--color-bg-card-start) 0%, var(--color-bg-card-end) 100%);
		border: 1px solid var(--color-border-card);
		border-radius: 8px;
		@include card-shine;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.6rem;
		padding: 1.4rem 1.8rem;
		border-bottom: 1px solid var(--color-border-divider);

		h2 {
			font-size: 1.8rem;
			font-weight: 600;
			color: var(--color-text);
		}
	}

	.x {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.6rem;
		height: 2.6rem;
		font-size: 2rem;
		line-height: 1;
		color: var(--color-text-muted);
		background: none;
		border: none;
		border-radius: 4px;
		cursor: pointer;

		&:hover {
			color: var(--color-text);
			background: var(--color-hover-medium);
		}
	}

	// a long dialog scrolls inside itself — the page behind never moves
	.body {
		min-height: 0;
		overflow-y: auto;
		padding: 1.8rem;
	}
</style>
