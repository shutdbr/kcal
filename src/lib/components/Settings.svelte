<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import { settings, TEXT_SIZES, type ThemeChoice } from '$lib/settings.svelte';
	import { savedPlans, MAX_SAVES } from '$lib/savedPlans.svelte';
	import { subjectById } from '$lib/data';
	import Modal from './Modal.svelte';

	let { plan, onclose }: { plan: Plan; onclose: () => void } = $props();

	const THEMES: { id: ThemeChoice; label: string }[] = [
		{ id: 'light', label: 'light' },
		{ id: 'dark', label: 'dark' },
		{ id: 'system', label: 'auto' }
	];

	// ── saved plans ──
	// The board keeps ONE plan, autosaved. Saving here keeps a copy of it under
	// a name, so "what would a double major look like" is: save this, change
	// the degree, and load the old one back if you liked it better.
	let saveName = $state('');
	// a name you'd actually recognise in a list: the degree it is
	let suggestedName = $derived(
		[
			plan.programmes.map((pr) => subjectById(pr.subject).short).join(' + '),
			plan.fourYear ? '4yr' : '3yr'
		].join(' · ')
	);

	function saveNow() {
		savedPlans.save(saveName.trim() || suggestedName, plan.snapshot());
		saveName = '';
	}

	// loading replaces what is on the board, so it asks twice — same guard as
	// "start over", for the same reason
	let confirmLoad = $state<string | null>(null);
	let confirmDelete = $state<string | null>(null);
	let loadTimer: ReturnType<typeof setTimeout>;
	let delTimer: ReturnType<typeof setTimeout>;

	function load(id: string) {
		if (confirmLoad !== id) {
			confirmLoad = id;
			confirmDelete = null;
			clearTimeout(loadTimer);
			loadTimer = setTimeout(() => (confirmLoad = null), 4000);
			return;
		}
		clearTimeout(loadTimer);
		confirmLoad = null;
		const entry = savedPlans.items.find((x) => x.id === id);
		if (entry) plan.restore(entry.data);
		onclose();
	}

	function del(id: string) {
		if (confirmDelete !== id) {
			confirmDelete = id;
			confirmLoad = null;
			clearTimeout(delTimer);
			delTimer = setTimeout(() => (confirmDelete = null), 4000);
			return;
		}
		clearTimeout(delTimer);
		confirmDelete = null;
		savedPlans.remove(id);
	}

	const when = (ms: number) =>
		new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) +
		' ' +
		new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

	// ── feedback ──
	// posts to the netlify form declared in app.html — no server of our own,
	// submissions land in the netlify dashboard. Whatever plan the student is
	// on rides along, since "the grid is wrong" needs the grid to make sense.
	let message = $state('');
	let copied = $state(false);
	let sending = $state(false);
	let sent = $state(false);
	let failed = $state(false);

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
					'bot-field': '', // honeypot — a bot fills this in, a student can't see it
					message: message.trim(),
					plan: `${plan.structure}, ${plan.fourYear ? '4-year' : '3-year'}`,
					credits: `${plan.totalPlacedCredits}/${plan.degreeTotal}`
				}).toString()
			});
			if (!res.ok) throw new Error(String(res.status));
			message = '';
			sent = true;
			setTimeout(() => (sent = false), 3000);
		} catch {
			// offline, or running somewhere netlify isn't handling the post —
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
			<button class="primary" disabled={!message.trim() || sending} onclick={send}>
				{sending ? 'sending…' : sent ? 'sent ✓' : 'send'}
			</button>
			<button disabled={!message.trim()} onclick={copy}>{copied ? 'copied ✓' : 'copy instead'}</button>
		</div>
		{#if sent}
			<p class="note">thank you — it's in.</p>
		{:else if failed}
			<p class="note">that didn't go through. try again, or copy the text and send it another way.</p>
		{/if}
	</section>

	<section>
		<h3>saved plans</h3>
		<p class="note">
			your board autosaves on its own. this keeps a named copy you can come back to — all in this
			browser, nothing leaves it.
		</p>

		<div class="save-new">
			<input
				type="text"
				placeholder={suggestedName}
				bind:value={saveName}
				onkeydown={(e) => e.key === 'Enter' && saveNow()}
			/>
			<button onclick={saveNow} disabled={savedPlans.full}>save this plan</button>
		</div>

		{#if savedPlans.full}
			<p class="note warn">that's {MAX_SAVES} saved plans — delete one to save another.</p>
		{/if}
		{#if savedPlans.error}
			<p class="note warn">{savedPlans.error}</p>
		{/if}

		{#if savedPlans.items.length}
			<ul class="saves">
				{#each savedPlans.items as p (p.id)}
					<li>
						<span class="s-name">{p.name}</span>
						<span class="s-when">{when(p.savedAt)}</span>
						<button class="s-act" class:confirming={confirmLoad === p.id} onclick={() => load(p.id)}>
							{confirmLoad === p.id ? 'replace board?' : 'load'}
						</button>
						<button
							class="s-act danger"
							class:confirming={confirmDelete === p.id}
							onclick={() => del(p.id)}
						>
							{confirmDelete === p.id ? 'delete?' : '×'}
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="note empty">nothing saved yet.</p>
		{/if}
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

	.save-new {
		display: flex;
		gap: 0.8rem;
		margin-top: 0.8rem;

		input {
			flex: 1;
			min-width: 0;
			padding: 0.6rem 0.8rem;
			font: inherit;
			font-size: 1.3rem;
			color: var(--color-text);
			background: var(--color-bg);
			border: 1px solid var(--color-border-card);
			border-radius: 5px;
		}

		button {
			padding: 0.6rem 1.2rem;
			font: inherit;
			font-size: 1.3rem;
			color: var(--color-text);
			background: var(--color-bg-light);
			border: 1px solid var(--color-border-card);
			border-radius: 5px;
			cursor: pointer;

			&:hover:not(:disabled) {
				background: var(--color-hover-medium);
			}

			&:disabled {
				opacity: 0.45;
				cursor: default;
			}
		}
	}

	.saves {
		margin-top: 1rem;
		list-style: none;

		li {
			display: grid;
			grid-template-columns: 1fr auto auto auto;
			align-items: center;
			gap: 0.8rem;
			padding: 0.6rem 0;
			font-size: 1.3rem;

			& + li {
				border-top: 1px solid var(--color-border-light);
			}
		}

		.s-name {
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
			color: var(--color-text);
		}

		.s-when {
			font-size: 1.1rem;
			color: var(--color-text-muted);
		}
	}

	.s-act {
		padding: 0.35rem 0.9rem;
		font: inherit;
		font-size: 1.2rem;
		color: var(--color-text);
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 4px;
		cursor: pointer;

		&:hover {
			background: var(--color-hover-medium);
		}

		// a second tap is what actually does it — say so, in the button
		&.confirming {
			color: var(--color-on-accent);
			background-color: var(--color-danger);
			border-color: var(--color-danger-deep);
		}
	}

	.note.warn {
		color: var(--color-danger);
	}

	.note.empty {
		font-style: italic;
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
