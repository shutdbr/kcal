<script lang="ts">
	import { onMount } from 'svelte';
	import { account } from '$lib/features/auth/account.svelte';
	import { supabaseConfigured as reviewsConfigured } from '$lib/infrastructure/supabase/client';
	import { canReview, listReviews, saveReview, deleteReview } from '$lib/features/reviews/repository';
	import { DIFFICULTY_LABELS, summarizeReviews, validateReview, type CourseReview } from '$lib/features/reviews/model';

	let { code }: { code: string } = $props();
	let reviews = $state<CourseReview[]>([]);
	let loaded = $state(false);
	let eligible = $state(false);
	let accessError = $state('');
	let error = $state('');
	let notice = $state('');
	let busy = $state(false);
	let editing = $state(false);
	let confirmingDelete = $state(false);
	let difficulty = $state(0);
	let comment = $state('');
	let displayName = $state('');
	let page = $state(1);
	let alive = true;
	let request = 0;
	const summary = $derived(summarizeReviews(reviews));
	const own = $derived(reviews.find((review) => review.user_id === account.user?.id));
	const visible = $derived(reviews.slice(0, page * 10));

	onMount(() => {
		void account.init();
		if (reviewsConfigured) void load();
		return () => { alive = false; request++; };
	});
	// This component is keyed by canonical course code at its call site.
	$effect(() => { if (!account.user) { editing = false; confirmingDelete = false; } });

	$effect(() => {
		const userId = account.user?.id;
		let current = true;
		eligible = false;
		accessError = '';
		if (userId) void canReview().then((allowed) => {
			if (current) eligible = allowed;
		}).catch(() => {
			if (current) accessError = 'Could not verify review access. Refresh to retry.';
		});
		return () => { current = false; };
	});

	async function load() {
		const sequence = ++request;
		error = '';
		try {
			const result = await listReviews(code);
			if (!alive || sequence !== request) return;
			reviews = result;
			loaded = true;
		} catch {
			if (alive && sequence === request) error = 'Could not load reviews. Please retry.';
		}
	}

	function edit() {
		displayName = own?.display_name || String(account.user?.user_metadata?.given_name || '').slice(0, 60);
		difficulty = own?.difficulty || 0;
		comment = own?.comment || '';
		editing = true;
		confirmingDelete = false;
		notice = '';
	}

	async function save() {
		const user = account.user;
		if (!user || !eligible || busy) return;
		error = validateReview(displayName, Number(difficulty), comment) || '';
		if (error) return;
		busy = true;
		try {
			await saveReview({
				course_code: code, user_id: user.id, display_name: displayName,
				difficulty: Number(difficulty), comment
			});
			if (!alive) return;
			editing = false;
			notice = 'Your review is published.';
			await load();
		} catch { if (alive) error = 'Could not save your review. Check that you are using your Krea Google account, then retry.'; }
		finally { if (alive) busy = false; }
	}

	async function remove() {
		if (!own || !account.user || busy) return;
		busy = true;
		error = '';
		try {
			await deleteReview(code, account.user.id);
			if (!alive) return;
			confirmingDelete = false;
			editing = false;
			notice = 'Your review was deleted.';
			await load();
		} catch { if (alive) error = 'Could not delete your review. Please retry.'; }
		finally { if (alive) busy = false; }
	}
</script>

