<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import type { UtsuriReport } from "../../report-model/src";
  import {
    anchorKey,
    browserCreateComment,
    browserResolveThread,
    browserSetAgentAttention,
    browserSetJudgment,
    browserSetViewed,
    createBrowserReviewStore,
    createBrowserReviewBundle,
    findAnchor,
    importBrowserReviewBundle,
    loadBrowserReviewStore,
    saveBrowserReviewStore,
    type HumanJudgment,
    type ReviewAnchor,
    type ReviewSourceIdentity,
    type ReviewStore,
    type ReviewThreadKind
  } from "../../review-state/src/browser";
  import {
    createBrowserFeedbackPreview,
    type BrowserFeedbackPreview
  } from "../../review-inbox/src/browser";

  type Change = UtsuriReport["changes"][number];
  type Hunk = UtsuriReport["hunks"][number];
  type DiffLine = Hunk["lines"][number];
  type Comparison = UtsuriReport["comparisons"][number];
  type ImageComparison = Comparison["images"][number];
  type Finding = UtsuriReport["findings"][number];
  type QueueKind = "action-required" | "needs-confirmation" | "no-issue";
  type VisualMode = "side-by-side" | "wipe" | "blink" | "pixel-diff" | "after-only";
  type DiffRow = { kind: "line"; line: DiffLine; index: number } | { kind: "fold"; count: number };
  interface InteractiveRequestOptions {
    method?: "GET" | "POST";
    body?: string;
    headers?: Record<string, string>;
  }

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
      measured: "Measured evidence",
      interpretation: "Agent interpretation",
      visualEvidence: "Visual comparison",
      sideBySide: "Side by side",
      wipe: "Wipe",
      blink: "Blink",
      stopBlink: "Stop blink",
      pixelDiff: "Pixel diff",
      afterOnly: "After only",
      imageScope: "Image scope",
      zoom: "Zoom",
      wipePosition: "Wipe position",
      changedRegions: "Changed regions",
      noRegions: "No changed pixel regions",
      findings: "Findings",
      noFindings: "No linked findings",
      coverage: "Visual coverage",
      planned: "Planned targets",
      captured: "Captured targets",
      failed: "Failed targets",
      viewCode: "View linked code",
      viewVisual: "View visual evidence",
      reducedMotion: "Blink unavailable because reduced motion is enabled",
      backChange: "Back to focused change",
      visualGap: "Visual verification has not run",
      reviewWorkspace: "Human review",
      reviewProgress: "Review progress",
      viewed: "Viewed",
      humanJudgment: "Human judgment",
      unreviewed: "Unreviewed",
      reviewed: "Reviewed",
      followUp: "Follow-up",
      blocked: "Blocked",
      comments: "Comments",
      comment: "Comment",
      commentOn: "Comment on",
      commentBody: "Review note",
      saveComment: "Save comment",
      cancel: "Cancel",
      resolve: "Resolve",
      resolved: "Resolved",
      noComments: "No comments for this change",
      localOnly: "Saved locally. Plain comments are never sent to an Agent.",
      askAgent: "Ask the current Agent",
      askAgentHelp: "This only saves the selection. It does not submit or create a conversation.",
      selectedItems: "Items for Agent review",
      reviewItems: "Review items",
      feedbackPreview: "Feedback Batch preview",
      shared: "Shared",
      notShared: "Not shared",
      delivery: "Delivery",
      returnConversation: "Return to current conversation",
      prepareRequest: "Prepare review request",
      copyHandoff: "Copy handoff",
      handoffCopied: "Handoff copied",
      unreadAnswers: "Unread answers",
      exportReview: "Export review",
      importReview: "Import review",
      reanchorImport: "Re-anchor another report",
      stale: "Stale",
      orphaned: "Orphaned",
      reviewUnavailable: "Review state unavailable",
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
      measured: "計測された根拠",
      interpretation: "Agent の解釈",
      visualEvidence: "画面比較",
      sideBySide: "左右比較",
      wipe: "ワイプ",
      blink: "点滅比較",
      stopBlink: "点滅を停止",
      pixelDiff: "ピクセル差分",
      afterOnly: "変更後のみ",
      imageScope: "画像の範囲",
      zoom: "拡大率",
      wipePosition: "ワイプ位置",
      changedRegions: "変更領域",
      noRegions: "変更ピクセル領域はありません",
      findings: "検出事項",
      noFindings: "関連する検出事項はありません",
      coverage: "画面カバレッジ",
      planned: "予定 target",
      captured: "取得済み target",
      failed: "失敗 target",
      viewCode: "関連コードを見る",
      viewVisual: "画面根拠を見る",
      reducedMotion: "視差低減が有効なため点滅比較は利用できません",
      backChange: "変更グループへ戻る",
      visualGap: "画面の検証は未実施です",
      reviewWorkspace: "人によるレビュー",
      reviewProgress: "レビュー進捗",
      viewed: "確認済み",
      humanJudgment: "人の判断",
      unreviewed: "未レビュー",
      reviewed: "レビュー済み",
      followUp: "要フォロー",
      blocked: "ブロック中",
      comments: "コメント",
      comment: "コメント",
      commentOn: "コメント対象",
      commentBody: "レビューメモ",
      saveComment: "コメントを保存",
      cancel: "キャンセル",
      resolve: "解決済みにする",
      resolved: "解決済み",
      noComments: "この変更へのコメントはありません",
      localOnly: "ローカルに保存します。通常コメントを Agent へ送信することはありません。",
      askAgent: "現在の Agent に確認を依頼",
      askAgentHelp: "選択状態だけを保存します。送信や新しい会話の作成は行いません。",
      selectedItems: "Agent 確認対象",
      reviewItems: "確認項目をレビュー",
      feedbackPreview: "Feedback Batch プレビュー",
      shared: "共有する情報",
      notShared: "共有しない情報",
      delivery: "受け渡し",
      returnConversation: "現在の会話へ戻す",
      prepareRequest: "レビュー依頼を準備",
      copyHandoff: "引き継ぎ文をコピー",
      handoffCopied: "引き継ぎ文をコピーしました",
      unreadAnswers: "未読回答",
      exportReview: "レビューを書き出す",
      importReview: "レビューを読み込む",
      reanchorImport: "別レポートへ再アンカーする",
      stale: "古い状態",
      orphaned: "参照先なし",
      reviewUnavailable: "レビュー状態を利用できません",
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
  let visualMode: VisualMode = "side-by-side";
  let selectedComparisonId = "";
  let selectedImageId = "";
  let activeRegionIndex = 0;
  let activeFindingIndex = 0;
  let visualZoom = 100;
  let wipePosition = 50;
  let blinkRunning = false;
  let reducedMotion = false;
  let searchInput: HTMLInputElement;
  let beforePane: HTMLDivElement;
  let afterPane: HTMLDivElement;
  let syncingScroll = false;
  let expandedContext = new Set<string>();
  let selectedChange: Change | undefined;
  let selectedHunks: Hunk[] = [];
  let selectedEvidence: UtsuriReport["evidence"] = [];
  let filteredChanges: Change[] = [];
  let selectedComparisons: Comparison[] = [];
  let activeComparison: Comparison | undefined;
  let activeImage: ImageComparison | undefined;
  let selectedFindings: Finding[] = [];
  let reviewStore: ReviewStore | null = null;
  let reviewSource: ReviewSourceIdentity = { base: null, head: null };
  let reviewFailure = "";
  let reviewNotice = "";
  let reviewReanchor = false;
  let reviewBusy = false;
  let commentAnchor: ReviewAnchor | null = null;
  let commentBody = "";
  let commentKind: ReviewThreadKind = "note";
  let commentAgentAttention = false;
  let commentInput: HTMLTextAreaElement;
  let reviewImportInput: HTMLInputElement;
  let selectedThreads: ReviewStore["threads"] = [];
  let interactiveToken = "";
  let reviewInboxEntries: Array<{ unreadAnswerItemIds: string[] }> = [];
  let feedbackPreview: BrowserFeedbackPreview | null = null;
  let feedbackHandoff = "";
  let feedbackIdempotencyKey = "";
  let feedbackBusy = false;
  let eventAbort: AbortController | null = null;

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
  $: selectedComparisons =
    selectedChange && report
      ? report.comparisons.filter((comparison) =>
          selectedChange?.targetRefs.includes(comparison.targetRef)
        )
      : [];
  $: activeComparison =
    selectedComparisons.find((comparison) => comparison.id === selectedComparisonId) ??
    selectedComparisons[0];
  $: activeImage =
    activeComparison?.images.find((image) => image.id === selectedImageId) ??
    activeComparison?.images[0];
  $: selectedFindings =
    selectedChange && report
      ? report.findings.filter(
          (finding) =>
            selectedChange?.findingRefs.includes(finding.id) ||
            (finding.targetRef ? selectedChange?.targetRefs.includes(finding.targetRef) : false)
        )
      : [];
  $: selectedThreads =
    selectedChange && reviewStore
      ? reviewStore.threads.filter((thread) =>
          threadBelongsToChange(thread.anchor, selectedChange!)
        )
      : [];
  $: activeVisualThreads = selectedThreads.filter(
    (thread) =>
      thread.state !== "resolved" &&
      thread.anchor.type === "visual-region" &&
      Boolean(thread.anchor.region) &&
      Boolean(activeComparison && activeImage) &&
      thread.anchor.ref.startsWith(`${activeComparison!.id}:${activeImage!.id}:`)
  );
  $: selectedAttentionCount =
    reviewStore?.threads.filter((thread) => thread.agentAttention.state === "requested").length ??
    0;
  $: unreadAnswerCount = reviewInboxEntries.reduce(
    (count, entry) => count + entry.unreadAnswerItemIds.length,
    0
  );

  function domId(prefix: string, value: string): string {
    return `${prefix}-${value.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
  }

  function visualPinStyle(anchor: ReviewAnchor): string {
    const region = anchor.region;
    if (!region) return "display:none";
    return `left:${(region.x + region.width / 2) * 100}%;top:${(region.y + region.height / 2) * 100}%`;
  }

  function queueKind(change: Change): QueueKind {
    if (change.risk.level === "critical" || change.risk.level === "high") return "action-required";
    if (change.verification.gaps.length > 0 || change.intent.source === "unknown") {
      return "needs-confirmation";
    }
    return "no-issue";
  }

  function judgmentLabel(value: HumanJudgment): string {
    if (value === "reviewed") return t.reviewed;
    if (value === "follow-up") return t.followUp;
    if (value === "blocked") return t.blocked;
    if (value === "stale") return t.stale;
    return t.unreviewed;
  }

  function judgment(changeId: string): HumanJudgment {
    return reviewStore?.state.judgments[changeId]?.state ?? "unreviewed";
  }

  function currentAnchor(type: ReviewAnchor["type"], ref: string): ReviewAnchor | undefined {
    return reviewStore ? findAnchor(reviewStore.anchorCatalog, type, ref) : undefined;
  }

  function viewed(type: ReviewAnchor["type"], ref: string): boolean {
    const anchor = currentAnchor(type, ref);
    if (!anchor || !reviewStore) return false;
    return reviewStore.state.viewed[anchorKey(anchor)]?.state === "viewed";
  }

  function lineReviewAnchor(hunk: Hunk, index: number): ReviewAnchor | undefined {
    const line = hunk.lines[index];
    if (!line || line.kind === "no-newline") return undefined;
    const side = line.kind === "addition" ? "after" : line.kind === "deletion" ? "before" : "diff";
    const lineNumber = side === "before" ? line.oldLine : (line.newLine ?? line.oldLine);
    return lineNumber
      ? currentAnchor("line-range", `${hunk.id}:${side}:${lineNumber}:${index}`)
      : undefined;
  }

  function threadBelongsToChange(anchor: ReviewAnchor, change: Change): boolean {
    if (anchor.type === "change") return anchor.ref === change.id;
    if (anchor.type === "hunk" || anchor.type === "line-range") {
      return change.hunkRefs.some(
        (reference) => anchor.ref === reference || anchor.ref.startsWith(`${reference}:`)
      );
    }
    if (anchor.type === "visual-target" || anchor.type === "visual-region") {
      return (
        Boolean(anchor.targetRef && change.targetRefs.includes(anchor.targetRef)) ||
        change.targetRefs.includes(anchor.ref)
      );
    }
    if (anchor.type === "finding") return change.findingRefs.includes(anchor.ref);
    if (anchor.type === "verification-gap") return anchor.ref.startsWith(`${change.id}:gap:`);
    return false;
  }

  function captureInteractiveToken(): void {
    const parameters = new URLSearchParams(
      location.hash.startsWith("#") ? location.hash.slice(1) : ""
    );
    const token = parameters.get("token") ?? "";
    if (!token) return;
    if (!/^[A-Za-z0-9_-]{32,128}$/u.test(token)) {
      reviewFailure = "Interactive capability token is invalid";
      history.replaceState(null, "", `${location.pathname}${location.search}`);
      return;
    }
    interactiveToken = token;
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  }

  async function interactiveRequest(
    relative: string,
    init: InteractiveRequestOptions = {}
  ): Promise<any> {
    if (!interactiveToken || !report)
      throw new Error("Interactive review capability is unavailable");
    const response = await fetch(`./api/v1/${relative}`, {
      ...init,
      credentials: "omit",
      headers: {
        authorization: `Bearer ${interactiveToken}`,
        "x-utsuri-report-id": report.reportId,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {})
      }
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value?.error?.message ?? `HTTP ${response.status}`);
    return value;
  }

  function applyInteractiveState(value: {
    state: ReviewStore["state"];
    threads: ReviewStore["threads"];
    inbox?: { entries?: Array<{ unreadAnswerItemIds: string[] }> };
  }): void {
    if (!reviewStore) return;
    reviewStore = {
      ...reviewStore,
      state: structuredClone(value.state),
      threads: structuredClone(value.threads),
      events: reviewStore.events
    };
    reviewInboxEntries = structuredClone(value.inbox?.entries ?? reviewInboxEntries);
  }

  async function refreshInteractiveReview(): Promise<void> {
    const value = await interactiveRequest("review-state");
    applyInteractiveState(value);
  }

  async function interactiveMutation(action: Record<string, unknown>): Promise<void> {
    if (!reviewStore || !report) return;
    const value = await interactiveRequest("review-events", {
      method: "POST",
      body: JSON.stringify({
        schemaVersion: "1.0",
        reportId: report.reportId,
        expectedRevision: reviewStore.state.revision,
        action
      })
    });
    applyInteractiveState(value);
  }

  async function listenForInteractiveEvents(): Promise<void> {
    if (!interactiveToken || !report) return;
    eventAbort?.abort();
    const controller = new AbortController();
    eventAbort = controller;
    try {
      const response = await fetch("./api/v1/events", {
        credentials: "omit",
        headers: {
          authorization: `Bearer ${interactiveToken}`,
          "x-utsuri-report-id": report.reportId
        },
        signal: controller.signal
      });
      if (!response.ok || !response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      while (!controller.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const messages = pending.split("\n\n");
        pending = messages.pop() ?? "";
        if (
          messages.some(
            (message) => message.startsWith("data:") && !message.includes('"type":"ready"')
          )
        ) {
          await refreshInteractiveReview();
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        reviewNotice = error instanceof Error ? error.message : String(error);
      }
    }
  }

  onDestroy(() => eventAbort?.abort());

  async function persistReview(next: ReviewStore): Promise<void> {
    await saveBrowserReviewStore(next, next.state.revision - 1);
    reviewStore = next;
    reviewNotice = "";
  }

  async function updateViewed(
    type: ReviewAnchor["type"],
    ref: string,
    checked: boolean
  ): Promise<void> {
    const anchor = currentAnchor(type, ref);
    if (!reviewStore || !anchor) return;
    reviewBusy = true;
    try {
      if (interactiveToken) {
        await interactiveMutation({
          type: "viewed.changed",
          anchor: { type: anchor.type, ref: anchor.ref, fingerprint: anchor.fingerprint },
          viewState: checked ? "viewed" : "unseen"
        });
      } else {
        await persistReview(
          await browserSetViewed(reviewStore, anchor, checked ? "viewed" : "unseen")
        );
      }
    } catch (error) {
      reviewNotice = error instanceof Error ? error.message : String(error);
    } finally {
      reviewBusy = false;
    }
  }

  async function updateJudgment(changeId: string, value: HumanJudgment): Promise<void> {
    if (!reviewStore || value === "stale") return;
    reviewBusy = true;
    try {
      if (interactiveToken) {
        await interactiveMutation({ type: "judgment.changed", changeId, judgmentState: value });
      } else {
        await persistReview(await browserSetJudgment(reviewStore, changeId, value));
      }
    } catch (error) {
      reviewNotice = error instanceof Error ? error.message : String(error);
    } finally {
      reviewBusy = false;
    }
  }

  async function startComment(anchor: ReviewAnchor | undefined): Promise<void> {
    if (!anchor) return;
    commentAnchor = anchor;
    commentBody = "";
    commentAgentAttention = false;
    await tick();
    commentInput?.focus();
  }

  async function saveComment(): Promise<void> {
    if (!reviewStore || !commentAnchor) return;
    reviewBusy = true;
    try {
      if (interactiveToken) {
        await interactiveMutation({
          type: "thread.created",
          anchor: {
            type: commentAnchor.type,
            ref: commentAnchor.ref,
            fingerprint: commentAnchor.fingerprint
          },
          body: commentBody,
          kind: commentKind,
          requestAgentAttention: commentAgentAttention
        });
      } else {
        await persistReview(
          await browserCreateComment(
            reviewStore,
            commentAnchor,
            commentBody,
            commentKind,
            new Date().toISOString(),
            commentAgentAttention
          )
        );
      }
      commentAnchor = null;
      commentBody = "";
      commentAgentAttention = false;
    } catch (error) {
      reviewNotice = error instanceof Error ? error.message : String(error);
    } finally {
      reviewBusy = false;
    }
  }

  async function resolveComment(threadId: string): Promise<void> {
    if (!reviewStore) return;
    reviewBusy = true;
    try {
      if (interactiveToken) {
        await interactiveMutation({ type: "thread.resolved", threadId });
      } else {
        await persistReview(await browserResolveThread(reviewStore, threadId));
      }
    } catch (error) {
      reviewNotice = error instanceof Error ? error.message : String(error);
    } finally {
      reviewBusy = false;
    }
  }

  async function updateAgentAttention(threadId: string, requested: boolean): Promise<void> {
    if (!reviewStore) return;
    reviewBusy = true;
    try {
      if (interactiveToken) {
        await interactiveMutation({ type: "agent-attention.changed", threadId, requested });
      } else {
        await persistReview(await browserSetAgentAttention(reviewStore, threadId, requested));
      }
      feedbackPreview = null;
      feedbackHandoff = "";
    } catch (error) {
      reviewNotice = error instanceof Error ? error.message : String(error);
    } finally {
      reviewBusy = false;
    }
  }

  async function exportReview(): Promise<void> {
    if (!reviewStore || !report) return;
    reviewBusy = true;
    try {
      const bundle = interactiveToken
        ? await interactiveRequest("review/export", {
            method: "POST",
            body: JSON.stringify({
              schemaVersion: "1.0",
              reportId: report.reportId,
              expectedRevision: reviewStore.state.revision
            })
          })
        : createBrowserReviewBundle(reviewStore, reviewSource);
      downloadJson(`${report?.reportId ?? "utsuri"}-review.json`, bundle);
    } catch (error) {
      reviewNotice = error instanceof Error ? error.message : String(error);
    } finally {
      reviewBusy = false;
    }
  }

  function downloadJson(filename: string, value: unknown): void {
    const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handoffText(batch: { reportId: string; id: string }): string {
    return `Process the pending Utsuri review items.\nReport: ${batch.reportId}\nBatch: ${batch.id}`;
  }

  async function reviewFeedbackItems(): Promise<void> {
    if (!reviewStore || !report) return;
    feedbackBusy = true;
    try {
      if (interactiveToken) {
        const value = await interactiveRequest("feedback-batches/preview", {
          method: "POST",
          body: JSON.stringify({
            schemaVersion: "1.0",
            reportId: report.reportId,
            expectedRevision: reviewStore.state.revision,
            deliveryMode: "return-to-session"
          })
        });
        feedbackPreview = value.preview as BrowserFeedbackPreview;
      } else {
        feedbackPreview = await createBrowserFeedbackPreview(reviewStore);
      }
      feedbackIdempotencyKey = `ui:${feedbackPreview.batch.id}`;
      feedbackHandoff = "";
    } catch (error) {
      reviewNotice = error instanceof Error ? error.message : String(error);
    } finally {
      feedbackBusy = false;
    }
  }

  async function prepareFeedbackRequest(): Promise<void> {
    if (!feedbackPreview || !reviewStore || !report) return;
    feedbackBusy = true;
    try {
      if (interactiveToken) {
        const value = await interactiveRequest("feedback-batches", {
          method: "POST",
          body: JSON.stringify({
            schemaVersion: "1.0",
            reportId: report.reportId,
            expectedRevision: reviewStore.state.revision,
            idempotencyKey: feedbackIdempotencyKey,
            deliveryMode: "return-to-session"
          })
        });
        feedbackPreview = value.preview as BrowserFeedbackPreview;
        applyInteractiveState(value);
      } else {
        downloadJson(`${report.reportId}-${feedbackPreview.batch.id.replace(":", "-")}.json`, {
          schemaVersion: "1.0",
          batch: feedbackPreview.batch,
          contexts: feedbackPreview.contexts,
          preview: {
            shared: feedbackPreview.shared,
            excluded: feedbackPreview.excluded,
            redactionCount: feedbackPreview.redactionCount,
            contextBytes: feedbackPreview.contextBytes,
            destination: feedbackPreview.destination
          }
        });
      }
      feedbackHandoff = handoffText(feedbackPreview.batch);
    } catch (error) {
      reviewNotice = error instanceof Error ? error.message : String(error);
    } finally {
      feedbackBusy = false;
    }
  }

  async function copyFeedbackHandoff(): Promise<void> {
    if (!feedbackHandoff) return;
    try {
      await navigator.clipboard.writeText(feedbackHandoff);
      reviewNotice = t.handoffCopied;
    } catch (error) {
      reviewNotice = error instanceof Error ? error.message : String(error);
    }
  }

  async function importReview(file: File | undefined): Promise<void> {
    if (!reviewStore || !file) return;
    if (interactiveToken) {
      reviewNotice = "Import is available only in static report mode";
      reviewImportInput.value = "";
      return;
    }
    reviewBusy = true;
    try {
      if (file.size > 16 * 1024 * 1024) throw new Error("Review bundle exceeds 16 MiB");
      const imported = await importBrowserReviewBundle(reviewStore, JSON.parse(await file.text()), {
        reanchor: reviewReanchor
      });
      await persistReview(imported.store);
      const counts = imported.reanchored.reduce(
        (value, result) => {
          value[result.disposition] += 1;
          return value;
        },
        { matched: 0, stale: 0, orphaned: 0 }
      );
      reviewNotice = `${counts.matched} matched · ${counts.stale} stale · ${counts.orphaned} orphaned · ${imported.conflicts.length} conflicts`;
    } catch (error) {
      reviewNotice = error instanceof Error ? error.message : String(error);
    } finally {
      reviewImportInput.value = "";
      reviewBusy = false;
    }
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
    selectedComparisonId = "";
    selectedImageId = "";
    activeRegionIndex = 0;
    activeFindingIndex = 0;
    blinkRunning = false;
    updateHash("change", change.id);
    void focusElement(domId("change", change.id));
  }

  function openHunk(hunkId: string): void {
    activeHunkId = hunkId;
    updateHash("hunk", hunkId);
    void focusElement(domId("hunk", hunkId));
  }

  function openVisualEvidence(): void {
    activeHunkId = "";
    void focusElement("visual-evidence-heading");
  }

  function setVisualMode(mode: VisualMode): void {
    if (mode === "blink" && reducedMotion) {
      visualMode = "side-by-side";
      blinkRunning = false;
      return;
    }
    visualMode = mode;
    blinkRunning = mode === "blink" && !reducedMotion;
  }

  function selectComparison(id: string): void {
    selectedComparisonId = id;
    selectedImageId = "";
    activeRegionIndex = 0;
  }

  function selectImage(id: string): void {
    selectedImageId = id;
    activeRegionIndex = 0;
  }

  async function jumpRegion(index: number): Promise<void> {
    activeRegionIndex = index;
    await tick();
    document
      .getElementById(`visual-region-${index}`)
      ?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }

  function syncVisualScroll(source: HTMLDivElement, target: HTMLDivElement): void {
    if (syncingScroll || !source || !target) return;
    syncingScroll = true;
    const verticalRange = source.scrollHeight - source.clientHeight;
    const horizontalRange = source.scrollWidth - source.clientWidth;
    const targetVerticalRange = target.scrollHeight - target.clientHeight;
    const targetHorizontalRange = target.scrollWidth - target.clientWidth;
    target.scrollTop =
      verticalRange > 0 ? (source.scrollTop / verticalRange) * targetVerticalRange : 0;
    target.scrollLeft =
      horizontalRange > 0 ? (source.scrollLeft / horizontalRange) * targetHorizontalRange : 0;
    requestAnimationFrame(() => (syncingScroll = false));
  }

  function coverageSummary(value: UtsuriReport): string {
    const known = value.coverage.knownUsages;
    const base =
      known === null
        ? `${value.coverage.verifiedUsages} verified; known usage count unavailable`
        : `${value.coverage.verifiedUsages} of ${known} known usages verified`;
    return value.coverage.unknownPossible ? `${base}; additional usage may exist` : base;
  }

  function handleShortcut(event: KeyboardEvent): void {
    const element = event.target as HTMLElement | null;
    if (
      element?.isContentEditable ||
      new Set(["INPUT", "TEXTAREA", "SELECT"]).has(element?.tagName ?? "") ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    ) {
      return;
    }
    if (event.key === "/") {
      event.preventDefault();
      searchInput?.focus();
      return;
    }
    if (event.key === "1") setVisualMode("side-by-side");
    else if (event.key === "2") setVisualMode("wipe");
    else if (event.key === "3") setVisualMode("pixel-diff");
    else if (event.key === "4") setVisualMode("blink");
    else if (event.key === "5") setVisualMode("after-only");
    else if ((event.key === "j" || event.key === "k") && report?.changes.length) {
      const index = report.changes.findIndex((change) => change.id === selectedChangeId);
      const delta = event.key === "j" ? 1 : -1;
      selectChange(
        report.changes[(index + delta + report.changes.length) % report.changes.length]!
      );
    } else if ((event.key === "n" || event.key === "p") && selectedFindings.length) {
      const delta = event.key === "n" ? 1 : -1;
      activeFindingIndex =
        (activeFindingIndex + delta + selectedFindings.length) % selectedFindings.length;
      void focusElement(domId("finding", selectedFindings[activeFindingIndex]!.id));
    } else if (event.key === "e") {
      openVisualEvidence();
    }
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
      captureInteractiveToken();
      const embeddedReport = document.querySelector<HTMLScriptElement>("[data-utsuri-report]");
      const embeddedManifest = document.querySelector<HTMLScriptElement>("[data-utsuri-manifest]");
      let manifest: { source?: { base?: string | null; head?: string | null } } | null = null;
      if (embeddedReport?.textContent) {
        report = JSON.parse(embeddedReport.textContent) as UtsuriReport;
        manifest = embeddedManifest?.textContent
          ? (JSON.parse(embeddedManifest.textContent) as {
              source?: { base?: string | null; head?: string | null };
            })
          : null;
      } else {
        const [response, manifestResponse] = await Promise.all([
          fetch("./report.json", { credentials: "omit" }),
          fetch("./manifest.json", { credentials: "omit" })
        ]);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        report = (await response.json()) as UtsuriReport;
        manifest = manifestResponse.ok
          ? ((await manifestResponse.json()) as {
              source?: { base?: string | null; head?: string | null };
            })
          : null;
      }
      if (manifest) {
        reviewSource = {
          base: manifest.source?.base ?? null,
          head: manifest.source?.head ?? null
        };
      }
      try {
        if (interactiveToken) {
          reviewStore = await createBrowserReviewStore(report, new Date().toISOString());
          await refreshInteractiveReview();
          void listenForInteractiveEvents();
        } else {
          reviewStore = await loadBrowserReviewStore(report);
        }
      } catch (error) {
        reviewFailure = error instanceof Error ? error.message : String(error);
      }
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
    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.addEventListener("hashchange", applyLocation);
    window.addEventListener("keydown", handleShortcut);
    return () => {
      window.removeEventListener("hashchange", applyLocation);
      window.removeEventListener("keydown", handleShortcut);
    };
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
        <small>{coverageSummary(report)}</small>
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
        <input type="search" bind:this={searchInput} bind:value={query} autocomplete="off" />
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
        <section class="coverage-overview" aria-labelledby="coverage-heading">
          <div>
            <p class="kicker">Coverage / structured</p>
            <h2 id="coverage-heading">{t.coverage}</h2>
            <p>{coverageSummary(report)}</p>
          </div>
          <dl>
            <div>
              <dt>{t.planned}</dt>
              <dd>{report.coverage.planned}</dd>
            </div>
            <div>
              <dt>{t.captured}</dt>
              <dd>{report.coverage.succeeded}</dd>
            </div>
            <div>
              <dt>{t.failed}</dt>
              <dd>{report.coverage.failed}</dd>
            </div>
          </dl>
        </section>
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
                {#if reviewStore}
                  <label class="viewed-control compact-control">
                    <input
                      type="checkbox"
                      checked={viewed("file", file.id)}
                      disabled={reviewBusy}
                      onchange={(event) =>
                        void updateViewed("file", file.id, event.currentTarget.checked)}
                    />
                    <span>{t.viewed}</span>
                  </label>
                {/if}
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

          <section class="review-workspace" aria-labelledby="review-workspace-heading">
            <div class="review-workspace-heading">
              <div>
                <p class="kicker">State / human-owned</p>
                <h3 id="review-workspace-heading">{t.reviewWorkspace}</h3>
                {#if reviewStore}
                  <p>
                    {t.reviewProgress}: {Object.values(reviewStore.state.viewed).filter(
                      (entry) => entry.state === "viewed"
                    ).length}
                    {t.viewed.toLocaleLowerCase()} ·
                    {reviewStore.threads.length}
                    {t.comments.toLocaleLowerCase()}
                  </p>
                {:else}
                  <p>{t.reviewUnavailable}</p>
                {/if}
              </div>
              <div class="review-transfer-actions">
                <label>
                  <input
                    type="checkbox"
                    bind:checked={reviewReanchor}
                    disabled={reviewBusy || Boolean(interactiveToken)}
                  />
                  <span>{t.reanchorImport}</span>
                </label>
                <button
                  type="button"
                  disabled={!reviewStore || reviewBusy}
                  onclick={() => void exportReview()}>{t.exportReview}</button
                >
                <button
                  type="button"
                  disabled={!reviewStore || reviewBusy || Boolean(interactiveToken)}
                  onclick={() => reviewImportInput?.click()}>{t.importReview}</button
                >
                <input
                  class="visually-hidden"
                  bind:this={reviewImportInput}
                  type="file"
                  accept="application/json,.json"
                  onchange={(event) => void importReview(event.currentTarget.files?.[0])}
                />
              </div>
            </div>
            {#if reviewStore}
              <div class="review-controls">
                <label>
                  <span>{t.humanJudgment}</span>
                  <select
                    value={judgment(selectedChange.id)}
                    disabled={reviewBusy || judgment(selectedChange.id) === "stale"}
                    onchange={(event) =>
                      void updateJudgment(
                        selectedChange!.id,
                        event.currentTarget.value as HumanJudgment
                      )}
                  >
                    {#each ["unreviewed", "reviewed", "follow-up", "blocked"] as value (value)}
                      <option {value}>{judgmentLabel(value as HumanJudgment)}</option>
                    {/each}
                    {#if judgment(selectedChange.id) === "stale"}
                      <option value="stale">{t.stale}</option>
                    {/if}
                  </select>
                </label>
                <label class="viewed-control">
                  <input
                    type="checkbox"
                    checked={viewed("change", selectedChange.id)}
                    disabled={reviewBusy}
                    onchange={(event) =>
                      void updateViewed("change", selectedChange!.id, event.currentTarget.checked)}
                  />
                  <span>{t.viewed}</span>
                </label>
                <button
                  type="button"
                  disabled={reviewBusy}
                  onclick={() => void startComment(currentAnchor("change", selectedChange!.id))}
                  >{t.comment}</button
                >
              </div>
              <p class="local-only-note">{t.localOnly}</p>
            {/if}
            {#if reviewFailure}<p class="review-message" role="alert">{reviewFailure}</p>{/if}
            {#if reviewNotice}<p class="review-message" role="status">{reviewNotice}</p>{/if}
          </section>

          <section class="interpretation-section" aria-labelledby="interpretation-heading">
            <div class="section-heading">
              <div>
                <p class="kicker">Interpretation / Agent</p>
                <h3 id="interpretation-heading">{t.interpretation}</h3>
              </div>
            </div>
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
                  {#each selectedChange.risk.reasons as reason, index (index)}<li>
                      {reason}
                    </li>{/each}
                </ul>
              </section>
              <section class="gap-block">
                <h3>{t.gaps}</h3>
                <ul>
                  {#each selectedChange.verification.gaps as gap, index (index)}<li>
                      <span>{gap}</span>
                      {#if reviewStore}<button
                          type="button"
                          class="inline-comment-action"
                          onclick={() =>
                            void startComment(
                              currentAnchor(
                                "verification-gap",
                                `${selectedChange!.id}:gap:${index}`
                              )
                            )}>{t.comment}</button
                        >{/if}
                    </li>{/each}
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
          </section>

          <section class="visual-evidence-section" aria-labelledby="measured-evidence-heading">
            <div class="section-heading visual-heading">
              <div>
                <p class="kicker">Evidence / {selectedComparisons.length}</p>
                <h3 id="measured-evidence-heading">{t.measured}</h3>
                <h4 id="visual-evidence-heading" tabindex="-1">{t.visualEvidence}</h4>
                <p>{coverageSummary(report)}</p>
              </div>
            </div>

            {#if selectedComparisons.length > 0}
              <div class="visual-selectors">
                {#if selectedComparisons.length > 1}
                  <label>
                    <span>Target</span>
                    <select
                      value={activeComparison?.id}
                      onchange={(event) => selectComparison(event.currentTarget.value)}
                    >
                      {#each selectedComparisons as comparison (comparison.id)}
                        {@const target = report.targets.find(
                          (entry) => entry.id === comparison.targetRef
                        )}
                        <option value={comparison.id}
                          >{target?.routeOrStory ?? comparison.targetRef} · {target?.viewport} · {target?.state}</option
                        >
                      {/each}
                    </select>
                  </label>
                {/if}
                {#if activeComparison && activeComparison.images.length > 1}
                  <label>
                    <span>{t.imageScope}</span>
                    <select
                      value={activeImage?.id}
                      onchange={(event) => selectImage(event.currentTarget.value)}
                    >
                      {#each activeComparison.images as image (image.id)}
                        <option value={image.id}>{image.label}</option>
                      {/each}
                    </select>
                  </label>
                {/if}
                {#if activeComparison && reviewStore}
                  <label class="viewed-control visual-viewed-control">
                    <input
                      type="checkbox"
                      checked={viewed("visual-target", activeComparison.targetRef)}
                      disabled={reviewBusy}
                      onchange={(event) =>
                        void updateViewed(
                          "visual-target",
                          activeComparison!.targetRef,
                          event.currentTarget.checked
                        )}
                    />
                    <span>{t.viewed}</span>
                  </label>
                {/if}
                <label class="visual-slider">
                  <span>{t.zoom}: {visualZoom}%</span>
                  <input type="range" min="50" max="200" step="10" bind:value={visualZoom} />
                </label>
              </div>

              <div class="visual-mode-control" role="group" aria-label={t.visualEvidence}>
                <button
                  type="button"
                  aria-pressed={visualMode === "side-by-side"}
                  onclick={() => setVisualMode("side-by-side")}>{t.sideBySide}</button
                >
                <button
                  type="button"
                  aria-pressed={visualMode === "wipe"}
                  onclick={() => setVisualMode("wipe")}>{t.wipe}</button
                >
                <button
                  type="button"
                  aria-pressed={visualMode === "blink"}
                  disabled={reducedMotion}
                  title={reducedMotion ? t.reducedMotion : undefined}
                  onclick={() => {
                    if (visualMode === "blink") blinkRunning = !blinkRunning;
                    else setVisualMode("blink");
                  }}>{visualMode === "blink" && blinkRunning ? t.stopBlink : t.blink}</button
                >
                <button
                  type="button"
                  aria-pressed={visualMode === "pixel-diff"}
                  onclick={() => setVisualMode("pixel-diff")}>{t.pixelDiff}</button
                >
                <button
                  type="button"
                  aria-pressed={visualMode === "after-only"}
                  onclick={() => setVisualMode("after-only")}>{t.afterOnly}</button
                >
              </div>

              {#if activeComparison?.status === "incomplete"}
                <div class="persistent-error" role="alert">
                  <strong>INCOMPLETE</strong>
                  <span>{activeComparison.incompleteReasons.join(", ")}</span>
                </div>
              {/if}

              {#if activeImage}
                <dl class="visual-metrics">
                  <div>
                    <dt>Pixels changed</dt>
                    <dd>{activeImage.diffPixelCount}</dd>
                  </div>
                  <div>
                    <dt>Pixel ratio</dt>
                    <dd>{(activeImage.diffRatio * 100).toFixed(3)}%</dd>
                  </div>
                  <div>
                    <dt>{t.changedRegions}</dt>
                    <dd>{activeImage.regions.length}</dd>
                  </div>
                  <div>
                    <dt>Canvas</dt>
                    <dd>{activeImage.width} × {activeImage.height}</dd>
                  </div>
                </dl>

                {#if visualMode === "side-by-side"}
                  <div class="visual-panes" data-visual-mode="side-by-side">
                    <figure>
                      <figcaption>Before · {activeImage.label}</figcaption>
                      <div
                        class="visual-scroll"
                        bind:this={beforePane}
                        onscroll={() => syncVisualScroll(beforePane, afterPane)}
                      >
                        <div class="image-stage" style={`width: ${visualZoom}%`}>
                          <img
                            src={`./${activeImage.beforeRef}`}
                            alt={`Before capture for ${activeImage.label}`}
                          />
                        </div>
                      </div>
                    </figure>
                    <figure>
                      <figcaption>After · {activeImage.label}</figcaption>
                      <div
                        class="visual-scroll"
                        bind:this={afterPane}
                        onscroll={() => syncVisualScroll(afterPane, beforePane)}
                      >
                        <div class="image-stage" style={`width: ${visualZoom}%`}>
                          <img
                            src={`./${activeImage.afterRef}`}
                            alt={`After capture for ${activeImage.label}`}
                          />
                          {#each activeImage.regions as region, index (region.id)}
                            <button
                              id={`visual-region-${index}`}
                              class:active-region={activeRegionIndex === index}
                              class="region-marker"
                              type="button"
                              aria-label={`Changed region ${index + 1}, ${region.pixels} pixels`}
                              style={`left:${(region.x / activeImage.width) * 100}%;top:${(region.y / activeImage.height) * 100}%;width:${(region.width / activeImage.width) * 100}%;height:${(region.height / activeImage.height) * 100}%`}
                              onclick={() => void jumpRegion(index)}>{index + 1}</button
                            >
                          {/each}
                          {#each activeVisualThreads as thread, index (thread.id)}
                            <button
                              class="visual-comment-pin"
                              type="button"
                              style={visualPinStyle(thread.anchor)}
                              aria-label={`${t.comment} pin ${index + 1}: ${thread.state}`}
                              onclick={() => void focusElement(domId("thread", thread.id))}
                              >{index + 1}</button
                            >
                          {/each}
                        </div>
                      </div>
                    </figure>
                  </div>
                {:else if visualMode === "wipe"}
                  <label class="wipe-control">
                    <span>{t.wipePosition}: {wipePosition}%</span>
                    <input type="range" min="0" max="100" bind:value={wipePosition} />
                  </label>
                  <figure class="single-visual">
                    <figcaption>Before / after wipe · {activeImage.label}</figcaption>
                    <div class="visual-scroll">
                      <div class="image-stage" style={`width: ${visualZoom}%`}>
                        <img
                          src={`./${activeImage.beforeRef}`}
                          alt={`Before capture for ${activeImage.label}`}
                        />
                        <img
                          class="wipe-after"
                          style={`clip-path: inset(0 ${100 - wipePosition}% 0 0)`}
                          src={`./${activeImage.afterRef}`}
                          alt={`After capture revealed to ${wipePosition}%`}
                        />
                        {#each activeVisualThreads as thread, index (thread.id)}
                          <button
                            class="visual-comment-pin"
                            type="button"
                            style={visualPinStyle(thread.anchor)}
                            aria-label={`${t.comment} pin ${index + 1}: ${thread.state}`}
                            onclick={() => void focusElement(domId("thread", thread.id))}
                            >{index + 1}</button
                          >
                        {/each}
                      </div>
                    </div>
                  </figure>
                {:else if visualMode === "blink"}
                  <figure class="single-visual">
                    <figcaption>
                      {blinkRunning ? "Blink running; use Stop blink to pause" : "Blink paused"} ·
                      {activeImage.label}
                    </figcaption>
                    <div class="visual-scroll">
                      <div class="image-stage" style={`width: ${visualZoom}%`}>
                        <img
                          src={`./${activeImage.beforeRef}`}
                          alt={`Before capture for ${activeImage.label}`}
                        />
                        <img
                          class:blink-running={blinkRunning}
                          class="blink-after"
                          src={`./${activeImage.afterRef}`}
                          alt={`After capture for ${activeImage.label}`}
                        />
                        {#each activeVisualThreads as thread, index (thread.id)}
                          <button
                            class="visual-comment-pin"
                            type="button"
                            style={visualPinStyle(thread.anchor)}
                            aria-label={`${t.comment} pin ${index + 1}: ${thread.state}`}
                            onclick={() => void focusElement(domId("thread", thread.id))}
                            >{index + 1}</button
                          >
                        {/each}
                      </div>
                    </div>
                  </figure>
                {:else if visualMode === "pixel-diff"}
                  <figure class="single-visual pixel-diff-view">
                    <figcaption>{t.pixelDiff} · {activeImage.label}</figcaption>
                    <div class="visual-scroll">
                      <div class="image-stage" style={`width: ${visualZoom}%`}>
                        <img
                          src={`./${activeImage.diffRef}`}
                          alt={`Pixel difference bitmap with ${activeImage.diffPixelCount} changed pixels`}
                        />
                        {#each activeVisualThreads as thread, index (thread.id)}
                          <button
                            class="visual-comment-pin"
                            type="button"
                            style={visualPinStyle(thread.anchor)}
                            aria-label={`${t.comment} pin ${index + 1}: ${thread.state}`}
                            onclick={() => void focusElement(domId("thread", thread.id))}
                            >{index + 1}</button
                          >
                        {/each}
                      </div>
                    </div>
                  </figure>
                {:else}
                  <figure class="single-visual">
                    <figcaption>{t.afterOnly} · {activeImage.label}</figcaption>
                    <div class="visual-scroll">
                      <div class="image-stage" style={`width: ${visualZoom}%`}>
                        <img
                          src={`./${activeImage.afterRef}`}
                          alt={`After capture for ${activeImage.label}`}
                        />
                        {#each activeImage.regions as region, index (region.id)}
                          <button
                            id={`visual-region-${index}`}
                            class:active-region={activeRegionIndex === index}
                            class="region-marker"
                            type="button"
                            aria-label={`Changed region ${index + 1}, ${region.pixels} pixels`}
                            style={`left:${(region.x / activeImage.width) * 100}%;top:${(region.y / activeImage.height) * 100}%;width:${(region.width / activeImage.width) * 100}%;height:${(region.height / activeImage.height) * 100}%`}
                            onclick={() => void jumpRegion(index)}>{index + 1}</button
                          >
                        {/each}
                        {#each activeVisualThreads as thread, index (thread.id)}
                          <button
                            class="visual-comment-pin"
                            type="button"
                            style={visualPinStyle(thread.anchor)}
                            aria-label={`${t.comment} pin ${index + 1}: ${thread.state}`}
                            onclick={() => void focusElement(domId("thread", thread.id))}
                            >{index + 1}</button
                          >
                        {/each}
                      </div>
                    </div>
                  </figure>
                {/if}

                <section class="region-list" aria-labelledby="region-heading">
                  <h4 id="region-heading">{t.changedRegions}</h4>
                  {#if activeImage.regions.length > 0}
                    <ol>
                      {#each activeImage.regions as region, index (region.id)}
                        <li>
                          <div class="region-actions">
                            <button
                              type="button"
                              aria-current={activeRegionIndex === index ? "true" : undefined}
                              onclick={() => void jumpRegion(index)}
                              >Region {index + 1} · {region.pixels} px · ({region.x}, {region.y}) {region.width}
                              × {region.height}</button
                            >
                            {#if reviewStore}<button
                                type="button"
                                onclick={() =>
                                  void startComment(
                                    currentAnchor(
                                      "visual-region",
                                      `${activeComparison!.id}:${activeImage!.id}:${region.id}`
                                    )
                                  )}>{t.comment}</button
                              >{/if}
                          </div>
                        </li>
                      {/each}
                    </ol>
                  {:else}
                    <p>{t.noRegions}</p>
                  {/if}
                </section>
              {/if}
            {:else}
              <div class="verification-gap" role="status">
                <strong>UNCOVERED</strong>
                <span>{t.visualGap}</span>
              </div>
            {/if}

            <section class="finding-list" aria-labelledby="finding-heading">
              <div class="section-heading">
                <div>
                  <p class="kicker">Finding states / {selectedFindings.length}</p>
                  <h4 id="finding-heading">{t.findings}</h4>
                </div>
              </div>
              {#if selectedFindings.length > 0}
                <ol>
                  {#each selectedFindings as finding, index (finding.id)}
                    <li>
                      <article
                        id={domId("finding", finding.id)}
                        tabindex="-1"
                        class:active-finding={activeFindingIndex === index}
                      >
                        <div class="finding-badges">
                          <span>{finding.state}</span><span>{finding.severity}</span><span
                            >{finding.category}</span
                          >
                        </div>
                        <h5>{finding.title}</h5>
                        <p>{finding.description}</p>
                        {#if finding.hunkRefs[0]}
                          <button type="button" onclick={() => openHunk(finding.hunkRefs[0]!)}
                            >{t.viewCode}</button
                          >
                        {/if}
                        {#if reviewStore}<button
                            type="button"
                            onclick={() => void startComment(currentAnchor("finding", finding.id))}
                            >{t.comment}</button
                          >{/if}
                      </article>
                    </li>
                  {/each}
                </ol>
              {:else}
                <p>{t.noFindings}</p>
              {/if}
            </section>
          </section>

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
                  <div class="hunk-actions">
                    {#if reviewStore}
                      <label class="viewed-control dark-control">
                        <input
                          type="checkbox"
                          checked={viewed("hunk", hunk.id)}
                          disabled={reviewBusy}
                          onchange={(event) =>
                            void updateViewed("hunk", hunk.id, event.currentTarget.checked)}
                        />
                        <span>{t.viewed}</span>
                      </label>
                      <button
                        type="button"
                        onclick={() => void startComment(currentAnchor("hunk", hunk.id))}
                        >{t.comment}</button
                      >
                    {/if}
                    {#if selectedComparisons.length > 0}
                      <button type="button" onclick={openVisualEvidence}>{t.viewVisual}</button>
                    {/if}
                    <button
                      type="button"
                      class="anchor-button"
                      aria-label={`Link to hunk in ${hunk.path}`}
                      onclick={() => openHunk(hunk.id)}>#</button
                    >
                  </div>
                </header>
                <div
                  class:split-diff={diffMode === "split"}
                  class="diff-table"
                  role="region"
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
                      {@const reviewAnchor = lineReviewAnchor(hunk, row.index)}
                      <div
                        class={`diff-line ${row.line.kind}`}
                        role="group"
                        aria-label={`${row.line.kind}, old line ${row.line.oldLine ?? "none"}, new line ${row.line.newLine ?? "none"}`}
                      >
                        <span class="line-number" aria-hidden="true">{row.line.oldLine ?? ""}</span>
                        <span class="line-number" aria-hidden="true">{row.line.newLine ?? ""}</span>
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
                        {#if reviewStore && reviewAnchor}<button
                            class="line-comment"
                            type="button"
                            aria-label={`${t.commentOn} ${hunk.path}:${reviewAnchor.startLine}`}
                            title={t.comment}
                            onclick={() => void startComment(reviewAnchor)}>✎</button
                          >{/if}
                      </div>
                    {:else}
                      {@const reviewAnchor = lineReviewAnchor(hunk, row.index)}
                      <div
                        class="split-row"
                        role="group"
                        aria-label={`${row.line.kind}, old line ${row.line.oldLine ?? "none"}, new line ${row.line.newLine ?? "none"}`}
                      >
                        <div
                          class:empty-side={row.line.kind === "addition"}
                          class={`diff-line ${row.line.kind === "addition" ? "empty" : row.line.kind}`}
                        >
                          <span class="line-number" aria-hidden="true"
                            >{row.line.oldLine ?? ""}</span
                          >
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
                          <span class="line-number" aria-hidden="true"
                            >{row.line.newLine ?? ""}</span
                          >
                          <span class="line-sign" aria-hidden="true"
                            >{row.line.kind === "addition" ? "+" : " "}</span
                          >
                          {#if row.line.kind !== "deletion"}<code
                              >{#each segments(hunk, row.index) as segment, segmentIndex (segmentIndex)}<span
                                  class:word-change={segment.changed}>{segment.text}</span
                                >{/each}</code
                            >{/if}
                        </div>
                        {#if reviewStore && reviewAnchor}<button
                            class="line-comment"
                            type="button"
                            aria-label={`${t.commentOn} ${hunk.path}:${reviewAnchor.startLine}`}
                            title={t.comment}
                            onclick={() => void startComment(reviewAnchor)}>✎</button
                          >{/if}
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

          <section class="review-comments" aria-labelledby="review-comments-heading">
            <div class="section-heading">
              <div>
                <p class="kicker">Notes / {selectedThreads.length}</p>
                <h3 id="review-comments-heading">{t.comments}</h3>
              </div>
            </div>

            {#if commentAnchor}
              <form
                class="comment-composer"
                onsubmit={(event) => {
                  event.preventDefault();
                  void saveComment();
                }}
              >
                <div>
                  <p class="kicker">{t.commentOn} / {commentAnchor.type}</p>
                  <code>{commentAnchor.path ?? commentAnchor.ref}</code>
                </div>
                <label>
                  <span>Kind</span>
                  <select bind:value={commentKind} disabled={reviewBusy}>
                    <option value="note">Note</option>
                    <option value="question">Question</option>
                    <option value="finding">Finding</option>
                    <option value="change-request">Change request</option>
                  </select>
                </label>
                <label class="comment-body">
                  <span>{t.commentBody}</span>
                  <textarea
                    bind:this={commentInput}
                    bind:value={commentBody}
                    rows="4"
                    maxlength="16384"
                    required
                    disabled={reviewBusy}
                  ></textarea>
                </label>
                <label class="agent-attention-control">
                  <input
                    type="checkbox"
                    bind:checked={commentAgentAttention}
                    disabled={reviewBusy}
                  />
                  <span>{t.askAgent}</span>
                  <small>{t.askAgentHelp}</small>
                </label>
                <p>{t.localOnly}</p>
                <div class="comment-actions">
                  <button type="submit" disabled={reviewBusy || !commentBody.trim()}
                    >{t.saveComment}</button
                  >
                  <button
                    type="button"
                    disabled={reviewBusy}
                    onclick={() => {
                      commentAnchor = null;
                      commentBody = "";
                      commentAgentAttention = false;
                    }}>{t.cancel}</button
                  >
                </div>
              </form>
            {/if}

            {#if selectedThreads.length > 0}
              <ol class="thread-list">
                {#each selectedThreads as thread (thread.id)}
                  <li
                    id={domId("thread", thread.id)}
                    tabindex="-1"
                    data-thread-state={thread.state}
                  >
                    <header>
                      <div>
                        <span>{thread.kind}</span>
                        <strong>{thread.anchor.type}</strong>
                      </div>
                      <span>{thread.state === "resolved" ? t.resolved : thread.state}</span>
                    </header>
                    <code>{thread.anchor.path ?? thread.anchor.ref}</code>
                    {#each thread.messages as message (message.id)}
                      <p>{message.body}</p>
                    {/each}
                    {#if thread.agentAttention.state === "none" || thread.agentAttention.state === "requested"}
                      <label class="agent-attention-control compact-attention">
                        <input
                          type="checkbox"
                          checked={thread.agentAttention.state === "requested"}
                          disabled={reviewBusy || thread.state !== "open"}
                          onchange={(event) =>
                            void updateAgentAttention(thread.id, event.currentTarget.checked)}
                        />
                        <span>{t.askAgent}</span>
                      </label>
                    {:else}
                      <p class="attention-state">Agent attention: {thread.agentAttention.state}</p>
                    {/if}
                    {#if thread.state === "open"}
                      <button
                        type="button"
                        disabled={reviewBusy}
                        onclick={() => void resolveComment(thread.id)}>{t.resolve}</button
                      >
                    {/if}
                  </li>
                {/each}
              </ol>
            {:else}
              <p class="empty-comments">{t.noComments}</p>
            {/if}
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
                {#if reviewStore}<div class="hunk-actions">
                    <label class="viewed-control dark-control">
                      <input
                        type="checkbox"
                        checked={viewed("hunk", hunk.id)}
                        disabled={reviewBusy}
                        onchange={(event) =>
                          void updateViewed("hunk", hunk.id, event.currentTarget.checked)}
                      />
                      <span>{t.viewed}</span>
                    </label>
                    <button
                      type="button"
                      onclick={() => void startComment(currentAnchor("hunk", hunk.id))}
                      >{t.comment}</button
                    >
                  </div>{/if}
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
    {#if reviewStore && (selectedAttentionCount > 0 || unreadAnswerCount > 0 || feedbackPreview)}
      <aside class="feedback-dock" aria-live="polite" aria-label={t.selectedItems}>
        <header>
          <div>
            <strong>{t.selectedItems}: {selectedAttentionCount}</strong>
            {#if unreadAnswerCount > 0}<span class="unread-badge"
                >{t.unreadAnswers}: {unreadAnswerCount}</span
              >{/if}
          </div>
          {#if selectedAttentionCount > 0}
            <button
              type="button"
              disabled={feedbackBusy || reviewBusy}
              onclick={() => void reviewFeedbackItems()}>{t.reviewItems}</button
            >
          {/if}
        </header>
        {#if feedbackPreview}
          <section class="feedback-preview" aria-labelledby="feedback-preview-heading">
            <h2 id="feedback-preview-heading">{t.feedbackPreview}</h2>
            <ol>
              {#each feedbackPreview.batch.items as item (item.id)}
                <li>
                  <strong>{item.question}</strong>
                  <code>{item.anchor.type}: {item.anchor.ref}</code>
                  <span>{item.state}</span>
                </li>
              {/each}
            </ol>
            <div class="feedback-preview-grid">
              <section>
                <h3>{t.shared}</h3>
                <p>
                  {feedbackPreview.shared.comments} comments · {feedbackPreview.shared.codeRanges}
                  code ranges · {feedbackPreview.shared.imageCrops} image crops ·
                  {feedbackPreview.shared.evidenceReferences} evidence refs
                </p>
              </section>
              <section>
                <h3>{t.notShared}</h3>
                <p>{feedbackPreview.excluded.join(" · ")}</p>
              </section>
              <section>
                <h3>{t.delivery}</h3>
                <p>
                  {feedbackPreview.destination.deliveryMode} · {feedbackPreview.contextBytes} bytes ·
                  {feedbackPreview.redactionCount} redactions
                </p>
              </section>
            </div>
            {#each feedbackPreview.warnings as warning (warning)}<p class="feedback-warning">
                {warning}
              </p>{/each}
            <div class="feedback-actions">
              <button
                type="button"
                disabled={feedbackBusy}
                onclick={() => void prepareFeedbackRequest()}
                >{interactiveToken ? t.returnConversation : t.prepareRequest}</button
              >
              {#if feedbackHandoff}
                <button
                  type="button"
                  disabled={feedbackBusy}
                  onclick={() => void copyFeedbackHandoff()}>{t.copyHandoff}</button
                >
              {/if}
            </div>
            {#if feedbackHandoff}<pre>{feedbackHandoff}</pre>{/if}
          </section>
        {/if}
      </aside>
    {/if}
  </div>
{:else}
  <p class="loading" role={failure ? "alert" : "status"} aria-live="polite">
    {failure || copy.en.loading}
  </p>
{/if}
