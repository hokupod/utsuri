<script lang="ts">
  import type { UtsuriReport } from "../../report-model/src";

  let report: UtsuriReport | null = null;
  let failure = "";

  async function loadReport() {
    try {
      const response = await fetch("./report.json", { credentials: "omit" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      report = (await response.json()) as UtsuriReport;
      document.querySelector("[data-static-fallback]")?.remove();
    } catch (error) {
      failure = `Interactive data unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  loadReport();
</script>

{#if report}
  <div class="app-shell">
    <aside aria-label="Review queue">
      <p class="eyebrow">Review queue</p>
      <nav aria-label="Semantic changes">
        {#if report.changes.length === 0}
          <p class="empty-state">No semantic changes</p>
        {:else}
          <ol>
            {#each report.changes as change (change.id)}
              <li><a href={`#${change.id}`}>{change.title}</a></li>
            {/each}
          </ol>
        {/if}
      </nav>
    </aside>

    <main id="main-content" tabindex="-1">
      <section aria-labelledby="summary-heading" class="summary-card">
        <p class="eyebrow">{report.status}</p>
        <h1 id="summary-heading">Utsuri review</h1>
        <p class="lead">{report.summary.statement}</p>
        <dl class="metrics">
          <div>
            <dt>Files</dt>
            <dd>{report.summary.filesChanged}</dd>
          </div>
          <div>
            <dt>Additions</dt>
            <dd>+{report.summary.additions}</dd>
          </div>
          <div>
            <dt>Deletions</dt>
            <dd>−{report.summary.deletions}</dd>
          </div>
          <div>
            <dt>Targets verified</dt>
            <dd>{report.coverage.succeeded}/{report.coverage.planned}</dd>
          </div>
        </dl>
      </section>

      {#if report.diagnostics.incompleteReasons.length > 0}
        <section aria-labelledby="gaps-heading" class="gap-card">
          <h2 id="gaps-heading">Not verified</h2>
          <ul>
            {#each report.diagnostics.incompleteReasons as reason, index (`incomplete-${index}`)}<li
              >
                {reason}
              </li>{/each}
          </ul>
        </section>
      {/if}

      {#each report.changes as change (change.id)}
        <article id={change.id} tabindex="-1">
          <p class="eyebrow">{change.risk.level} risk · {change.kind}</p>
          <h2>{change.title}</h2>
          <p>{change.summary}</p>
          <h3>Why</h3>
          <p>{change.intent.text || "Intent unknown"}</p>
          <h3>Risk</h3>
          <ul>
            {#each change.risk.reasons as reason, index (`risk-${change.id}-${index}`)}<li>
                {reason}
              </li>{/each}
          </ul>
          <h3>Not verified</h3>
          <ul>
            {#each change.verification.gaps as gap, index (`gap-${change.id}-${index}`)}<li>
                {gap}
              </li>{/each}
          </ul>
        </article>
      {/each}
    </main>
  </div>
{:else}
  <p class="loading" role={failure ? "alert" : "status"} aria-live="polite">
    {failure || "Loading review data…"}
  </p>
{/if}
