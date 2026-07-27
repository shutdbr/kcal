<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import { settings, TEXT_SIZES, type ThemeChoice } from '$lib/settings.svelte';
	import Modal from './Modal.svelte';

	let { plan, onclose }: { plan: Plan; onclose: () => void } = $props();

	const THEMES: { id: ThemeChoice; label: string }[] = [
		{ id: 'light', label: 'light' },
		{ id: 'dark', label: 'dark' },
		{ id: 'system', label: 'auto' }
	];

	// ── feedback ──
	// no server behind tracey, so "send" opens a prefilled issue on the repo;
	// copy is there for anyone without a GitHub account
	const REPO = 'https://github.com/tdvnm/tracey';

	let message = $state('');
	let copied = $state(false);

	let body = $derived(
		[
			message.trim(),
			'',
			'---',
			`plan: ${plan.structure}, ${plan.fourYear ? '4-year' : '3-year'}`,
			`credits placed: ${plan.totalPlacedCredits}/${plan.degreeTotal}`
		]
			.filter((l) => l !== '')
			.join('\n')
	);

	function send() {
		if (!message.trim()) return;
		const url = `${REPO}/issues/new?title=${encodeURIComponent('[feedback] ')}&body=${encodeURIComponent(body)}`;
		window.open(url, '_blank', 'noopener');
	}

	async function copy() {
		if (!message.trim()) return;
		try {
			await navigator.clipboard.writeText(`[feedback]\n${body}`);
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			// clipboard blocked — the textarea is right there to select from
		}
	}

	// ── start over ──
	// two taps, because this throws away a plan that took real work
	let confirming = $state(false);
	let confirmTimer: ReturnType<typeof setTimeout>;

	function startOver() {
		if (!confirming) {
			confirming = true;
			confirmTimer = setTimeout(() => (confirming = false), 4000);
			return;
		}
		clearTimeout(confirmTimer);
		confirming = false;
		plan.reset();
		onclose();
	}
</script>

<Modal title="settings" {onclose}>
	<section>
		<h3>appearance</h3>

		<div class="row">
			<span class="row-label">theme</span>
			<div class="seg" role="group" aria-label="theme">
				{#each THEMES as t (t.id)}
					<button class:active={settings.theme === t.id} onclick={() => settings.setTheme(t.id)}>
						{t.label}
					</button>
				{/each}
			</div>
		</div>

		<div class="row">
			<span class="row-label">text size</span>
			<div class="seg" role="group" aria-label="text size">
				{#each TEXT_SIZES as s (s.id)}
					<button class:active={settings.textSize === s.id} onclick={() => settings.setTextSize(s.id)}>
						{s.label}
					</button>
				{/each}
			</div>
		</div>
	</section>

	<section>
		<h3>feedback</h3>

		<textarea
			bind:value={message}
			rows="4"
			placeholder="something wrong or missing? let me know."
		></textarea>

		<div class="actions">
			<button class="primary" disabled={!message.trim()} onclick={send}>send</button>
			<button disabled={!message.trim()} onclick={copy}>{copied ? 'copied ✓' : 'copy instead'}</button>
		</div>
	</section>

	<section>
		<h3>your plan</h3>
		<p class="note">saved in this browser only.</p>
		<div class="actions">
			<button class="danger" onclick={startOver}>
				{confirming ? 'really start over?' : 'start over'}
			</button>
		</div>
	</section>
</Modal>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	section {
		padding-bottom: 1.6rem;

		& + section {
			margin-top: 1.6rem;
			padding-top: 1.6rem;
			border-top: 1px solid var(--color-border-divider);
		}

		&:last-child {
			padding-bottom: 0;
		}
	}

	h3 {
		@include section-label;
		margin-bottom: 1rem;
	}

	.row {
		display: grid;
		grid-template-columns: 8rem 1fr;
		align-items: center;
		gap: 1rem;

		& + .row {
			margin-top: 1rem;
		}
	}

	.row-label {
		font-size: 1.35rem;
		color: var(--color-text);
	}

	.seg {
		@include segmented;
	}

	.note {
		margin-top: 0.8rem;
		font-size: 1.2rem;
		line-height: 1.45;
		color: var(--color-text-muted);
	}

	textarea {
		width: 100%;
		min-width: 0;
		padding: 0.6rem 0.8rem;
		font-size: 1.3rem;
		color: var(--color-text);
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 5px;
		box-shadow: var(--shadow-well);
		margin-top: 1rem;
		resize: vertical;
		line-height: 1.45;
		font-family: inherit;

		&::placeholder {
			color: var(--color-text-muted);
		}
	}

	.actions {
		display: flex;
		gap: 0.8rem;
		margin-top: 1rem;

		button {
			padding: 0.7rem 1.6rem;
			font-size: 1.3rem;
			font-weight: 600;
			color: var(--color-text);
			background-color: var(--color-bg-light);
			border: 1px solid var(--color-border-card);
			border-radius: 5px;
			cursor: pointer;
			@include glossy;

			&:disabled {
				opacity: 0.5;
				cursor: not-allowed;
			}

			&.primary {
				color: var(--color-on-accent);
				background-color: var(--color-accent);
				border-color: var(--color-control-deep);
				@include glossy-accent;
			}

			// destructive, so it's the one button wearing the danger colour
			&.danger {
				color: var(--color-on-accent);
				background-color: var(--color-danger);
				border-color: var(--color-danger-deep);
				@include glossy-accent;
			}
		}
	}
</style>
