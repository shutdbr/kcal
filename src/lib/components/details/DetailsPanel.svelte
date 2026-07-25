<script lang="ts">
	import type { Plan } from '$lib/plan.svelte';
	import { byCode, canAudit, hasCode } from '$lib/data';

	let { plan }: { plan: Plan } = $props();

	// only jump to codes that exist in the catalogue; others stay plain text
	function jump(code: string) {
		if (hasCode(code)) plan.selected = byCode(code);
	}
</script>

<header class="col-header">
	<h2>course</h2>
</header>
{#if plan.selected}
	{@const c = plan.selected}
	<div class="details">
		<div class="d-head">
			<span class="d-code">{c.code}</span>
			<span class="d-title">{c.title}</span>
			{#if c.codes.length > 1}
				<span class="d-xlist">cross-listed as {c.codes.filter((x) => x !== c.code).join(' · ')}</span>
			{/if}
		</div>

		<div class="d-meta">
			<div class="d-stat">
				<span class="d-stat-label">credits</span>
				<span class="d-stat-value">{c.credits}</span>
			</div>
			<div class="d-stat">
				<span class="d-stat-label">offered</span>
				<span class="d-stat-value">{c.offered.map((t) => `t${t}`).join(' ') || '—'}</span>
			</div>
			<div class="d-stat">
				<span class="d-stat-label">type</span>
				<span class="d-stat-value">{plan.courseType(c.code)}</span>
			</div>
		</div>

		{#if plan.placedCodes.has(c.code)}
			{#if canAudit(c.code)}
				<label class="d-audit">
					<input
						type="checkbox"
						checked={plan.isAudit(c.code)}
						onchange={() => plan.toggleAudit(c.code)}
					/>
					<span>I'm taking this as an audit</span>
				</label>
			{:else}
				<!-- drop-form rule: audits are 2/4-credit courses, never KCCS/391/490/491 -->
				<p class="d-no-audit">this course can't be taken as an audit</p>
			{/if}
		{/if}

		{#if c.desc}
			<div class="label">about</div>
			<p class="d-desc">{c.desc}</p>
		{/if}

		<!-- profs rotate every year, so this is context, not a promise -->
		{#if c.faculty}
			<p class="d-faculty">recently taught by {c.faculty}</p>
		{/if}

		{#if c.prereqs.length}
			<div class="label">needs first</div>
			<div class="d-chips">
				{#each c.prereqs as p (p)}
					<button class="d-chip" onclick={() => jump(p)}>{hasCode(p) ? plan.gridLabel(p) : p}</button>
				{/each}
			</div>
		{/if}

		{#if c.unlocks.some(hasCode)}
			<div class="label">unlocks</div>
			<div class="d-chips">
				{#each c.unlocks.filter(hasCode) as u (u)}
					<button class="d-chip" onclick={() => jump(u)}>{plan.gridLabel(u)}</button>
				{/each}
			</div>
		{/if}
	</div>
{:else}
	<div class="details">
		<p class="empty">click a course to see its details</p>
	</div>
{/if}

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.col-header {
		@include card-header;
		border-bottom: 1px solid var(--color-border);

		h2 {
			font-size: 1.8rem;
			font-weight: 600;
			color: var(--color-text);
		}
	}

	.details {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		padding: 1.4rem;

		.label {
			@include section-label;
			margin-top: 0.6rem;
		}
	}

	.d-head {
		display: flex;
		flex-direction: column;
		@include card;

		.d-code {
			font-size: 1.8rem;
			font-weight: 700;
		}

		.d-title {
			font-size: 1.4rem;
			line-height: 1.35;
		}

		.d-xlist {
			margin-top: 0.4rem;
			font-size: 1.2rem;
			font-weight: 600;
			color: var(--color-text-muted);
		}
	}

	.d-meta {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.8rem;
	}

	.d-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.8rem 0.4rem;
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 4px;
		@include card-shine;

		.d-stat-label {
			font-size: 1.1rem;
			color: var(--color-text-muted);
			text-transform: uppercase;
			letter-spacing: 0.05em;
		}

		.d-stat-value {
			font-size: 1.5rem;
			font-weight: 700;
		}
	}

	.d-audit {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 1.3rem;
		color: var(--color-text);
		cursor: pointer;

		input {
			@include tick(1.5rem);
		}
	}

	.d-faculty {
		font-size: 1.2rem;
		font-style: italic;
		color: var(--color-text-muted);
	}

	.d-no-audit {
		@include empty-text;
	}

	.d-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.d-chip {
		padding: 0.5rem 1rem;
		font-size: 1.3rem;
		font-weight: 600;
		color: var(--color-text);
		background-color: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 5px;
		text-align: left;
		cursor: pointer;
		@include glossy;
		// keep the lit face, drop only the outer shadow
		box-shadow: var(--shadow-inset);
		&:hover {
			box-shadow: var(--shadow-inset-hover);
		}
	}

	.d-desc {
		font-size: 1.3rem;
		line-height: 1.55;
		padding: 1rem 1.2rem;
		background: var(--color-bg-light);
		border: 1px solid var(--color-border-divider);
		border-radius: 4px;
	}

	.empty {
		@include empty-text;
	}
</style>
