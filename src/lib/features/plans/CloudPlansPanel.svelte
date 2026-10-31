<script lang="ts">
	import { untrack } from 'svelte';
	import { account } from '$lib/features/auth/account.svelte';
	import { supabaseConfigured } from '$lib/infrastructure/supabase/client';
	import type { Plan } from '$lib/plan.svelte';
	import { CloudPlans } from './cloud-plans.svelte';
	import { PLAN_NAME_LIMIT } from './document';
	import type { CloudPlan } from './repository';

	let { plan, suggestedName }: { plan: Plan; suggestedName: string } = $props();
	const cloud = new CloudPlans();
	let name = $state('');
	let confirmation = $state<{ action: 'load' | 'update' | 'delete'; plan: CloudPlan } | null>(null);
	$effect(() => {
		const userId = account.user?.id ?? null;
		confirmation = null;
		name = '';
		untrack(() => cloud.connect(userId));
		return () => untrack(() => cloud.connect(null));
	});

	function confirm() {
		if (!confirmation) return;
		const { action, plan: saved } = confirmation;
		confirmation = null;
		if (action === 'load') void cloud.load(saved, (snapshot) => plan.restore(snapshot));
		if (action === 'update') void cloud.update(saved, plan.snapshot());
		if (action === 'delete') void cloud.remove(saved);
	}
</script>

<section aria-label="Cloud plans">
	<h3>account & cloud plans</h3>
	{#if !supabaseConfigured}
		<p>Cloud saves are not connected yet. Your board and saved copies stay in this browser.</p>
	{:else if !account.ready}
		<p role="status">Restoring your account…</p>
	{:else if !account.user}
		<p>Sign in to keep private copies of your plans and open them on another device.</p>
		<button disabled={account.busy} onclick={() => account.signIn()}>Sign in with Google</button>
	{:else}
		<div class="actions">
			<p>{account.user.email || 'Signed in'}</p>
			<button disabled={account.busy || cloud.busy} onclick={() => account.signOut()}>Sign out</button>
		</div>
		<p>Your board autosaves in this browser. Save or update a cloud copy when you want it available on other devices. Cloud copies include grades and are visible only to you.</p>
		<form onsubmit={(event) => { event.preventDefault(); void cloud.save(name.trim() || suggestedName, plan.snapshot()); }}>
			<label for="cloud-plan-name">Plan name</label>
			<div class="actions">
				<input id="cloud-plan-name" bind:value={name} placeholder={suggestedName} maxlength={PLAN_NAME_LIMIT} />
				<button disabled={cloud.busy || account.busy}>Save to account</button>
			</div>
		</form>
		<div class="actions"><h4>your cloud copies</h4><button disabled={cloud.busy} onclick={() => { confirmation = null; void cloud.refresh(); }}>Refresh</button></div>
		{#if cloud.busy}<p role="status">Working…</p>{/if}
		{#if cloud.error}<p role="alert">{cloud.error}</p>{/if}
		{#if cloud.notice}<p role="status">{cloud.notice}</p>{/if}
		{#if confirmation}
			<div class="confirmation">
				<p>{confirmation.action === 'load' ? 'Replace your current board with' : confirmation.action === 'update' ? 'Replace this cloud copy with your current board:' : 'Permanently delete'} “{confirmation.plan.name}”?</p>
				<div class="actions"><button disabled={cloud.busy} onclick={confirm}>Confirm {confirmation.action}</button><button onclick={() => confirmation = null}>Cancel</button></div>
			</div>
		{/if}
		<ul>
			{#each cloud.items as saved (saved.id)}
				<li>
					<strong>{saved.name}</strong>
					<small>Updated {new Date(saved.updated_at).toLocaleString()}</small>
					<div class="actions">
						<button disabled={cloud.busy} onclick={() => confirmation = { action: 'load', plan: saved }}>Load</button>
						<button disabled={cloud.busy} onclick={() => confirmation = { action: 'update', plan: saved }}>Update from board</button>
						<button disabled={cloud.busy} onclick={() => confirmation = { action: 'delete', plan: saved }}>Delete</button>
					</div>
				</li>
			{/each}
		</ul>
		{#if cloud.loaded && !cloud.items.length}<p>No cloud copies yet.</p>{/if}
		<p>To move an older browser save to your account, load it from saved plans below, then choose “Save to account”.</p>
	{/if}
	{#if account.error}<p role="alert">{account.error}</p>{/if}
</section>

<style lang="scss">
	section { display: grid; gap: 1rem; padding-bottom: 1.6rem; margin-bottom: 1.6rem; border-bottom: 1px dotted var(--color-border-card); font-size: 1.35rem; line-height: 1.5; }
	h3 { font-size: 1.5rem; }
	p, small { color: var(--color-text-muted); overflow-wrap: anywhere; }
	.actions { display: flex; flex-wrap: wrap; align-items: center; gap: .8rem; }
	form, li { display: grid; gap: .6rem; }
	input { flex: 1; min-width: 0; width: 100%; }
	input, button { padding: .8rem 1rem; font: inherit; color: var(--color-text); background: var(--color-bg-board-page); border: 1px solid var(--color-border-card); border-radius: 4px; }
	button { cursor: pointer; }
	button:disabled { opacity: .5; cursor: default; }
	ul { display: grid; gap: 1.2rem; list-style: none; padding: 0; }
	li { border-top: 1px solid var(--color-border-card); padding-top: 1rem; overflow-wrap: anywhere; }
	.confirmation { padding: 1rem; border: 1px solid var(--color-accent); border-radius: 4px; }
	[role='alert'] { color: var(--color-text); }
</style>
