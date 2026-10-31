<script lang="ts">
	// A programme's credits as one iOS 6 slider track without its knob: the
	// required stretch first, filled in the subject's deep ink, then the
	// elective stretch in its paler tone, with a small triangle over the
	// hand-over point. Notched every 4 credits, one notch per ordinary
	// course, so "two to go" reads at a glance. The fills glide when a
	// target changes (3-year ⇄ 4-year, a new major) instead of the bar
	// being rebuilt.
	import { fade } from 'svelte/transition';
	import { reducedMotion } from '$lib/transitions';

	type Part = { done: number; needed: number };

	let {
		required,
		elective,
		electiveLabel = 'electives',
		hue = undefined
	}: {
		required: Part;
		elective: Part;
		electiveLabel?: string;
		/** the subject's fixed hue, so the bar matches its courses */
		hue?: number;
	} = $props();

	const CELL = 4;
	let total = $derived(required.needed + elective.needed);
	const share = (n: number) => (total > 0 ? (n / total) * 100 : 0);
	// where the required stretch hands over to the elective one
	let split = $derived(share(required.needed));
	let reqFill = $derived(share(Math.min(required.done, required.needed)));
	let elFill = $derived(share(Math.min(elective.done, elective.needed)));
	let cells = $derived(Math.max(1, Math.ceil(total / CELL)));
	let notches = $derived(cells - 1);

	// one figure over the bar: credits counted toward the programme, out of
	// all it needs, the bar itself shows the required/elective split
	let done = $derived(Math.min(required.done, required.needed) + Math.min(elective.done, elective.needed));
	let complete = $derived(total > 0 && done >= total);
	let summary = $derived(
		[
			required.needed > 0 && `required ${required.done} of ${required.needed} credits`,
			elective.needed > 0 && `${electiveLabel} ${elective.done} of ${elective.needed} credits`
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<div class="progress" style:--hue={hue}>
	<div class="p-head" class:complete>
		<span class="p-label">credits done</span>
		<span class="p-num">{#if total === 0}none needed{:else if complete}✓ {total} cr{:else}{done}<em>/</em>{total} cr{/if}</span>
	</div>
	{#if total > 0}
		<div class="p-bar" role="img" aria-label={summary} title={summary}>
			<div class="p-track">
				<!-- the elective stretch is faintly tinted even while empty, so
				     the two parts read apart before anything fills them -->
				<i class="p-zone" style="left: {split}%"></i>
				<i class="p-fill req" style="width: {reqFill}%"></i>
				<i class="p-fill el" style="left: {split}%; width: {elFill}%"></i>
				{#each { length: notches } as _, k (k)}
					<span
						class="p-notch"
						style="left: {(((k + 1) * CELL) / total) * 100}%"
						transition:fade={{ duration: reducedMotion() ? 0 : 200 }}
					></span>
				{/each}
			</div>
			{#if required.needed > 0 && elective.needed > 0}
				<span class="p-split" style="left: {split}%" aria-hidden="true"></span>
			{/if}
		</div>
	{/if}
</div>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	// the subject's own hue, deeper than on a card so it reads on the white
	// track: the dot's ink for required, the required border for electives,
	// required still the darker of the two
	.progress {
		--fill-req: #{subject-tone(ink)};
		// electives: a much lighter tint of the subject, so the bar reads as
		// required (deep) then elective (pale)
		--fill-el: color-mix(in srgb, #{subject-tone(required)} 55%, white);
		margin-top: 0.7rem;
	}

	.p-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.8rem;
		line-height: 1.4;
	}

	.p-label {
		color: var(--color-text-muted);
	}

	.p-num {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--color-text);

		em {
			font-style: normal;
			font-weight: 400;
			color: var(--color-text-muted);
		}
	}

	.complete .p-num {
		color: var(--color-hint-good-deep);
	}

	// room above the track for the hand-over triangle
	.p-bar {
		position: relative;
		margin-top: 0.7rem;
	}

	.p-track {
		position: relative;
		height: 1.1rem;
		@include progress-track;
	}

	.p-zone {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		background: color-mix(in srgb, var(--fill-el) 18%, transparent);
		transition: left 0.5s var(--ease-out);
	}

	.p-fill {
		position: absolute;
		inset: 0 auto 0 0;
		@include progress-fill;
		transition:
			width 0.5s var(--ease-out),
			left 0.5s var(--ease-out),
			background-color 0.3s ease;

		&.req {
			background-color: var(--fill-req);
		}

		&.el {
			background-color: var(--fill-el);
		}
	}

	// an engraved groove where one 4-credit course ends and the next begins:
	// a dark hairline with a lit one beside it, so it reads on the white
	// track and on the fill alike
	.p-notch {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background: linear-gradient(to right, rgba(98, 58, 82, 0.22) 50%, rgba(255, 255, 255, 0.45) 50%);
		transition: left 0.5s var(--ease-out);
	}

	// a small triangle pointing down at the hand-over from required to elective
	.p-split {
		position: absolute;
		top: -0.6rem;
		width: 0.9rem;
		height: 0.5rem;
		background: var(--color-text-muted);
		clip-path: polygon(0 0, 100% 0, 50% 100%);
		transform: translateX(-50%);
		transition: left 0.5s var(--ease-out);
	}
</style>
