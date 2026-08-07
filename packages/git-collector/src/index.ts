import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createEvidenceIndex,
  createReviewPlan,
  sha256,
  stableHash,
  type EvidenceIndex,
  type GitDiffDocument,
  type GitInputMode,
  type ReviewPlan
} from "@utsu-ri/core";
import {
  assertArtifact,
  validateDiffReferences,
  validateReviewPlanReferences
} from "@utsu-ri/report-model";
import { resolveContainedPath } from "@utsu-ri/security";
import { ExitCode, UtsuriError } from "@utsu-ri/core";
import { emptyTree, gitBuffer, repositoryRoot, resolveCommit } from "./git-command";
import { applyNameStatus, applyNumstat, parseGitPatch } from "./patch";

export interface CollectGitOptions {
  cwd: string;
  output: string;
  patch?: string;
  worktree?: boolean;
  base?: string;
  head?: string;
  mergeBase?: string;
}

export interface CollectedRun {
  root: string;
  runDirectory: string;
  patch: string;
  diff: GitDiffDocument;
  evidenceIndex: EvidenceIndex;
  reviewPlan: ReviewPlan;
}

interface SourceCollection {
  mode: GitInputMode;
  patch: Buffer;
  base: string | null;
  head: string | null;
  mergeBase: string | null;
  patchPath: string | null;
  numstat: Buffer | null;
  nameStatus: Buffer | null;
  summary: Buffer | null;
  raw: Buffer | null;
  commits: Buffer | null;
}

const patchFlags = [
  "--binary",
  "--full-index",
  "--no-ext-diff",
  "--no-color",
  "--find-renames",
  "--find-copies",
  "--unified=20"
] as const;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

function decodeGitText(value: Buffer, label: string): string {
  try {
    return utf8Decoder.decode(value);
  } catch {
    throw new UtsuriError("GIT_OUTPUT_ENCODING", `${label} is not valid UTF-8`, ExitCode.Artifact);
  }
}

function selectMode(options: CollectGitOptions): GitInputMode {
  const modes = [
    options.patch ? "patch" : null,
    options.worktree ? "worktree" : null,
    options.mergeBase ? "merge-base" : null,
    options.base ? "range" : null
  ].filter((mode): mode is GitInputMode => mode !== null);
  if (modes.length !== 1) {
    throw new UtsuriError(
      "COLLECT_MODE_REQUIRED",
      "Select exactly one input mode: --patch, --worktree, --base/--head, or --merge-base/--head",
      ExitCode.Arguments
    );
  }
  const mode = modes[0]!;
  if (
    (mode === "patch" &&
      (options.worktree ||
        options.base !== undefined ||
        options.head !== undefined ||
        options.mergeBase !== undefined)) ||
    (mode === "worktree" &&
      (options.patch !== undefined ||
        options.base !== undefined ||
        options.head !== undefined ||
        options.mergeBase !== undefined))
  ) {
    throw new UtsuriError(
      "COLLECT_MODE_CONFLICT",
      `${mode} mode does not accept options from another input mode`,
      ExitCode.Arguments
    );
  }
  if ((mode === "range" || mode === "merge-base") && !options.head) {
    throw new UtsuriError(
      "COLLECT_HEAD_REQUIRED",
      `${mode} mode requires --head`,
      ExitCode.Arguments
    );
  }
  return mode;
}

