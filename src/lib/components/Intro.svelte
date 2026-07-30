<script lang="ts">
	import { browser } from '$app/environment';
	import { fade, fly } from 'svelte/transition';

	const SEEN_KEY = 'tracey-intro-seen';

	// shown once, on the very first visit — dismissing it is remembered
	let show = $state(browser && !localStorage.getItem(SEEN_KEY));

	function dismiss() {
		show = false;
		localStorage.setItem(SEEN_KEY, '1');
	}
</script>

{#if show}
	<div class="backdrop" transition:fade={{ duration: 150 }}>
		<div class="box" role="dialog" aria-label="how tracey works" transition:fly={{ y: 14, duration: 220 }}>
			<h2>hi, this is tracey</h2>
			<p class="sub">plan your whole Krea degree on one grid</p>

			<ul>
				<li>pick your <b>programme</b> (major / minor) in the left panel</li>
				<li><b>drag courses</b> from the catalogue onto the year × trimester grid</li>
				<li>year 1 t1 &amp; t2 take only the <b>kccs foundation courses</b></li>
				<li>the <b>hints</b> on the left flag anything that breaks a university rule</li>
				<li>the grid starts on the <b>recommended path</b> — dashed courses are ones it suggests, click to add</li>
				<li>everything <b>saves automatically</b> in your browser</li>
			</ul>

			<button class="go" onclick={dismiss}>got it</button>
		</div>
	</div>
{/if}

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2.4rem;
		background: var(--color-backdrop);
	}

	.box {
		max-width: 42rem;
		padding: 2.4rem 2.8rem;
		background: linear-gradient(to bottom, var(--color-bg-card-start) 0%, var(--color-bg-card-end) 100%);
		border: 1px solid var(--color-border-card);
		border-radius: 6px;
		@include card-shine;

		h2 {
			font-size: 2rem;
			font-weight: 600;
			color: var(--color-text);
		}

		.sub {
			margin-top: 0.2rem;
			font-size: 1.35rem;
			color: var(--color-text-muted);
		}

		ul {
			margin: 1.6rem 0 0;
			padding-left: 1.8rem;
			font-size: 1.4rem;
			line-height: 1.8;
			color: var(--color-text);

			li {
				list-style: disc;
			}
		}
	}

	.go {
		display: block;
		margin: 2rem auto 0;
		padding: 0.9rem 3.2rem;
		font-size: 1.4rem;
		font-weight: 600;
		color: var(--color-on-accent);
		background-color: var(--color-accent);
		border: 1px solid var(--color-control-deep);
		border-radius: 6px;
		cursor: pointer;
		@include glossy-accent;

		&:hover {
			filter: brightness(1.07);
		}
	}
</style>
