<script lang="ts">
	import CloudPlansPanel from '$lib/features/plans/CloudPlansPanel.svelte';
	import type { Plan } from '$lib/plan.svelte';
	import { settings, TEXT_SIZES, type ThemeChoice } from '$lib/settings.svelte';
	import { savedPlans, MAX_SAVES } from '$lib/features/plans/local-plans.svelte';
	import { byCode, subjectById } from '$lib/data';
	import Modal from './Modal.svelte';
	import FeedbackForm from './FeedbackForm.svelte';
	import PixelIcon from './PixelIcon.svelte';

	let {
		plan,
		onclose,
		ontour,
		onimport
	}: { plan: Plan; onclose: () => void; ontour: () => void; onimport: () => void } = $props();

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

	// ── share ──
	// the plan as plain text, trimester by trimester — something to paste to
	// an advisor or a friend, since saved plans never leave this browser
	let shared = $state(false);
	async function copyPlan() {
		const degree = plan.programmes.map((p) => `${subjectById(p.subject).label} ${p.role}`).join(' + ');
		const lines = [`${degree} · ${plan.fourYear ? '4' : '3'}-year · batch ${plan.batchStartYear}`, ''];
		for (const y of plan.years)
			for (const t of plan.trims) {
				const codes = plan.slotCourses(y, t);
				if (codes.length)
					lines.push(
						`Y${y} T${t} (${plan.slotCredits(y, t)} cr): ${codes.map((c) => `${byCode(c).code} ${byCode(c).title}`).join('; ')}`
					);
			}
		lines.push('', `${plan.totalPlacedCredits} of ${plan.degreeTotal} credits placed`);
		try {
			await navigator.clipboard.writeText(lines.join('\n'));
			shared = true;
			setTimeout(() => (shared = false), 1800);
		} catch {
			// clipboard blocked — nothing else to fall back to here
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
	<CloudPlansPanel {plan} {suggestedName} />
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
		<h3>help</h3>
		<p class="note">a walk around the board — what each part does and where things live.</p>
		<div class="actions">
			<button onclick={ontour}><PixelIcon name="help" size="1.3rem" /> quick tour</button>
		</div>
	</section>

	<section>
		<h3>feedback</h3>
		<FeedbackForm {plan} />
	</section>

	<section>
		<h3>import courses & grades</h3>
		<div class="actions">
			<button onclick={onimport}>import courses & grades</button>
		</div>
		<details class="more">
			<summary>read more</summary>
			<ol>
				<li>
					<a href="/downloads/kcal-canvas-extension.zip" download>download the extension</a> and
					unzip it.
				</li>
				<li>
					chrome / edge: extensions → developer mode → load unpacked → pick the folder. firefox:
					about:debugging → this firefox → load temporary add-on → manifest.json.
				</li>
				<li>
					on Krea Exam, open My Mark List. click the extension, then “Read this page locally” and
					“review in kcal”.
				</li>
				<li>review your terms, grades and catalogue matches before saving. Canvas All Courses is also supported.</li>
			</ol>
		</details>
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
		<p class="note">saved in this browser only. copy it as text to send to an advisor.</p>
		<div class="actions">
			<button onclick={copyPlan}>{shared ? 'copied ✓' : 'copy plan as text'}</button>
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
			border-top: 1px dotted var(--color-border-card);
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
			@include store-button;

			&:disabled {
				opacity: 0.6;
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
				border-top: 1px dotted var(--color-border-card);
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
		@include store-button($armable: true);

		// a second tap is what actually does it — the button says so, and
		// turns red (store-button's armed state)
	}

	.note.warn {
		color: var(--color-danger);
	}

	.more {
		margin-top: 1rem;
		font-size: 1.2rem;
		line-height: 1.45;
		color: var(--color-text-muted);

		summary {
			cursor: pointer;
			width: fit-content;
		}

		ol {
			margin-top: 0.6rem;
			padding-left: 1.8rem;
		}

		li + li {
			margin-top: 0.4rem;
		}

		a {
			color: var(--color-accent);
			text-decoration: underline;
		}
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

	.actions {
		display: flex;
		gap: 0.8rem;
		margin-top: 1rem;

		button {
			display: inline-flex;
			align-items: center;
			gap: 0.6rem;
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
