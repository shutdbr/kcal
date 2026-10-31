<script lang="ts">
	// ─────────────────────────────────────────────
	// University rules editor.
	//
	// The drop form's numbers, the per-trimester minimum and caps, how many
	// heavy trimesters and audits a student gets, the tenure ceilings, are
	// what every hint, the credit-rules panel and the grid's colours answer
	// to. They change from year to year, so they are editable here rather than
	// baked into the code. Same storage model as the course edits: saved in
	// this browser, applied on the planner's next load, exported for everyone.
	// ─────────────────────────────────────────────
	import {
		RULE_DEFAULTS,
		RULE_INFO,
		loadRuleEdits,
		resolveRules,
		ruleProblems,
		saveRuleEdits,
		type RuleEdits,
		type RuleKey
	} from '$lib/courseEdits';

	const KEYS = Object.keys(RULE_DEFAULTS) as RuleKey[];
	const GROUPS: { title: string; note: string; keys: RuleKey[] }[] = [
		{
			title: 'each trimester',
			note: 'how many credits one trimester may hold. The grid colours a trimester against these.',
			keys: ['TRIM_MIN', 'TRIM_NORMAL_MAX', 'TRIM_STANDARD_MAX', 'TRIM_HARD_MAX']
		},
		{
			title: 'across the whole degree',
			note: 'limits counted over a student’s entire tenure.',
			keys: ['HEAVY_TRIMS_ALLOWED', 'AUDIT_LIMIT', 'MIN_TOTAL_3YR', 'MIN_TOTAL_4YR', 'MAX_TOTAL_3YR', 'MAX_TOTAL_4YR']
		}
	];

	let edits = $state<RuleEdits>({});
	let dirty = $state(false);
	$effect(() => {
		edits = loadRuleEdits();
	});

	let rules = $derived(resolveRules(edits));
	let problems = $derived(ruleProblems(edits));
	let changed = $derived(KEYS.filter((k) => k in edits).length);

	function set(key: RuleKey, raw: number) {
		const { min, max } = RULE_INFO[key];
		if (!Number.isFinite(raw)) return;
		const v = Math.max(min, Math.min(max, Math.round(raw)));
		const next = { ...edits };
		if (v === RULE_DEFAULTS[key]) delete next[key];
		else next[key] = v;
		edits = next;
		saveRuleEdits(edits);
		dirty = true;
	}

	function resetAll() {
		edits = {};
		saveRuleEdits(edits);
		dirty = true;
	}
</script>

