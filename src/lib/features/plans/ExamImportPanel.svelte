<script lang="ts">
  import { ALL_COURSES, byCode, isCore } from "$lib/data";
  import type { Plan } from "$lib/plan.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import { untrack } from "svelte";
  import {
    examSlot,
    latestExamChoices,
    matchExamCourse,
    type ExamImport,
  } from "./exam-import";
  import { examRecord } from "./exam-record.svelte";

  let {
    plan,
    data,
    onclose,
    onback,
  }: { plan: Plan; data: ExamImport; onclose: () => void; onback: () => void } =
    $props();
  const catalogue = [...ALL_COURSES]
    .filter((c) => !c.retired)
    .sort((a, b) => a.code.localeCompare(b.code));
  let choices = $state<string[]>([]);
  let replaceGrades = $state(false);
  let notice = $state("");
  let deleteConfirm = $state(false);
  const terms = $derived([...new Set(data.courses.map((row) => row.term))]);
  const latest = $derived(latestExamChoices(data.courses, choices));
  $effect(() => {
    const source = data;
    untrack(() => {
      choices = source.courses.map((row) => {
        const matches = matchExamCourse(row, catalogue);
        return matches.length === 1 ? matches[0] : "";
      });
      notice = "";
    });
  });

  function blocked(index: number, code: string) {
    const row = data.courses[index];
    const { year, trim } = examSlot(row.term);
    if (!plan.years.includes(year))
      return "Outside the years shown on your board.";
    if (byCode(code).credits !== row.credits)
      return "Credits differ from the catalogue; this result stays in your local mark list.";
    if (plan.coreOnly(year, trim) && !isCore(code))
      return "This board slot accepts foundation courses only; this result stays in your local mark list.";
    return "";
  }
  const selected = $derived(
    [...latest].filter(([code, index]) => !blocked(index, code)),
  );

  function saveLocal() {
    if (examRecord.save(data))
      notice =
        "Mark list saved on this device, including every repeated attempt. Nothing was uploaded.";
  }
  function apply() {
    // Persist the original attempts first; never flatten the only copy into board placements.
    if (!examRecord.save(data)) return;
    const added = plan.importCanvasCourses(
      selected.map(([code, index]) => ({
        codes: [code],
        ...examSlot(data.courses[index].term),
      })),
    );
    let graded = 0;
    for (const [code, index] of selected) {
      if (
        !Object.values(plan.placements).some((codes) => codes.includes(code)) ||
        plan.isAudit(code)
      )
        continue;
      if (plan.grades[code] && !replaceGrades) continue;
      plan.setGrade(code, data.courses[index].grade);
      graded++;
    }
    if (graded) plan.gradeMode = true;
    notice = `Saved all ${data.courses.length} results locally. Added ${added.length} courses and copied ${graded} grades to your board. Nothing was uploaded.`;
  }
</script>