<section class="reviews" aria-label={`Student reviews of ${code}`}>
	<h3>student reviews</h3>
	{#if !reviewsConfigured}
		<p>Course reviews are coming soon. Sign-in is not available yet.</p>
	{:else}
		{#if loaded}
			{#if summary.average !== null}
				<p class="average"><strong>{summary.average.toFixed(1)}<small> / 5</small></strong> difficulty · {summary.count} review{summary.count === 1 ? '' : 's'}</p>
				<p class="muted">1 = very easy · 5 = very hard</p>
			{:else}<p>No reviews yet. How did you find this course?</p>{/if}
		{:else if !error}<p role="status">Loading reviews…</p>{/if}

		{#if error}<p role="alert">{error} <button disabled={busy} onclick={load}>Retry loading</button></p>{/if}
		{#if accessError}<p role="alert">{accessError}</p>{/if}
		{#if account.error}<p role="alert">{account.error}</p>{/if}
		{#if notice}<p role="status">{notice}</p>{/if}

		{#if account.ready && !account.user}
			<button class="signin" onclick={() => account.signIn(code)}>Sign in with Google to review</button>
			<p class="muted">Use your Krea account. Reviews and your chosen public name are visible to everyone.</p>
		{:else if account.user}
			<div class="account"><span>Signed in</span><button onclick={() => account.signOut()}>Sign out</button></div>
			{#if eligible}
				{#if !editing && loaded}<button onclick={edit}>{own ? 'Edit your review' : 'Write a review'}</button>{/if}
			{:else}<p class="muted">Posting requires an eligible Krea Google account. If this is yours, review access may still be awaiting setup.</p>{/if}
		{/if}

		{#if editing && eligible}
			<form onsubmit={(event) => { event.preventDefault(); void save(); }}>
				<label>Public name<input bind:value={displayName} maxlength="60" required autocomplete="nickname" /></label>
				<label>How difficult was this course?
					<select bind:value={difficulty} required>
						<option value={0} disabled>Choose a rating</option>
						{#each DIFFICULTY_LABELS as label, index}<option value={index + 1}>{index + 1} · {label}</option>{/each}
					</select>
				</label>
				<label>Your experience <span class="muted">(optional)</span>
					<textarea bind:value={comment} rows="4" maxlength="1000" placeholder="How was the workload? What helped you learn?"></textarea>
				</label>
				<p class="muted">{comment.length}/1000 · Share your own experience. Keep it about the course.</p>
				<div class="actions"><button type="submit" disabled={busy}>{busy ? 'Saving…' : own ? 'Update review' : 'Publish review'}</button><button type="button" disabled={busy} onclick={() => (editing = false)}>Cancel</button></div>
			</form>
		{/if}

		{#if own}
			{#if confirmingDelete}
				<p>Delete your review?</p>
				<div class="actions"><button disabled={busy} onclick={remove}>Delete review</button><button disabled={busy} onclick={() => (confirmingDelete = false)}>Keep it</button></div>
			{:else}<button disabled={busy} onclick={() => (confirmingDelete = true)}>Delete your review</button>{/if}
		{/if}

		{#each visible as review (review.user_id)}
			<article>
				<header><strong>{review.display_name}</strong><span>{review.difficulty}/5 · {DIFFICULTY_LABELS[review.difficulty - 1]}</span></header>
				{#if review.comment}<p class="comment">{review.comment}</p>{/if}
				<small>{new Date(review.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}{review.user_id === account.user?.id ? ' · your review' : ''}</small>
			</article>
		{/each}
		{#if reviews.length > visible.length}<button onclick={() => page++}>Show more reviews</button>{/if}
	{/if}
</section>

<style lang="scss">
	.reviews { display: grid; gap: 1rem; margin-top: 1.8rem; padding-top: 1.6rem; border-top: 1px solid var(--color-border); font-size: 1.35rem; line-height: 1.5; }
	h3 { font-size: 1.5rem; font-weight: 650; }
	p { margin: 0; }
	.average strong { font-size: 2.2rem; color: var(--color-text); }
	.average small { font-size: 1.3rem; }
	.muted, small { color: var(--color-text-muted); font-size: 1.2rem; }
	form, label { display: grid; gap: .6rem; }
	form { gap: 1rem; }
	input, select, textarea { width: 100%; min-width: 0; box-sizing: border-box; border: 1px solid var(--color-border); border-radius: 4px; padding: .8rem; font: inherit; color: var(--color-text); background: var(--color-bg-board-page); }
	textarea { resize: vertical; }
	button { justify-self: start; padding: .6rem 1rem; border: 1px solid var(--color-border); border-radius: 4px; font: inherit; color: var(--color-accent); background: var(--color-bg-board-page); cursor: pointer; }
	button:disabled { opacity: .5; cursor: default; }
	.account, .actions { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
	article { border-top: 1px solid var(--color-border); padding-top: 1rem; }
	article header { display: flex; flex-direction: column; gap: .3rem; }
	.comment { white-space: pre-wrap; overflow-wrap: anywhere; margin: .6rem 0; }
</style>
