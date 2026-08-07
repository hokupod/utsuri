<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { UtsuriReport } from "../../report-model/src";

  type Change = UtsuriReport["changes"][number];
  type Hunk = UtsuriReport["hunks"][number];
  type DiffLine = Hunk["lines"][number];
  type QueueKind = "action-required" | "needs-confirmation" | "no-issue";
  type DiffRow = { kind: "line"; line: DiffLine; index: number } | { kind: "fold"; count: number };

  const copy = {
    en: {
      queue: "Review queue",
      search: "Filter changes",
      action: "Action required",
      confirm: "Needs confirmation",
      clear: "No issue found",
      unclassified: "Unclassified hunks",
      summary: "Decision summary",
      files: "Files",
      additions: "Additions",
      deletions: "Deletions",
      changes: "Change groups",
      lowSignal: "Low-signal files",
      inventory: "File inventory",
      backQueue: "Back to review queue",
      what: "What changed",
      why: "Why",
      userImpact: "User impact",
      noImpact: "User impact is not established.",
      risk: "Risk",
      gaps: "Not verified",
      verified: "Verified",
      evidence: "Evidence",
      codeDiff: "Code diff",
      unified: "Unified",
      split: "Side by side",
      context: "Show {count} hidden context lines",
      moreEvidence: "More evidence",
      backChange: "Back to focused change",
      visualGap: "Visual verification has not run",
      empty: "No semantic changes",
      loading: "Loading review data…"
    },
    ja: {
      queue: "レビューキュー",
      search: "変更を絞り込む",
      action: "対応が必要",
      confirm: "確認が必要",
      clear: "問題なし",
      unclassified: "未分類のハンク",
      summary: "判断サマリー",
      files: "ファイル",
      additions: "追加",
      deletions: "削除",
      changes: "変更グループ",
      lowSignal: "低シグナル",
      inventory: "ファイル一覧",
      backQueue: "レビューキューへ戻る",
      what: "変更内容",
      why: "変更理由",
      userImpact: "ユーザー影響",
      noImpact: "ユーザー影響は未確定です。",
      risk: "リスク",
      gaps: "未検証",
      verified: "検証済み",
      evidence: "根拠",
      codeDiff: "コード差分",
      unified: "統合表示",
      split: "左右表示",
      context: "非表示のコンテキスト {count} 行を表示",
      moreEvidence: "その他の根拠",
      backChange: "変更グループへ戻る",
      visualGap: "画面の検証は未実施です",
      empty: "意味単位の変更はありません",
      loading: "レビューデータを読み込んでいます…"
    }
  } as const;

  let report: UtsuriReport | null = null;
  let failure = "";
  let locale: keyof typeof copy = "en";
  let query = "";
  let selectedChangeId = "";
  let activeHunkId = "";
  let lastQueueElement = "";
  let diffMode: "unified" | "split" = "unified";
  let expandedContext = new Set<string>();
  let selectedChange: Change | undefined;
  let selectedHunks: Hunk[] = [];
  let selectedEvidence: UtsuriReport["evidence"] = [];
  let filteredChanges: Change[] = [];

  $: t = copy[locale];
  $: selectedChange = report?.changes.find((change) => change.id === selectedChangeId);
  $: selectedHunks = selectedChange
    ? selectedChange.hunkRefs
        .map((reference) => report?.hunks.find((hunk) => hunk.id === reference))
        .filter((hunk): hunk is Hunk => hunk !== undefined)
    : [];
  $: selectedEvidence =
    selectedChange && report
      ? report.evidence.filter(
          (evidence) =>
            selectedChange?.intent.evidenceRefs.includes(evidence.id) ||
            evidence.hunkRefs.some((reference) => selectedChange?.hunkRefs.includes(reference))
        )
      : [];
  $: filteredChanges = report
    ? report.changes.filter((change) =>
        `${change.title} ${change.summary}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())
      )
    : [];

  function domId(prefix: string, value: string): string {
    return `${prefix}-${value.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
  }

  function queueKind(change: Change): QueueKind {
    if (change.risk.level === "critical" || change.risk.level === "high") return "action-required";
    if (change.verification.gaps.length > 0 || change.intent.source === "unknown") {
      return "needs-confirmation";
    }
    return "no-issue";
  }

  function queueLabel(kind: QueueKind): string {
    if (kind === "action-required") return t.action;
    if (kind === "needs-confirmation") return t.confirm;
    return t.clear;
  }

  function queueCount(kind: QueueKind): number {
    return filteredChanges.filter((change) => queueKind(change) === kind).length;
  }

  function updateHash(kind: "change" | "hunk", value: string): void {
    history.pushState(null, "", `#${kind}=${encodeURIComponent(value)}`);
  }

  async function focusElement(id: string): Promise<void> {
    await tick();
    document.getElementById(id)?.focus({ preventScroll: false });
  }

  function selectChange(change: Change, rememberQueue = true): void {
    if (rememberQueue) lastQueueElement = domId("queue", change.id);
    selectedChangeId = change.id;
    activeHunkId = "";
    updateHash("change", change.id);
    void focusElement(domId("change", change.id));
  }

  function openHunk(hunkId: string): void {
    activeHunkId = hunkId;
    updateHash("hunk", hunkId);
    void focusElement(domId("hunk", hunkId));
  }

  function openUnclassified(hunkId: string): void {
    lastQueueElement = domId("queue-hunk", hunkId);
    selectedChangeId = "";
    openHunk(hunkId);
  }

  function backToQueue(): void {
    activeHunkId = "";
    history.pushState(null, "", "#queue");
    void focusElement(lastQueueElement || "queue-heading");
  }

  function backToChange(): void {
    activeHunkId = "";
    if (selectedChange) {
      updateHash("change", selectedChange.id);
      void focusElement(domId("change", selectedChange.id));
    }
  }

  function applyLocation(): void {
    if (!report) return;
    const match = location.hash.match(/^#(change|hunk)=(.+)$/u);
    if (!match) {
      selectedChangeId ||= report.changes[0]?.id ?? "";
      return;
    }
    let reference = "";
    try {
      reference = decodeURIComponent(match[2] ?? "");
    } catch {
      selectedChangeId ||= report.changes[0]?.id ?? "";
      return;
    }
    if (match[1] === "change" && report.changes.some((change) => change.id === reference)) {
      selectedChangeId = reference;
      activeHunkId = "";
      void focusElement(domId("change", reference));
      return;
    }
    if (match[1] === "hunk" && report.hunks.some((hunk) => hunk.id === reference)) {
      selectedChangeId =
        report.changes.find((change) => change.hunkRefs.includes(reference))?.id ?? "";
      activeHunkId = reference;
      void focusElement(domId("hunk", reference));
    }
  }

  async function loadReport(): Promise<void> {
    try {
      const response = await fetch("./report.json", { credentials: "omit" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      report = (await response.json()) as UtsuriReport;
      selectedChangeId = report.changes[0]?.id ?? "";
      document.querySelector("[data-static-fallback]")?.remove();
      applyLocation();
    } catch (error) {
      failure = `Interactive data unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  function contextRows(hunk: Hunk): DiffRow[] {
    if (expandedContext.has(hunk.id)) {
      return hunk.lines.map((line, index) => ({ kind: "line", line, index }));
    }
    const visible = hunk.lines.map(() => false);
    hunk.lines.forEach((line, index) => {
      if (line.kind === "addition" || line.kind === "deletion") {
        for (
          let cursor = Math.max(0, index - 3);
          cursor <= Math.min(hunk.lines.length - 1, index + 3);
          cursor += 1
        ) {
          visible[cursor] = true;
        }
      }
    });
    if (!visible.some(Boolean)) visible.fill(true);
    const rows: DiffRow[] = [];
    for (let index = 0; index < hunk.lines.length;) {
      if (visible[index]) {
        rows.push({ kind: "line", line: hunk.lines[index]!, index });
        index += 1;
      } else {
        let end = index + 1;
        while (end < hunk.lines.length && !visible[end]) end += 1;
        rows.push({ kind: "fold", count: end - index });
        index = end;
      }
    }
    return rows;
  }

  function expandHunk(hunkId: string): void {
    expandedContext = new Set([...expandedContext, hunkId]);
  }

  function counterpart(hunk: Hunk, index: number): DiffLine | undefined {
    const line = hunk.lines[index];
    if (!line || (line.kind !== "addition" && line.kind !== "deletion")) return undefined;
    const opposite = line.kind === "addition" ? "deletion" : "addition";
    for (let distance = 1; distance <= 6; distance += 1) {
      for (const candidateIndex of [index - distance, index + distance]) {
        const candidate = hunk.lines[candidateIndex];
        if (candidate?.kind === opposite) return candidate;
        if (candidate && candidate.kind === "context") break;
      }
    }
    return undefined;
  }

  function segments(hunk: Hunk, index: number): Array<{ text: string; changed: boolean }> {
    const line = hunk.lines[index]!;
    const other = counterpart(hunk, index);
    if (!other)
      return [
        { text: line.content, changed: line.kind === "addition" || line.kind === "deletion" }
      ];
    let prefix = 0;
    while (prefix < line.content.length && line.content[prefix] === other.content[prefix])
      prefix += 1;
    let suffix = 0;
    while (
      suffix < line.content.length - prefix &&
      suffix < other.content.length - prefix &&
      line.content[line.content.length - suffix - 1] ===
        other.content[other.content.length - suffix - 1]
    ) {
      suffix += 1;
    }
    return [
      { text: line.content.slice(0, prefix), changed: false },
      { text: line.content.slice(prefix, suffix ? -suffix : undefined), changed: true },
      { text: suffix ? line.content.slice(-suffix) : "", changed: false }
    ].filter((segment) => segment.text.length > 0);
  }

  onMount(() => {
    locale = navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
    void loadReport();
    window.addEventListener("hashchange", applyLocation);
    return () => window.removeEventListener("hashchange", applyLocation);
  });
</script>

{#if report}
  <div class="report-shell">
    <header class="report-header">
      <a class="wordmark" href="#summary-heading" aria-label="Utsuri review summary">
        <span aria-hidden="true">UT</span>
        <strong>Utsuri</strong>
      </a>
      <div class="report-state" data-status={report.status}>
        <span class="state-mark" aria-hidden="true"></span>
        <span>{report.status}</span>
        <small>{t.visualGap}</small>
      </div>
      <p class="report-id">{report.reportId}</p>
    </header>

    <aside class="review-rail" aria-labelledby="queue-heading">
      <div class="rail-heading">
        <p class="kicker">Focus / 01</p>
        <h2 id="queue-heading" tabindex="-1">{t.queue}</h2>
      </div>
      <label class="queue-search">
        <span>{t.search}</span>
        <input type="search" bind:value={query} autocomplete="off" />
      </label>

      <nav aria-label={t.queue}>
        {#each ["action-required", "needs-confirmation", "no-issue"] as kind (kind)}
          <section class="queue-section" data-queue={kind}>
            <h3>
              <span>{queueLabel(kind as QueueKind)}</span>
              <span class="count">{queueCount(kind as QueueKind)}</span>
            </h3>
            <ol>
              {#each filteredChanges.filter((change) => queueKind(change) === kind) as change, index (change.id)}
                <li>
                  <a
                    id={domId("queue", change.id)}
                    href={`#change=${encodeURIComponent(change.id)}`}
                    aria-current={selectedChangeId === change.id ? "page" : undefined}
                    onclick={(event) => {
                      event.preventDefault();
                      selectChange(change);
                    }}
                  >
                    <span class="queue-index">{String(index + 1).padStart(2, "0")}</span>
                    <span class="queue-copy">
                      <strong>{change.title}</strong>
                      <span class="badges">
                        <span>{change.risk.level}</span>
                        {#if change.verification.gaps.length > 0}<span
                            >{change.verification.gaps.length} gaps</span
                          >{/if}
                      </span>
                    </span>
                  </a>
                </li>
              {/each}
            </ol>
          </section>
        {/each}

        {#if report.unclassifiedHunkRefs.length > 0}
          <section class="queue-section unclassified">
            <h3>
              <span>{t.unclassified}</span><span class="count"
                >{report.unclassifiedHunkRefs.length}</span
              >
            </h3>
            <ol>
              {#each report.unclassifiedHunkRefs as reference, index (reference)}
                {@const hunk = report.hunks.find((entry) => entry.id === reference)}
                {#if hunk}
                  <li>
                    <a
                      id={domId("queue-hunk", reference)}
                      href={`#hunk=${encodeURIComponent(reference)}`}
                      onclick={(event) => {
                        event.preventDefault();
                        openUnclassified(reference);
                      }}
                    >
                      <span class="queue-index">U{index + 1}</span>
                      <span class="queue-copy"
                        ><strong>{hunk.path}</strong><span
                          >@@ {hunk.oldStart} → {hunk.newStart}</span
                        ></span
                      >
                    </a>
                  </li>
                {/if}
              {/each}
            </ol>
          </section>
        {/if}
      </nav>
    </aside>

    <main id="main-content">
      <section aria-labelledby="summary-heading" class="decision-summary">
        <div>
          <p class="kicker">Overview / {report.status}</p>
          <h1 id="summary-heading">{t.summary}</h1>
          <p class="decision-statement">{report.summary.statement}</p>
        </div>
        <dl class="metrics">
          <div>
            <dt>{t.files}</dt>
            <dd>{report.summary.filesChanged}</dd>
          </div>
          <div>
            <dt>{t.additions}</dt>
            <dd class="positive">+{report.summary.additions}</dd>
          </div>
          <div>
            <dt>{t.deletions}</dt>
            <dd class="negative">−{report.summary.deletions}</dd>
          </div>
          <div>
            <dt>{t.changes}</dt>
            <dd>{report.changes.length}</dd>
          </div>
          <div>
            <dt>{t.lowSignal}</dt>
            <dd>{report.files.filter((file) => file.lowSignal).length}</dd>
          </div>
        </dl>
        <details class="file-inventory">
          <summary>{t.inventory}</summary>
          <ul>
            {#each report.files as file (file.id)}
              <li>
                <span class="file-status">{file.status}</span>
                <code
                  >{file.oldPath && file.newPath && file.oldPath !== file.newPath
                    ? `${file.oldPath} → ${file.newPath}`
                    : (file.newPath ?? file.oldPath)}</code
                >
                <span
                  >{file.binary
                    ? "binary"
                    : `+${file.additions ?? 0} / −${file.deletions ?? 0}`}</span
                >
              </li>
            {/each}
          </ul>
        </details>
      </section>

      {#if selectedChange}
        <article
          id={domId("change", selectedChange.id)}
          class="focused-change"
          tabindex="-1"
          aria-labelledby={domId("title", selectedChange.id)}
        >
          <button class="back-link" type="button" onclick={backToQueue}>← {t.backQueue}</button>
          <header class="change-header">
            <div>
              <p class="kicker">Focused change / {selectedChange.kind}</p>
              <h2 id={domId("title", selectedChange.id)}>{selectedChange.title}</h2>
            </div>
            <div class="change-badges" aria-label="Change status">
              <span data-queue={queueKind(selectedChange)}
                >{queueLabel(queueKind(selectedChange))}</span
              >
              <span>{selectedChange.risk.level} risk</span>
              <span>{selectedChange.intent.source}</span>
            </div>
          </header>

          <div class="explanation-grid">
            <section>
              <h3>{t.what}</h3>
              <p>{selectedChange.summary}</p>
              <p class="technical">{selectedChange.implementation}</p>
            </section>
            <section>
              <h3>{t.why}</h3>
              <p>{selectedChange.intent.text || "Intent unknown"}</p>
            </section>
            <section>
              <h3>{t.userImpact}</h3>
              {#if selectedChange.userImpact.length > 0}<ul>
                  {#each selectedChange.userImpact as item, index (index)}<li>{item}</li>{/each}
                </ul>{:else}<p>{t.noImpact}</p>{/if}
            </section>
            <section class="risk-block">
              <h3>{t.risk}</h3>
              <ul>
                {#each selectedChange.risk.reasons as reason, index (index)}<li>{reason}</li>{/each}
              </ul>
            </section>
            <section class="gap-block">
              <h3>{t.gaps}</h3>
              <ul>
                {#each selectedChange.verification.gaps as gap, index (index)}<li>{gap}</li>{/each}
              </ul>
            </section>
            <section>
              <h3>{t.verified}</h3>
              <ul>
                {#each selectedChange.verification.verified as item, index (index)}<li>
                    {item}
                  </li>{/each}
              </ul>
            </section>
          </div>

          <section class="evidence-section" aria-labelledby="evidence-heading">
            <div class="section-heading">
              <div>
                <p class="kicker">Evidence / {selectedEvidence.length}</p>
                <h3 id="evidence-heading">{t.evidence}</h3>
              </div>
            </div>
            <ul class="evidence-list">
              {#each selectedEvidence.slice(0, 3) as evidence (evidence.id)}
                <li>
                  <span>{evidence.type}</span><strong>{evidence.path}</strong>
                  <p>{evidence.summary}</p>
                </li>
              {/each}
            </ul>
            {#if selectedEvidence.length > 3}
              <details class="more-evidence">
                <summary>{t.moreEvidence} ({selectedEvidence.length - 3})</summary>
                <ul>
                  {#each selectedEvidence.slice(3) as evidence (evidence.id)}<li>
                      <strong>{evidence.path}</strong> — {evidence.summary}
                    </li>{/each}
                </ul>
              </details>
            {/if}
          </section>

          <section class="diff-section" aria-labelledby="diff-heading">
            <div class="section-heading">
              <div>
                <p class="kicker">Structured patch / {selectedHunks.length}</p>
                <h3 id="diff-heading">{t.codeDiff}</h3>
              </div>
              <div class="segmented-control" aria-label="Diff layout">
                <button
                  type="button"
                  aria-pressed={diffMode === "unified"}
                  onclick={() => (diffMode = "unified")}>{t.unified}</button
                >
                <button
                  type="button"
                  aria-pressed={diffMode === "split"}
                  onclick={() => (diffMode = "split")}>{t.split}</button
                >
              </div>
            </div>

            {#each selectedHunks as hunk (hunk.id)}
              <section
                class:active-hunk={activeHunkId === hunk.id}
                class="hunk"
                id={domId("hunk", hunk.id)}
                tabindex="-1"
                aria-labelledby={domId("hunk-title", hunk.id)}
              >
                <header>
                  <div>
                    <p>{hunk.path}</p>
                    <h4 id={domId("hunk-title", hunk.id)}>
                      @@ −{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@ {hunk.heading}
                    </h4>
                  </div>
                  <button
                    type="button"
                    class="anchor-button"
                    aria-label={`Link to hunk in ${hunk.path}`}
                    onclick={() => openHunk(hunk.id)}>#</button
                  >
                </header>
                <div
                  class:split-diff={diffMode === "split"}
                  class="diff-table"
                  role="table"
                  aria-label={`Diff for ${hunk.path}`}
                >
                  {#each contextRows(hunk) as row, rowIndex (rowIndex)}
                    {#if row.kind === "fold"}
                      <button
                        class="context-fold"
                        type="button"
                        onclick={() => expandHunk(hunk.id)}
                      >
                        {t.context.replace("{count}", String(row.count))}
                      </button>
                    {:else if diffMode === "unified"}
                      <div class={`diff-line ${row.line.kind}`} role="row">
                        <span
                          class="line-number"
                          aria-label={`old line ${row.line.oldLine ?? "none"}`}
                          >{row.line.oldLine ?? ""}</span
                        >
                        <span
                          class="line-number"
                          aria-label={`new line ${row.line.newLine ?? "none"}`}
                          >{row.line.newLine ?? ""}</span
                        >
                        <span class="line-sign" aria-hidden="true"
                          >{row.line.kind === "addition"
                            ? "+"
                            : row.line.kind === "deletion"
                              ? "−"
                              : " "}</span
                        >
                        <code
                          >{#each segments(hunk, row.index) as segment, segmentIndex (segmentIndex)}<span
                              class:word-change={segment.changed}>{segment.text}</span
                            >{/each}</code
                        >
                      </div>
                    {:else}
                      <div class="split-row" role="row">
                        <div
                          class:empty-side={row.line.kind === "addition"}
                          class={`diff-line ${row.line.kind === "addition" ? "empty" : row.line.kind}`}
                        >
                          <span class="line-number">{row.line.oldLine ?? ""}</span>
                          <span class="line-sign" aria-hidden="true"
                            >{row.line.kind === "deletion" ? "−" : " "}</span
                          >
                          {#if row.line.kind !== "addition"}<code
                              >{#each segments(hunk, row.index) as segment, segmentIndex (segmentIndex)}<span
                                  class:word-change={segment.changed}>{segment.text}</span
                                >{/each}</code
                            >{/if}
                        </div>
                        <div
                          class:empty-side={row.line.kind === "deletion"}
                          class={`diff-line ${row.line.kind === "deletion" ? "empty" : row.line.kind}`}
                        >
                          <span class="line-number">{row.line.newLine ?? ""}</span>
                          <span class="line-sign" aria-hidden="true"
                            >{row.line.kind === "addition" ? "+" : " "}</span
                          >
                          {#if row.line.kind !== "deletion"}<code
                              >{#each segments(hunk, row.index) as segment, segmentIndex (segmentIndex)}<span
                                  class:word-change={segment.changed}>{segment.text}</span
                                >{/each}</code
                            >{/if}
                        </div>
                      </div>
                    {/if}
                  {/each}
                </div>
                {#if activeHunkId === hunk.id}<button
                    class="back-link hunk-back"
                    type="button"
                    onclick={backToChange}>← {t.backChange}</button
                  >{/if}
              </section>
            {/each}
          </section>
        </article>
      {:else if activeHunkId}
        {@const hunk = report.hunks.find((entry) => entry.id === activeHunkId)}
        {#if hunk}
          <section class="focused-change unclassified-focus">
            <button class="back-link" type="button" onclick={backToQueue}>← {t.backQueue}</button>
            <p class="kicker">{t.unclassified}</p>
            <h2>{hunk.path}</h2>
            <section class="hunk active-hunk" id={domId("hunk", hunk.id)} tabindex="-1">
              <header>
                <h3>@@ −{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@</h3>
              </header>
              <div class="diff-table">
                {#each contextRows(hunk) as row, rowIndex (rowIndex)}
                  {#if row.kind === "fold"}<button
                      class="context-fold"
                      type="button"
                      onclick={() => expandHunk(hunk.id)}
                      >{t.context.replace("{count}", String(row.count))}</button
                    >
                  {:else}<div class={`diff-line ${row.line.kind}`}>
                      <span class="line-number">{row.line.oldLine ?? ""}</span><span
                        class="line-number">{row.line.newLine ?? ""}</span
                      ><span class="line-sign"
                        >{row.line.kind === "addition"
                          ? "+"
                          : row.line.kind === "deletion"
                            ? "−"
                            : " "}</span
                      ><code>{row.line.content}</code>
                    </div>{/if}
                {/each}
              </div>
            </section>
          </section>
        {/if}
      {:else}
        <section class="focused-change empty-focus"><h2>{t.empty}</h2></section>
      {/if}
    </main>
  </div>
{:else}
  <p class="loading" role={failure ? "alert" : "status"} aria-live="polite">
    {failure || copy.en.loading}
  </p>
{/if}
