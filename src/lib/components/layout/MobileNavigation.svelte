<script lang="ts">
	import PixelIcon from '../PixelIcon.svelte';

	let {
		view = $bindable('catalogue'),
		credits
	}: {
		view?: 'catalogue' | 'board' | 'rail';
		credits: number;
	} = $props();
	const tabs = [
		{ id: 'catalogue', label: 'catalogue', icon: 'search' },
		{ id: 'board', label: 'your plan', icon: 'grade' },
		{ id: 'rail', label: 'your degree', icon: 'gear' }
	] as const;
</script>

<header class="mobile-header">
	<a href="/" aria-label="kcal home">kcal<span>your degree, your way</span></a>
	<button onclick={() => (view = 'board')} aria-label="view your plan, {credits} credits"
		>{credits}<span>credits planned</span></button
	>
</header>
<nav aria-label="main navigation">
	{#each tabs as tab (tab.id)}
		<button aria-current={view === tab.id ? 'page' : undefined} onclick={() => (view = tab.id)}>
			<PixelIcon name={tab.icon} size="2rem" />
			<span>{tab.label}</span>
		</button>
	{/each}
</nav>

<style lang="scss">
	@use '$lib/styles/mixins' as *;
	.mobile-header,
	nav {
		display: none;
	}
	@include mobile {
		.mobile-header {
			grid-area: 1 / 1;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 1rem;
			padding: calc(1.4rem + env(safe-area-inset-top)) max(1.8rem, env(safe-area-inset-right))
				1.4rem max(1.8rem, env(safe-area-inset-left));
			background: var(--color-bg-sidebar);
			border-bottom: 1px solid var(--color-border-warm);
			a {
				font-size: 2.8rem;
				font-weight: 750;
				letter-spacing: -0.08em;
				color: var(--color-accent);
				text-decoration: none;
			}
			a span {
				display: block;
				font-size: 1.2rem;
				font-weight: 400;
				letter-spacing: 0;
				color: var(--color-text-muted);
				margin-top: 0.2rem;
			}
			button {
				padding: 0.6rem 1.2rem;
				font-size: 1.8rem;
				font-weight: 700;
				text-align: right;
				color: var(--color-accent);
				background: var(--color-bg-light);
				border: 1px solid var(--color-border-card);
				border-radius: 1rem;
			}
			button span {
				display: block;
				font-size: 1.1rem;
				font-weight: 400;
				color: var(--color-text-muted);
			}
		}
		nav {
			grid-area: 3 / 1;
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 0.6rem;
			padding: 0.8rem max(1.2rem, env(safe-area-inset-right))
				calc(0.8rem + env(safe-area-inset-bottom)) max(1.2rem, env(safe-area-inset-left));
			background: var(--color-bg-sidebar);
			border-top: 1px solid var(--color-border-warm);
			button {
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				gap: 0.5rem;
				min-height: 5.4rem;
				padding: 0.6rem;
				font: inherit;
				font-size: 1.2rem;
				font-weight: 600;
				color: var(--color-text-muted);
				background: transparent;
				border: 1px solid transparent;
				border-radius: 1rem;
				cursor: pointer;
			}
			button[aria-current] {
				color: var(--color-accent);
				background: var(--color-bg-light);
				border-color: var(--color-border-card);
				box-shadow: var(--shadow-inset);
			}
		}
	}
</style>
