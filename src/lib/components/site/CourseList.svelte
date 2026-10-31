<script lang="ts">
	// A list of courses as links to their pages: code, title, credits. A course
	// the catalogue doesn't have yet is named, unlinked.
	type Item = { code: string | null; title: string; credits?: number; shownAs?: string };
	let { courses, empty = 'None.' }: { courses: Item[]; empty?: string } = $props();
</script>

{#if courses.length}
	<ul class="courses">
		{#each courses as c, i (c.code ?? `${c.title}-${i}`)}
			<li>
				{#if c.code}
					<a href="/courses/{c.code}">
						<span class="code">{c.shownAs ?? c.code}</span>
						<span class="title">{c.title}</span>
						{#if c.credits !== undefined}<span class="credits">{c.credits} cr</span>{/if}
					</a>
				{:else}
					<span class="missing">
						<span class="code">–</span>
						<span class="title">{c.title}</span>
						<span class="credits">not in the catalogue yet</span>
					</span>
				{/if}
			</li>
		{/each}
	</ul>
{:else}
	<p class="empty">{empty}</p>
{/if}

<style lang="scss">
	.courses {
		list-style: none;
		display: grid;
		gap: 0.2rem;
	}

	a,
	.missing {
		display: grid;
		grid-template-columns: 9rem 1fr auto;
		gap: 1.2rem;
		align-items: baseline;
		padding: 0.6rem 0.8rem;
		border-radius: 5px;
		color: var(--color-text);
		text-decoration: none;
		font-size: 1.45rem;
	}

	a:hover {
		background: var(--color-hover);

		.title {
			text-decoration: underline;
			text-underline-offset: 0.2em;
		}
	}

	.code {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.01em;
	}

	.credits {
		font-size: 1.2rem;
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.missing {
		color: var(--color-text-muted);
	}

	.empty {
		font-size: 1.4rem;
		color: var(--color-text-muted);
	}
</style>
