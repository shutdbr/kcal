<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';

	let { plan }: { plan: Plan } = $props();

	let fileInput: HTMLInputElement;
	let note = $state<string | null>(null);
	let noteTimer: ReturnType<typeof setTimeout> | undefined;

	function say(msg: string) {
		note = msg;
		clearTimeout(noteTimer);
		noteTimer = setTimeout(() => (note = null), 3000);
	}

	// the plan already autosaves to this browser — export is for keeping a
	// copy, sharing it, or moving it to another machine
	function exportPlan() {
		const blob = new Blob([plan.exportJSON()], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `tracey-plan-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
		say('plan downloaded');
	}

	async function importPlan(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = ''; // picking the same file twice should still re-import
		if (!file) return;
		const error = plan.importJSON(await file.text());
		say(error ?? 'plan loaded');
	}
</script>

<div class="export-bar">
	<button class="action" onclick={exportPlan} title="download your plan as a file">
		⤓ export plan
	</button>
	<button class="action" onclick={() => fileInput.click()} title="load a previously exported plan">
		⤒ import
	</button>
	<input
		class="file"
		type="file"
		accept="application/json,.json"
		bind:this={fileInput}
		onchange={importPlan}
	/>
	{#if note}
		<span class="note">{note}</span>
	{/if}
</div>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.export-bar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.8rem;
		margin-top: auto; // pinned to the rail's bottom
		padding: 1.2rem 1.4rem;
		border-top: 1px solid var(--color-border-light);
		background: var(--color-bg-sidebar);
	}

	.action {
		flex: 1;
		padding: 0.8rem 1rem;
		font-size: 1.35rem;
		font-weight: 600;
		color: var(--color-text);
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 3px;
		cursor: pointer;
		white-space: nowrap;
		@include card-shine;

		&:hover {
			background: var(--color-hover-medium);
			@include card-shine-hover;
		}
	}

	.file {
		display: none;
	}

	.note {
		flex-basis: 100%;
		font-size: 1.2rem;
		color: var(--color-text-muted);
		text-align: center;
	}
</style>