<div class="page">
	<div class="inner">
		<header class="head">
			<div>
				<h1>university rules</h1>
				<p>
					The numbers from the drop-form guidelines. Every hint students see, the credit panel and the
					grid's colours all follow these.
				</p>
			</div>
			<div class="head-acts">
				{#if changed}
					<button class="btn" onclick={resetAll}>reset all {changed} to defaults</button>
				{/if}
				{#if dirty}
					<a class="btn primary" href="/" data-sveltekit-reload>see it in the planner ↗</a>
				{/if}
			</div>
		</header>

		{#if problems.length}
			<div class="alarm" role="alert">
				<strong>these rules contradict each other</strong>
				<ul>
					{#each problems as p (p)}<li>{p}</li>{/each}
				</ul>
				<p>Until they're fixed the planner keeps using the defaults.</p>
			</div>
		{/if}

		{#each GROUPS as group (group.title)}
			<section class="group">
				<h2>{group.title}</h2>
				<p class="g-note">{group.note}</p>
				<div class="rules">
					{#each group.keys as key (key)}
						{@const info = RULE_INFO[key]}
						{@const edited = key in edits}
						<div class="rule" class:edited>
							<div class="r-text">
								<label for="r-{key}">{info.label}</label>
								<p>{info.help}</p>
								{#if edited}
									<p class="was">
										default {RULE_DEFAULTS[key]}
										<button class="link" onclick={() => set(key, RULE_DEFAULTS[key])}>reset</button>
									</p>
								{/if}
							</div>
							<div class="stepper">
								<button
									aria-label="decrease {info.label}"
									disabled={rules[key] <= info.min}
									onclick={() => set(key, rules[key] - 1)}>−</button
								>
								<input
									id="r-{key}"
									type="number"
									min={info.min}
									max={info.max}
									value={rules[key]}
									onchange={(e) => set(key, e.currentTarget.valueAsNumber)}
								/>
								<button
									aria-label="increase {info.label}"
									disabled={rules[key] >= info.max}
									onclick={() => set(key, rules[key] + 1)}>+</button
								>
								<span class="unit">{info.unit}</span>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/each}

		<!-- the per-trimester numbers, drawn: one cell per credit -->
		<section class="group">
			<h2>preview of one trimester</h2>
			<div class="scale" aria-hidden="true">
				{#each { length: 24 } as _, i (i)}
					<span
						class:low={i < rules.TRIM_MIN}
						class:ok={i >= rules.TRIM_MIN && i < rules.TRIM_NORMAL_MAX}
						class:heavy={i >= rules.TRIM_NORMAL_MAX && i < rules.TRIM_HARD_MAX}
						class:over={i >= rules.TRIM_HARD_MAX}>{i + 1}</span
					>
				{/each}
			</div>
			<div class="legend">
				<span><i class="low"></i>under the minimum</span>
				<span><i class="ok"></i>normal load</span>
				<span><i class="heavy"></i>heavy (limited)</span>
				<span><i class="over"></i>over the cap</span>
			</div>
		</section>

		<p class="foot">
			Saved in this browser. Use <b>export</b> on the courses page to publish rule changes together with
			course edits.
		</p>
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/mixins' as *;

	.page {
		height: 100%;
		overflow-y: auto;
		background: var(--color-bg);
	}

	.inner {
		max-width: 86rem;
		margin: 0 auto;
		padding: 2.4rem 2rem 4rem;
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 2rem;

		h1 {
			font-size: 2.4rem;
			font-weight: 700;
			color: var(--color-text);
		}

		p {
			max-width: 52rem;
			margin-top: 0.4rem;
			font-size: 1.35rem;
			line-height: 1.5;
			color: var(--color-text-muted);
		}
	}

	.head-acts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.alarm {
		margin-top: 1.6rem;
		padding: 1.2rem 1.6rem;
		font-size: 1.3rem;
		color: var(--color-text);
		background: var(--color-hint-warn);
		border: 1px solid var(--color-hint-warn-deep);
		border-radius: 8px;

		ul {
			margin: 0.4rem 0 0.4rem 1.8rem;
		}
	}

	.group {
		margin-top: 2.4rem;

		h2 {
			@include section-label;
		}

		.g-note {
			margin: 0.3rem 0 1rem;
			font-size: 1.25rem;
			color: var(--color-text-muted);
		}
	}

	.rules {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}

	.rule {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 2rem;
		padding: 1.4rem 1.8rem;
		background: linear-gradient(to bottom, var(--color-bg-card-start), var(--color-bg-card-end));
		border: 1px solid var(--color-border-card);
		border-left: 4px solid transparent;
		border-radius: 8px;
		@include card-shine;

		&.edited {
			border-left-color: var(--color-accent);
		}

		label {
			font-size: 1.45rem;
			font-weight: 700;
			color: var(--color-text);
		}

		p {
			margin-top: 0.2rem;
			font-size: 1.2rem;
			line-height: 1.5;
			color: var(--color-text-muted);
		}
	}

	.was {
		display: flex;
		gap: 0.8rem;
		font-style: italic;
	}

	.link {
		padding: 0;
		font: inherit;
		font-style: normal;
		font-weight: 700;
		color: var(--color-accent);
		background: none;
		border: 0;
		text-decoration: underline;
		cursor: pointer;
	}

	.stepper {
		display: flex;
		flex: none;
		align-items: center;
		gap: 0.5rem;

		button {
			width: 3.2rem;
			height: 3.2rem;
			font-size: 1.8rem;
			color: var(--color-text);
			background-color: var(--color-bg-light);
			border: 1px solid var(--color-border-card);
			border-radius: 6px;
			cursor: pointer;
			@include glossy;

			&:disabled {
				opacity: 0.4;
				cursor: default;
			}
		}

		input {
			width: 6.4rem;
			padding: 0.5rem;
			font: inherit;
			font-size: 1.8rem;
			font-weight: 700;
			text-align: center;
			color: var(--color-text);
			background: var(--color-bg-light);
			border: 1px solid var(--color-border-card);
			border-radius: 6px;
			appearance: textfield;
			-moz-appearance: textfield;

			&::-webkit-inner-spin-button,
			&::-webkit-outer-spin-button {
				-webkit-appearance: none;
			}
		}

		.unit {
			width: 8rem;
			font-size: 1.2rem;
			color: var(--color-text-muted);
		}
	}

	.scale {
		display: grid;
		grid-template-columns: repeat(24, 1fr);
		gap: 3px;
		margin-top: 1rem;

		span {
			padding: 0.5rem 0;
			font-size: 1rem;
			text-align: center;
			color: var(--color-text);
			border-radius: 3px;
		}
	}

	.low {
		background: var(--color-hint-caution);
	}

	.ok {
		background: var(--color-hint-good);
	}

	.heavy {
		background: var(--color-course-elective);
	}

	.over {
		background: var(--color-hint-warn);
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 1.6rem;
		margin-top: 0.8rem;
		font-size: 1.15rem;
		color: var(--color-text-muted);

		span {
			display: flex;
			align-items: center;
			gap: 0.5rem;
		}

		i {
			width: 1.2rem;
			height: 1.2rem;
			border-radius: 3px;
		}
	}

	.foot {
		margin-top: 3rem;
		font-size: 1.2rem;
		color: var(--color-text-muted);
	}

	.btn {
		padding: 0.6rem 1.3rem;
		font: inherit;
		font-size: 1.25rem;
		color: var(--color-text);
		text-decoration: none;
		background-color: var(--color-bg-light);
		border: 1px solid var(--color-border-card);
		border-radius: 6px;
		cursor: pointer;
		@include glossy;

		&.primary {
			color: var(--color-on-accent);
			background-color: var(--color-accent);
			border-color: var(--color-control-deep);
			@include glossy-accent;
		}
	}

	@include mobile {
		.rule {
			flex-direction: column;
			align-items: flex-start;
		}

		.scale {
			grid-template-columns: repeat(12, 1fr);
		}
	}
</style>
