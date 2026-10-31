<script lang="ts">
  import type { Plan } from "$lib/plan.svelte";
  import type { Course } from "$lib/types";
  import { facultyOf, isCore, taughtBy, termLabel } from "$lib/data";
  import { reducedMotion } from "$lib/transitions";
  import { slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  let { plan, course: c }: { plan: Plan; course: Course } = $props();
  let profs = $derived(facultyOf(c.code));
  // "01-Jan-19" → "2019"
  const joinedYear = (date?: string) => {
    const yy = date?.match(/(\d{2})$/)?.[1];
    return yy ? `20${yy}` : "";
  };

  // lecturers whose "more info" is unfolded — kept while moving between
  // courses, so someone you opened stays open
  let openMore = $state<string[]>([]);
</script>

<!-- profs rotate every year, so this is context, not a promise — but
		     who they are and when to find them is what a student asks next -->
{#if !isCore(c.code) && profs.length}
  <div class="label">recently taught by</div>
  <div class="d-profs">
    {#each profs as p, pi (p.id)}
      {@const terms = taughtBy(p)}
      <div class="d-prof">
        {#if p.image_url}
          <img
            class="d-photo"
            src={p.image_url}
            alt=""
            loading="lazy"
            referrerpolicy="no-referrer"
          />
        {:else}
          <span class="d-photo d-initials" aria-hidden="true"
            >{p.name
              .split(" ")
              .map((w) => w[0])
              .slice(0, 2)
              .join("")}</span
          >
        {/if}
        <div class="d-prof-text">
          <div class="d-prof-heading">
            <strong>{p.name}</strong>
            {#if p.position}<span class="d-muted"
                >{p.position}{#if joinedYear(p.date_of_joining)}
                  · at Krea since {joinedYear(p.date_of_joining)}{/if}</span
              >{/if}
          </div>
          <!-- office hours, how to reach them and what they've taught lately
					     wait behind one fold: the card itself stays a name and a role -->
          {#if p.office_hours || p.email || p.url || terms.length}
            {@const moreOpen = openMore.includes(p.id)}
            <div class="d-taught" class:open={moreOpen}>
              <button
                class="d-taught-head"
                aria-expanded={moreOpen}
                aria-controls="d-more-{pi}"
                onclick={() =>
                  (openMore = moreOpen
                    ? openMore.filter((id) => id !== p.id)
                    : [...openMore, p.id])}
              >
                <span>{moreOpen ? "Hide details" : "Contact & teaching"}</span>
                <span class="chev" aria-hidden="true"></span>
              </button>
              {#if moreOpen}
                <div
                  class="d-taught-list"
                  id="d-more-{pi}"
                  transition:slide={{
                    duration: reducedMotion() ? 0 : 210,
                    easing: cubicOut,
                  }}
                >
                  {#if p.office_hours}<div class="d-office">
                      <span class="d-eyebrow">Office hours</span>
                      <p>{p.office_hours}</p>
                    </div>{/if}
                  {#if p.email || p.url}
                    <span class="d-prof-links">
                      {#if p.email}<a href="mailto:{p.email}">{p.email}</a>{/if}
                      {#if p.url}<a href={p.url} target="_blank" rel="noopener"
                          >Faculty profile ↗</a
                        >{/if}
                    </span>
                  {/if}
                  <!-- what they've taught lately, term by term (as kreabot
									     lists it) — each another course to jump to -->
                  {#if terms.length}<div class="d-eyebrow d-history-label">
                      Recent teaching
                    </div>{/if}
                  {#each terms as t (t.term)}
                    <div class="d-term-group">
                      <span class="d-term">{termLabel(t.term)}</span>
                      <ul>
                        {#each t.codes as code (code)}
                          <li>
                            {#if code === c.code}
                              <span class="d-this"
                                >{plan.courseLabel(code)}</span
                              >
                            {:else}
                              <button
                                class="d-taught-course"
                                onclick={() => plan.revealCourse(code)}
                                >{plan.courseLabel(code)}</button
                              >
                            {/if}
                          </li>
                        {/each}
                      </ul>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{:else if !isCore(c.code) && c.faculty}
  <p class="d-faculty">recently taught by {c.faculty}</p>
{/if}

<style lang="scss">
  @use "$lib/styles/mixins" as *;

  .d-profs {
    display: grid;
    gap: 1rem;
  }
  .d-prof {
    display: grid;
    grid-template-columns: 4.4rem minmax(0, 1fr);
    column-gap: 1.2rem;
    padding: 1.4rem;
    font-size: var(--text-body);
    line-height: 1.5;
    background: var(--color-bg-light);
    border: 1px solid var(--color-border-card);
    border-radius: 10px;
  }
  .d-photo {
    width: 4.4rem;
    height: 4.4rem;
    object-fit: cover;
    border-radius: 50%;
    border: 1px solid var(--color-border-divider);
    background: var(--color-subtle);
  }
  .d-initials {
    display: grid;
    place-items: center;
    font-weight: 700;
    color: var(--color-text-muted);
  }
  .d-prof-text {
    display: contents;
  }
  .d-prof-heading {
    display: grid;
    align-content: center;
    gap: 0.3rem;
    min-width: 0;
  }
  .d-prof-heading strong {
    font-size: 1.4rem;
    font-weight: 650;
    line-height: 1.35;
  }
  .d-muted {
    color: var(--color-text-muted);
    font-size: 1.2rem;
  }
  .d-taught {
    grid-column: 1 / -1;
    margin-top: 1.2rem;
    border-top: 1px solid var(--color-border-divider);
  }
  .d-taught-head {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    width: 100%;
    min-height: 3.8rem;
    padding: 0.8rem 0 0;
    font: inherit;
    font-size: 1.2rem;
    font-weight: 550;
    text-align: left;
    color: var(--color-text-muted);
    background: none;
    border: 0;
    cursor: pointer;
    &:hover {
      color: var(--color-accent);
    }
    .chev {
      @include fold-chevron;
      margin: 0 0.4rem 0.3rem auto;
    }
  }
  .d-taught-list {
    display: grid;
    gap: 1.2rem;
    padding-top: 1.2rem;
  }
  .d-office {
    display: grid;
    gap: 0.4rem;
    padding: 1rem 1.2rem;
    background: var(--color-hover);
    border-radius: 6px;
  }
  .d-office p {
    margin: 0;
  }
  .d-eyebrow {
    font-size: 1.05rem;
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }
  .d-history-label {
    margin-top: 0.4rem;
    padding-top: 1.2rem;
    border-top: 1px solid var(--color-border-divider);
  }
  .d-term-group {
    display: grid;
    grid-template-columns: 5.4rem minmax(0, 1fr);
    gap: 0.8rem;
    align-items: start;
  }
  .d-term {
    padding-top: 0.3rem;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
  }
  ul {
    display: grid;
    gap: 0.7rem;
    margin: 0;
    padding: 0 0 0 1rem;
    border-left: 1px solid var(--color-border-divider);
    list-style: none;
  }
  .d-this {
    display: block;
    font-weight: 650;
  }
  .d-taught-course {
    display: block;
    padding: 0;
    font: inherit;
    line-height: inherit;
    text-align: left;
    color: var(--color-text);
    background: none;
    border: 0;
    cursor: pointer;
  }
  .d-taught-course:hover {
    color: var(--color-accent);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
  .d-prof-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
  }
  .d-prof-links a {
    max-width: 100%;
    overflow-wrap: anywhere;
    display: inline-flex;
    align-items: center;
    min-height: 3.2rem;
    padding: 0.5rem 1rem;
    color: var(--color-accent);
    font-size: 1.2rem;
    font-weight: 550;
    text-decoration: none;
    border: 1px solid var(--color-border-card);
    border-radius: 5px;
  }
  .d-prof-links a:hover {
    background: var(--color-hover-medium);
  }
  button:focus-visible,
  a:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 3px;
  }
  .d-faculty {
    font-size: 1.2rem;
    font-style: italic;
    color: var(--color-text-muted);
  }
  .label {
    @include section-label;
    margin-top: 0.6rem;
  }
  @include touch {
    .d-taught-head,
    .d-prof-links a {
      max-width: 100%;
      overflow-wrap: anywhere;
      min-height: 4.4rem;
    }
    .d-taught-course {
      padding: 0.3rem 0;
    }
  }
  @include mobile {
    .d-prof {
      font-size: 1.4rem;
    }
    .d-prof-heading strong {
      font-size: 1.5rem;
    }
    .d-muted {
      font-size: 1.3rem;
    }
  }
</style>
