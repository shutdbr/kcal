<script lang="ts">
	import { onMount } from 'svelte';
	import { reviewAccount, reviewClient, reviewsConfigured } from '$lib/reviewAccount.svelte';
	import { DIFFICULTY_LABELS, summarizeReviews, validateReview, type CourseReview } from '$lib/reviews';

	let { code }: { code: string } = $props();
	let reviews = $state<CourseReview[]>([]);
	let loaded = $state(false);
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
	const own = $derived(reviews.find((review) => review.user_id === reviewAccount.user?.id));
	const visible = $derived(reviews.slice(0, page * 10));

	onMount(() => {
		void reviewAccount.init();
		if (reviewsConfigured) void load();
		return () => { alive = false; request++; };
	});
	// This component is keyed by canonical course code at its call site.
	$effect(() => { if (!reviewAccount.user) { editing = false; confirmingDelete = false; } });

	async function load() {
		const sequence = ++request;
		error = '';
		try {
			const client = await reviewClient();
			// Page through the API so the average includes every review, not just its first page.
			const all: CourseReview[] = [];
			for (let offset = 0; ; offset += 500) {
				const { data, error: problem } = await client.from('course_reviews')
					.select('course_code,user_id,display_name,difficulty,comment,updated_at')
					.eq('course_code', code).order('user_id').range(offset, offset + 499);
				if (problem) throw problem;
				if (!alive || sequence !== request) return;
				all.push(...(data as CourseReview[]));
				if (data.length < 500) break;
			}
			reviews = all.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
			loaded = true;
		} catch {
			if (alive && sequence === request) error = 'Could not load reviews. Please retry.';
		}
	}

	function edit() {
		displayName = own?.display_name || String(reviewAccount.user?.user_metadata?.given_name || '').slice(0, 60);
		difficulty = own?.difficulty || 0;
		comment = own?.comment || '';
		editing = true;
		confirmingDelete = false;
		notice = '';
	}

	async function save() {
		const user = reviewAccount.user;
		if (!user || !reviewAccount.eligible || busy) return;
		error = validateReview(displayName, Number(difficulty), comment) || '';
		if (error) return;
		busy = true;
		try {
			const client = await reviewClient();
			const { error: problem } = await client.from('course_reviews').upsert({
				course_code: code, user_id: user.id, display_name: displayName.trim(),
				difficulty: Number(difficulty), comment: comment.trim()
			}, { onConflict: 'course_code,user_id' });
			if (problem) throw problem;
			if (!alive) return;
			editing = false;
			notice = 'Your review is published.';
			await load();
		} catch { if (alive) error = 'Could not save your review. Check that you are using your Krea Google account, then retry.'; }
		finally { if (alive) busy = false; }
	}

	async function remove() {
		if (!own || !reviewAccount.user || busy) return;
		busy = true;
		error = '';
		try {
			const client = await reviewClient();
			const { error: problem } = await client.from('course_reviews').delete()
				.eq('course_code', code).eq('user_id', reviewAccount.user.id);
			if (problem) throw problem;
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
		{#if reviewAccount.error}<p role="alert">{reviewAccount.error}</p>{/if}
		{#if notice}<p role="status">{notice}</p>{/if}

		{#if reviewAccount.ready && !reviewAccount.user}
			<button class="signin" onclick={() => reviewAccount.signIn(code)}>Sign in with Google to review</button>
			<p class="muted">Use your Krea account. Reviews and your chosen public name are visible to everyone.</p>
		{:else if reviewAccount.user}
			<div class="account"><span>Signed in</span><button onclick={() => reviewAccount.signOut()}>Sign out</button></div>
			{#if reviewAccount.eligible}
				{#if !editing && loaded}<button onclick={edit}>{own ? 'Edit your review' : 'Write a review'}</button>{/if}
			{:else}<p class="muted">Posting requires an eligible Krea Google account. If this is yours, review access may still be awaiting setup.</p>{/if}
		{/if}

		{#if editing && reviewAccount.eligible}
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
				<small>{new Date(review.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}{review.user_id === reviewAccount.user?.id ? ' · your review' : ''}</small>
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