async function appendUntracked(
  root: string,
  patch: Buffer,
  numstat: Buffer
): Promise<{ patch: Buffer; numstat: Buffer }> {
  const untracked = decodeGitText(
    await gitBuffer(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
    "Untracked path list"
  )
    .split("\0")
    .filter(Boolean)
    .sort();
  const patchParts = [patch];
  const numstatParts = [numstat];
  for (const relative of untracked) {
    if (
      relative.includes("\\") ||
      relative.split("/").includes("..") ||
      path.posix.isAbsolute(relative)
    ) {
      throw new UtsuriError(
        "GIT_UNTRACKED_PATH",
        "Git returned an unsafe untracked path",
        ExitCode.Security
      );
    }
    const normalized = relative;
    const [patchOutput, numstatOutput] = await Promise.all([
      gitBuffer(root, ["diff", "--no-index", ...patchFlags, "--", "/dev/null", normalized], [0, 1]),
      gitBuffer(
        root,
        [
          "diff",
          "--no-index",
          "--no-ext-diff",
          "--no-color",
          "--numstat",
          "-z",
          "--",
          "/dev/null",
          normalized
        ],
        [0, 1]
      )
    ]);
    patchParts.push(patchOutput);
    numstatParts.push(numstatOutput);
  }
  return {
    patch: Buffer.concat(
      patchParts.map((part, index) =>
        index > 0 && patchParts[index - 1]?.at(-1) !== 10
          ? Buffer.concat([Buffer.from("\n"), part])
          : part
      )
    ),
    numstat: Buffer.concat(numstatParts)
  };
}

async function collectSource(root: string, options: CollectGitOptions): Promise<SourceCollection> {
  const mode = selectMode(options);
  if (mode === "patch") {
    const filename = await resolveContainedPath(root, options.patch!);
    const patch = await readFile(filename);
    return {
      mode,
      patch,
      base: null,
      head: null,
      mergeBase: null,
      patchPath: path.relative(root, filename).replaceAll(path.sep, "/"),
      numstat: null,
      nameStatus: null,
      summary: null,
      raw: null,
      commits: null
    };
  }

  let base: string;
  let head: string;
  let mergeBase: string | null = null;
  let workingTree = false;
  if (mode === "worktree") {
    base = await resolveCommit(root, "HEAD").catch(() => emptyTree(root));
    head = "worktree";
    workingTree = true;
  } else if (mode === "range") {
    base = await resolveCommit(root, options.base!);
    workingTree = options.head === "worktree";
    head = workingTree ? "worktree" : await resolveCommit(root, options.head!);
  } else {
    const comparisonBase = await resolveCommit(root, options.mergeBase!);
    workingTree = options.head === "worktree";
    const headCommit = workingTree
      ? await resolveCommit(root, "HEAD")
      : await resolveCommit(root, options.head!);
    mergeBase = (await gitBuffer(root, ["merge-base", comparisonBase, headCommit]))
      .toString("utf8")
      .trim();
    base = comparisonBase;
    head = workingTree ? "worktree" : headCommit;
  }

  const diffBase = mergeBase ?? base;
  const revisions = workingTree ? [diffBase] : [diffBase, head];
  const common = ["diff", ...patchFlags, ...revisions, "--"];
  let patch = await gitBuffer(root, common);
  const metadataBase = ["diff", "--no-ext-diff", "--no-color", "--find-renames", "--find-copies"];
  const [trackedNumstat, nameStatus, summary, raw, commits] = await Promise.all([
    gitBuffer(root, [...metadataBase, "--numstat", "-z", ...revisions, "--"]),
    gitBuffer(root, [...metadataBase, "--name-status", "-z", ...revisions, "--"]),
    gitBuffer(root, [...metadataBase, "--summary", ...revisions, "--"]),
    gitBuffer(root, [...metadataBase, "--raw", "--full-index", "-z", ...revisions, "--"]),
    gitBuffer(root, [
      "log",
      "--format=%H%x00%P%x00%s%x00",
      `${diffBase}..${workingTree ? "HEAD" : head}`
    ])
  ]);
  let numstat = trackedNumstat;
  if (workingTree) {
    const withUntracked = await appendUntracked(root, patch, numstat);
    patch = withUntracked.patch;
    numstat = withUntracked.numstat;
  }
  return {
    mode,
    patch,
    base,
    head,
    mergeBase,
    patchPath: null,
    numstat,
    nameStatus,
    summary,
    raw,
    commits
  };
}

function sourceDigests(source: SourceCollection): GitDiffDocument["sourceDigests"] {
  const digest = (value: Buffer | null) => (value === null ? null : sha256(value));
  return {
    patch: sha256(source.patch),
    numstat: digest(source.numstat),
    nameStatus: digest(source.nameStatus),
    summary: digest(source.summary),
    raw: digest(source.raw),
    commits: digest(source.commits)
  };
}

async function writeRun(
  root: string,
  output: string,
  source: SourceCollection,
  diff: GitDiffDocument,
  evidenceIndex: EvidenceIndex,
  reviewPlan: ReviewPlan
): Promise<string> {
  const outputPath = await resolveContainedPath(root, output, { allowMissing: true });
  const relative = path.relative(root, outputPath);
  if (relative === ".git" || relative.startsWith(`.git${path.sep}`)) {
    throw new UtsuriError(
      "COLLECT_OUTPUT_GIT",
      "Run output must not be inside .git",
      ExitCode.Security
    );
  }
  const parent = path.dirname(outputPath);
  await resolveContainedPath(root, path.relative(root, parent), { allowMissing: true });
  await mkdir(parent, { recursive: true, mode: 0o700 });
  await resolveContainedPath(root, path.relative(root, parent));
  await mkdir(outputPath, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") {
      throw new UtsuriError(
        "COLLECT_OUTPUT_EXISTS",
        "Run output already exists and will not be replaced",
        ExitCode.Artifact
      );
    }
    throw error;
  });
  try {
    await mkdir(path.join(outputPath, "logs"));
    const input = {
      schemaVersion: "1.0",
      mode: source.mode,
      base: source.base,
      head: source.head,
      mergeBase: source.mergeBase,
      patchPath: source.patchPath
    };
    const writes: Array<[string, string | Buffer]> = [
      ["input.json", `${JSON.stringify(input, null, 2)}\n`],
      ["diff.patch", source.patch],
      ["diff.json", `${JSON.stringify(diff, null, 2)}\n`],
      ["evidence-index.json", `${JSON.stringify(evidenceIndex, null, 2)}\n`],
      ["review-plan.json", `${JSON.stringify(reviewPlan, null, 2)}\n`],
      [
        "logs/collect.ndjson",
        `${JSON.stringify({
          event: "collect.completed",
          mode: source.mode,
          filesChanged: diff.summary.filesChanged,
          hunks: diff.hunks.length,
          sourceDigests: diff.sourceDigests
        })}\n`
      ]
    ];
    await Promise.all(
      writes.map(([name, value]) => writeFile(path.join(outputPath, name), value, { flag: "wx" }))
    );
  } catch (error) {
    await writeFile(
      path.join(outputPath, "logs/collect-error.ndjson"),
      `${JSON.stringify({ event: "collect.failed", message: error instanceof Error ? error.message : String(error) })}\n`,
      { flag: "wx" }
    ).catch(() => undefined);
    throw error;
  }
  return await realpath(outputPath);
}

