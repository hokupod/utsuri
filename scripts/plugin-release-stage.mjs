import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

const snapshots = new Map();

function gitEnvironment() {
  const result = spawnSync("git", ["rev-parse", "--local-env-vars"], { encoding: "utf8" });
  if (result.error || result.status !== 0)
    throw new Error("Cannot isolate Git history verification");
  const environment = { ...process.env };
  for (const name of result.stdout.split(/\s+/u).filter(Boolean)) delete environment[name];
  return environment;
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    maxBuffer: 16 * 1024 * 1024,
    env: gitEnvironment()
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      "Published Git Plugin history is unavailable or does not match; fetch main and release tags"
    );
  }
  return result.stdout;
}

function isNewerStable(target, previous) {
  const pattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
  const nextMatch = typeof target === "string" ? pattern.exec(target) : null;
  const oldMatch = typeof previous === "string" ? pattern.exec(previous) : null;
  const next = nextMatch && nextMatch[0] === target ? nextMatch.slice(1).map(BigInt) : null;
  const old = oldMatch && oldMatch[0] === previous ? oldMatch.slice(1).map(BigInt) : null;
  if (!next || !old) return false;
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== old[index]) return next[index] > old[index];
  }
  return false;
}

function snapshot(repositoryRoot, commit, canonicalSkillFiles) {
  if (snapshots.has(commit)) return snapshots.get(commit);
  const metadata = [
    ".agents/plugins/marketplace.json",
    ".claude-plugin/marketplace.json",
    "docs/compatibility/plugin-runtime.json",
    "docs/assets/utsuri.jpg",
    "package.json",
    "packages/cli/package.json",
    ...canonicalSkillFiles.map((name) => `skills/utsuri-review/${name}`)
  ];
  const tree = git(repositoryRoot, [
    "ls-tree",
    "-r",
    "-z",
    commit,
    "--",
    "plugins/utsuri",
    ...metadata
  ]);
  const files = new Map();
  for (const entry of tree.toString("utf8").split("\0").filter(Boolean)) {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/u.exec(entry);
    if (!match) throw new Error("Published Git Plugin snapshot contains a non-regular file");
    files.set(match[3], {
      mode: Number.parseInt(match[1].slice(3), 8),
      bytes: git(repositoryRoot, ["cat-file", "blob", match[2]])
    });
  }
  for (const name of metadata) {
    if (!files.has(name)) throw new Error(`Published Git Plugin snapshot is missing ${name}`);
  }
  snapshots.set(commit, files);
  return files;
}

function json(bytes) {
  return JSON.parse(bytes.toString("utf8"));
}

export function verifyPublishedPluginPreimage({
  root,
  repositoryRoot,
  version,
  targetVersion,
  compatibility,
  canonicalSkillFiles
}) {
  const record = compatibility?.publicGitVerification;
  if (
    !isNewerStable(targetVersion, version) ||
    record?.source !== "hokupod/utsuri" ||
    !/^[a-f0-9]{40}$/u.test(record?.sourceCommit ?? "") ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(record?.verifiedAt ?? "") ||
    record?.pluginVersion !== version ||
    record?.cliPackage !== `@utsu-ri/cli@${version}`
  ) {
    throw new Error(
      "Publication staging requires a newer stable CLI and the verified published Git Plugin identity"
    );
  }
  const baseRecord = json(
    git(repositoryRoot, ["show", "origin/main:docs/compatibility/plugin-runtime.json"])
  ).publicGitVerification;
  if (!isDeepStrictEqual(record, baseRecord)) {
    throw new Error("Publication staging must preserve main's verified public Git record");
  }
  const tag = `refs/tags/v${version}`;
  if (git(repositoryRoot, ["cat-file", "-t", tag]).toString().trim() !== "tag") {
    throw new Error("Published Git Plugin requires an annotated release tag");
  }
  git(repositoryRoot, ["merge-base", "--is-ancestor", `${tag}^{commit}`, record.sourceCommit]);
  git(repositoryRoot, ["merge-base", "--is-ancestor", record.sourceCommit, "origin/main"]);
  const published = snapshot(repositoryRoot, record.sourceCommit, canonicalSkillFiles);
  for (const name of ["package.json", "packages/cli/package.json"]) {
    if (json(published.get(name).bytes).version !== version) {
      throw new Error("Published Git source must bind the exact released CLI version");
    }
  }
  for (const [name, file] of published) {
    if (
      !name.startsWith("plugins/utsuri/") &&
      ![".agents/plugins/marketplace.json", ".claude-plugin/marketplace.json"].includes(name)
    )
      continue;
    const filename = join(root, name);
    const stat = lstatSync(filename);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o777) !== file.mode ||
      !readFileSync(filename).equals(file.bytes)
    ) {
      throw new Error(
        `Publication staging changed the verified public Git Plugin preimage: ${name}`
      );
    }
  }
  const previousDistribution = json(
    published.get("docs/compatibility/plugin-runtime.json").bytes
  ).distribution;
  if (!isDeepStrictEqual(compatibility.distribution, previousDistribution)) {
    throw new Error(
      "Publication staging must preserve the verified Git Plugin distribution identity"
    );
  }
  return {
    canonicalSkill: new Map(
      canonicalSkillFiles.map((name) => [name, published.get(`skills/utsuri-review/${name}`).bytes])
    ),
    canonicalIcon: published.get("docs/assets/utsuri.jpg").bytes
  };
}
