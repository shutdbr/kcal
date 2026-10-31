<script lang="ts">
	// The one feedback form, in settings, and in the window a course, a hint
	// or the footer opens (pre-filled with what it's about). Posts to the
	// netlify form declared in app.html, no server of our own, submissions
	// land in the netlify dashboard. Whatever plan the student is on rides
	// along, since "the grid is wrong" needs the grid to make sense.
	import type { Plan } from '$lib/plan.svelte';

	let { plan, prefill = '', onsent }: { plan: Plan; prefill?: string; onsent?: () => void } = $props();

	// the form is created fresh each time it opens, so taking the pre-fill once
	// is the point, later edits are the student's
	// svelte-ignore state_referenced_locally
	let message = $state(prefill);
	let copied = $state(false);
	let sending = $state(false);
	let sent = $state(false);
	let failed = $state(false);

	let context = $derived(`${plan.structure}, ${plan.fourYear ? '4-year' : '3-year'}`);
	let body = $derived(
		[message.trim(), '', '---', `plan: ${context}`, `credits placed: ${plan.totalPlacedCredits}/${plan.degreeTotal}`]
			.filter((l) => l !== '')
			.join('\n')
	);

	async function send() {
		if (!message.trim() || sending) return;
		sending = true;
		failed = false;
		try {
			const res = await fetch('/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					'form-name': 'feedback',
					'bot-field': '', // honeypot, a bot fills this in, a student can't see it
					message: message.trim(),
					plan: context,
					credits: `${plan.totalPlacedCredits}/${plan.degreeTotal}`
				}).toString()
			});
			if (!res.ok) throw new Error(String(res.status));
			message = '';
			sent = true;
			setTimeout(() => {
				sent = false;
				onsent?.();
			}, 1400);
		} catch {
			// offline, or running somewhere netlify isn't handling the post,
			// the text stays in the box and "copy instead" still works
			failed = true;
		} finally {
			sending = false;
		}
	}

	async function copy() {
		if (!message.trim()) return;
		try {
			await navigator.clipboard.writeText(`[feedback]\n${body}`);
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			// clipboard blocked, the textarea is right there to select from
		}
	}
</script>

<textarea
	bind:value={message}
	rows="5"
	placeholder="something wrong, confusing or missing? tell me, a wrong prerequisite, a course that isn't offered when it says, anything."
></textarea>

<div class="actions">
	<button class="primary" disabled={!message.trim() || sending} onclick={send}>
		{sending ? 'sending…' : sent ? 'sent ✓' : 'send'}
	</button>
	<button disabled={!message.trim()} onclick={copy}>{copied ? 'copied ✓' : 'copy instead'}</button>
</div>
{#if sent}
	<p class="note">thank you, it's in.</p>
{:else if failed}
	<p class="note">that didn't go through. try again, or copy the text and send it another way.</p>
{/if}

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	textarea {
		width: 100%;
		min-width: 0;
		padding: 0.7rem 0.9rem;
		font-family: inherit;
		font-size: 1.35rem;
		line-height: 1.45;
		color: var(--color-text);
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 5px;
		box-shadow: var(--shadow-well);
		resize: vertical;

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
				opacity: 0.6;
				cursor: not-allowed;
			}

			&.primary {
				color: var(--color-on-accent);
				background-color: var(--color-accent);
				border-color: var(--color-control-deep);
				@include glossy-accent;
			}
		}
	}

	.note {
		margin-top: 0.8rem;
		font-size: 1.25rem;
		line-height: 1.45;
		color: var(--color-text-muted);
	}
</style>