<Modal title="import Krea Exam results" width="76rem" {onclose}>
  <div class="exam-import">
    <div class="privacy">
      <strong>Local import. No automatic uploads.</strong>
      <p>
        The extension reads the open mark list only when you click. It does not
        read passwords, login tokens or your profile. The full mark list stays
        on this device. Grades copied to your board are uploaded only if you
        later choose “Save to account”.
      </p>
    </div>
    <p>
      {data.courses.length} results across {terms.length} terms. Missing terms stay
      missing, and repeated attempts are kept in the local mark list.
    </p>
    <p>
      Course codes can change between batches. Automatic matches require the
      same title and credits. Check the remaining matches before copying them to
      your board.
    </p>
    {#each terms as term}
      <section aria-label={`Term ${term} results`}>
        <h3>
          Term {term}
          <small
            >Year {examSlot(term).year} · Trimester {examSlot(term).trim}</small
          >
        </h3>
        {#each data.courses as row, index}
          {#if row.term === term}
            {@const code = choices[index]}
            <div class="result-row">
              <div>
                <strong>{row.code} · {row.title}</strong>
                <p>Grade <b>{row.grade}</b> · {row.credits} credits</p>
              </div>
              <label
                >Match in kcal
                <select
                  bind:value={choices[index]}
                  aria-label={`Match for ${row.code} in Term ${term}`}
                  onchange={() => (notice = "")}
                >
                  <option value="">Keep in mark list only</option>
                  {#each catalogue as course (course.code)}<option
                      value={course.code}
                      >{course.code} · {course.title} · {course.credits} cr</option
                    >{/each}
                </select>
                {#if code && latest.get(code) !== index}<small
                    >Earlier attempt retained here. The board uses the latest
                    selected attempt.</small
                  >
                {:else if code && blocked(index, code)}<small
                    >{blocked(index, code)}</small
                  >
                {:else if code && plan.grades[code] && !replaceGrades}<small
                    >Your existing board grade is kept.</small
                  >
                {:else if !code}<small
                    >No confirmed catalogue match. The original result is still
                    saved locally.</small
                  >{/if}
              </label>
            </div>
          {/if}
        {/each}
      </section>
    {/each}
    <p>
      The board holds one placement and grade per course. Existing placements
      stay put; repeated attempts remain in your local mark list. Planner GPA
      estimates may differ from the exam portal’s official calculations.
    </p>
    <label class="check"
      ><input type="checkbox" bind:checked={replaceGrades} /> Replace existing board
      grades with the latest selected results</label
    >
    <div class="actions">
      <button onclick={saveLocal}>Save mark list on this device</button>
      <button disabled={!selected.length} onclick={apply}
        >Copy {selected.length} matched courses & grades to board</button
      >
      <button onclick={onback}>Import another file</button>
    </div>
    {#if examRecord.data}
      <div class="actions">
        {#if deleteConfirm}<button
            onclick={() => {
              const removed = examRecord.clear();
              deleteConfirm = false;
              notice = removed ? "Local mark list removed. Board courses and grades are unchanged." : "";
            }}>Confirm remove local mark list</button
          ><button onclick={() => (deleteConfirm = false)}>Cancel</button>
        {:else}<button onclick={() => (deleteConfirm = true)}
            >Remove saved mark list from this device</button
          >{/if}
      </div>
    {/if}
    {#if notice}<p role="status">{notice}</p>{/if}
    {#if examRecord.error}<p role="alert">{examRecord.error}</p>{/if}
  </div>
</Modal>

<style lang="scss">
  .exam-import {
    display: grid;
    gap: 1.6rem;
    font-size: 1.4rem;
    line-height: 1.5;
  }
  p {
    margin: 0;
  }
  .privacy {
    display: grid;
    gap: 0.6rem;
    padding: 1.2rem;
    border: 1px solid var(--color-border-card);
    border-radius: 6px;
    background: var(--color-hover);
  }
  section {
    border-top: 1px solid var(--color-border-card);
    padding-top: 1.2rem;
  }
  h3 {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: baseline;
    font-size: 1.6rem;
  }
  small {
    display: block;
    font-size: 1.2rem;
    color: var(--color-text-muted);
    font-weight: 400;
  }
  .result-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.6rem;
    padding: 1.2rem 0;
    border-bottom: 1px solid var(--color-border-divider);
  }
  label {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }
  strong {
    overflow-wrap: anywhere;
  }
  select {
    width: 100%;
    min-width: 0;
  }
  select,
  button {
    padding: 0.8rem;
    font: inherit;
    color: var(--color-text);
    background: var(--color-bg-light);
    border: 1px solid var(--color-border-card);
    border-radius: 5px;
  }
  button {
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
  }
  .check {
    display: flex;
    align-items: start;
    gap: 0.8rem;
  }
  .check input {
    margin-top: 0.4rem;
  }
  @media (max-width: 600px) {
    .result-row {
      grid-template-columns: 1fr;
    }
  }
</style>