export async function collectGit(options: CollectGitOptions): Promise<CollectedRun> {
  const root = await repositoryRoot(options.cwd);
  const source = await collectSource(root, options);
  const patch = decodeGitText(source.patch, "Git patch");
  const fingerprint = stableHash({ repositoryRoot: root }).slice(0, 32);
  let diff = parseGitPatch(patch, {
    mode: source.mode,
    base: source.base,
    head: source.head,
    mergeBase: source.mergeBase,
    patchPath: source.patchPath,
    repositoryFingerprint: fingerprint,
    sourceDigests: sourceDigests(source)
  });
  if (source.nameStatus) {
    diff = applyNameStatus(diff, decodeGitText(source.nameStatus, "Git name-status output"));
  }
  if (source.numstat) {
    diff = applyNumstat(diff, decodeGitText(source.numstat, "Git numstat output"));
  }
  assertArtifact("diff", diff);
  const diffReferences = validateDiffReferences(diff);
  if (!diffReferences.ok) {
    throw new UtsuriError(
      "DIFF_REFERENCE_INVALID",
      diffReferences.errors.join("; "),
      ExitCode.Artifact
    );
  }
  const evidenceIndex = createEvidenceIndex(diff);
  const reviewPlan = createReviewPlan(diff, evidenceIndex);
  assertArtifact("evidence-index", evidenceIndex);
  assertArtifact("review-plan", reviewPlan);
  const reviewReferences = validateReviewPlanReferences(reviewPlan, diff, evidenceIndex);
  if (!reviewReferences.ok) {
    throw new UtsuriError(
      "REVIEW_PLAN_INVALID",
      reviewReferences.errors.join("; "),
      ExitCode.Artifact
    );
  }
  const runDirectory = await writeRun(
    root,
    options.output,
    source,
    diff,
    evidenceIndex,
    reviewPlan
  );
  return { root, runDirectory, patch, diff, evidenceIndex, reviewPlan };
}

export { parseGitPatch } from "./patch";
