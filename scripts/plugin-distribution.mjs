import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const pluginName = "utsuri";
export const cliPackageName = "@utsu-ri/cli";
export const canonicalSkillFiles = Object.freeze([
  "SKILL.md",
  "agents/openai.yaml",
  "references/capture-modes.md",
  "references/cli-contract.md",
  "references/distribution.md",
  "references/failure-continuation.md",
  "references/feedback.md",
  "references/review-state.md",
  "references/security.md"
]);

const generatedInventoryFile = ".generated.json";
const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const bundledInvocation = 'node "${PLUGIN_ROOT}/skills/utsuri-review/scripts/utsuri.mjs"';
const openAiMcpDependency = [
  "dependencies:",
  "  tools:",
  '    - type: "mcp"',
  '      value: "utsuri"',
  '      description: "Utsuri MCP server"',
  '      transport: "stdio"'
].join("\n");
const secretPatterns = [
  /sk-[A-Za-z0-9_-]{20,}/u,
  /gh[pousr]_[A-Za-z0-9_]{20,}/u,
  /xox[baprs]-[A-Za-z0-9-]{20,}/u,
  /AKIA[0-9A-Z]{16}/u,
  /-----BEGIN (?:RSA |OPENSSH |DSA |EC |PGP )?PRIVATE KEY-----/u
];

export function distributionPaths(root = repositoryRoot) {
  const pluginRoot = join(root, "plugins", pluginName);
  return {
    root,
    packageManifest: join(root, "package.json"),
    cliManifest: join(root, "packages", "cli", "package.json"),
    catalog: join(root, ".agents", "plugins", "marketplace.json"),
    claudeMarketplace: join(root, ".claude-plugin", "marketplace.json"),
    compatibility: join(root, "docs", "compatibility", "plugin-runtime.json"),
    canonicalSkill: join(root, "skills", "utsuri-review"),
    pluginRoot,
    pluginSkill: join(pluginRoot, "skills", "utsuri-review"),
    codexManifest: join(pluginRoot, ".codex-plugin", "plugin.json"),
    codexMcp: join(pluginRoot, ".codex-plugin", "mcp.json"),
    claudeManifest: join(pluginRoot, ".claude-plugin", "plugin.json")
  };
}

export function assertCompleteSemver(value, label = "version") {
  if (typeof value !== "string" || !semverPattern.test(value)) {
    throw new Error(`${label} must be a complete SemVer version`);
  }
  return value;
}

export function parseCliPackagePin(value) {
  if (typeof value !== "string") return undefined;
  const prefix = `${cliPackageName}@`;
  if (!value.startsWith(prefix)) return undefined;
  const version = value.slice(prefix.length);
  if (!semverPattern.test(version)) return undefined;
  return { packageName: cliPackageName, packageVersion: version };
}

export function buildPluginMcpArgs(cliVersion) {
  assertCompleteSemver(cliVersion, "CLI version");
  return ["-y", `--package=${cliPackageName}@${cliVersion}`, "utsuri", "mcp"];
}

export function transformCanonicalToPlugin(relativePath, content, cliVersion) {
  assertCompleteSemver(cliVersion, "CLI version");
  let text = Buffer.isBuffer(content) ? content.toString("utf8") : String(content);
  if (relativePath.endsWith(".md")) {
    text = text
      .split(bundledInvocation)
      .join(`npx -y --package=${cliPackageName}@${cliVersion} utsuri`);
  }
  if (relativePath === "agents/openai.yaml") {
    if (/^dependencies:\s*$/mu.test(text)) {
      throw new Error("Canonical Skill metadata must not declare Plugin-only dependencies");
    }
    text = `${text.trimEnd()}\n\n${openAiMcpDependency}\n`;
  }
  return Buffer.from(text, "utf8");
}

export function expectedPluginSkill(root = repositoryRoot, cliVersion) {
  const paths = distributionPaths(root);
  const files = new Map();
  const sourceDigests = {};
  const generatedDigests = {};
  const aggregate = createHash("sha256");

  for (const relativePath of canonicalSkillFiles) {
    const absolutePath = join(paths.canonicalSkill, relativePath);
    const bytes = readRegularFile(absolutePath, `Canonical Skill ${relativePath}`);
    const generated = transformCanonicalToPlugin(relativePath, bytes, cliVersion);
    const sourceSha256 = sha256(bytes);
    const generatedSha256 = sha256(generated);
    sourceDigests[relativePath] = sourceSha256;
    generatedDigests[relativePath] = generatedSha256;
    aggregate.update(relativePath);
    aggregate.update("\0");
    aggregate.update(sourceSha256);
    aggregate.update("\0");
    files.set(relativePath, generated);
  }

  const inventory = {
    schemaVersion: 1,
    generator: "scripts/plugin-distribution.mjs",
    cliPackagePin: `${cliPackageName}@${cliVersion}`,
    canonicalSha256: aggregate.digest("hex"),
    files: Object.fromEntries(
      canonicalSkillFiles.map((relativePath) => [
        relativePath,
        {
          sourceSha256: sourceDigests[relativePath],
          generatedSha256: generatedDigests[relativePath]
        }
      ])
    )
  };
  files.set(generatedInventoryFile, Buffer.from(`${JSON.stringify(inventory, null, 2)}\n`, "utf8"));
  return { files, inventory };
}

export function syncPluginSkill(root = repositoryRoot) {
  const paths = distributionPaths(root);
  const cliVersion = readDistributionIdentity(root).cliVersion;
  const expected = expectedPluginSkill(root, cliVersion);
  const parent = dirname(paths.pluginSkill);
  mkdirSync(parent, { recursive: true });
  if (existsSync(paths.pluginSkill) && lstatSync(paths.pluginSkill).isSymbolicLink()) {
    throw new Error("Plugin Skill destination must not be a symlink");
  }

  const stageRoot = mkdtempSync(join(parent, ".utsuri-review-sync-"));
  const stage = join(stageRoot, "utsuri-review");
  const backup = join(parent, `.utsuri-review-backup-${process.pid}-${Date.now()}`);
  let movedExisting = false;
  let installed = false;
  try {
    mkdirSync(stage, { recursive: true, mode: 0o700 });
    for (const [relativePath, bytes] of expected.files) {
      const destination = join(stage, relativePath);
      mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
      writeFileSync(destination, bytes, { flag: "wx", mode: 0o644 });
    }
    verifyPluginSkill(stage, expected);
    if (existsSync(paths.pluginSkill)) {
      renameSync(paths.pluginSkill, backup);
      movedExisting = true;
    }
    renameSync(stage, paths.pluginSkill);
    installed = true;
    verifyPluginSkill(paths.pluginSkill, expected);
    if (movedExisting) rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (installed && existsSync(paths.pluginSkill)) {
      rmSync(paths.pluginSkill, { recursive: true, force: true });
    }
    if (movedExisting && existsSync(backup)) {
      renameSync(backup, paths.pluginSkill);
    }
    throw error;
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
  return expected.inventory;
}

export function verifyPluginDistribution(options = {}) {
  const root = options.root ?? repositoryRoot;
  const paths = distributionPaths(root);
  const failures = [];
  const transactionArtifacts = validateTransactionArtifacts(
    options.transactionArtifacts,
    paths,
    failures
  );
  const packageManifest = readJson(paths.packageManifest, "package.json", failures);
  const cliManifest = readJson(paths.cliManifest, "CLI package", failures);
  const catalog = readJson(paths.catalog, "Codex marketplace", failures);
  const claudeMarketplace = readJson(paths.claudeMarketplace, "Claude marketplace", failures);
  const codexManifest = readJson(paths.codexManifest, "Codex manifest", failures);
  const codexMcp = readJson(paths.codexMcp, "Codex MCP config", failures);
  const claudeManifest = readJson(paths.claudeManifest, "Claude manifest", failures);
  const compatibility = readJson(paths.compatibility, "Compatibility record", failures);

  validateCatalog(catalog, paths, failures);
  validateClaudeMarketplace(claudeMarketplace, failures);
  validatePluginManifests(codexManifest, claudeManifest, paths, failures);
  const codexVersion = validateCodexMcp(codexMcp, failures);
  const claudeVersion = validateClaudeMcp(claudeManifest, failures);
  validateVersions(
    {
      packageManifest,
      cliManifest,
      codexManifest,
      claudeManifest,
      claudeMarketplace,
      compatibility,
      codexVersion,
      claudeVersion
    },
    failures,
    { allowRootReleaseSkew: options.allowRootReleaseSkew === true }
  );
  validateDistributionSafety(paths, failures, transactionArtifacts);

  if (codexVersion) {
    try {
      verifyPluginSkill(
        paths.pluginSkill,
        expectedPluginSkill(root, codexVersion),
        transactionArtifacts
      );
    } catch (error) {
      failures.push(errorMessage(error));
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Plugin distribution verification failed:\n${failures
        .map((failure) => `- ${failure}`)
        .join("\n")}`
    );
  }

  return {
    pluginId: "utsuri@utsuri",
    pluginVersion: codexManifest.version,
    packageName: cliPackageName,
    cliVersion: codexVersion,
    sourcePath: "./plugins/utsuri",
    canonicalSha256: expectedPluginSkill(root, codexVersion).inventory.canonicalSha256
  };
}

export function readDistributionIdentity(root = repositoryRoot) {
  const paths = distributionPaths(root);
  const codexManifest = JSON.parse(readFileSync(paths.codexManifest, "utf8"));
  const codexMcp = JSON.parse(readFileSync(paths.codexMcp, "utf8"));
  const cliPin = codexMcp?.utsuri?.args?.[1];
  const parsed = parseCliPackagePin(
    typeof cliPin === "string" && cliPin.startsWith("--package=")
      ? cliPin.slice("--package=".length)
      : undefined
  );
  if (!parsed) throw new Error("Codex MCP package pin is not exact");
  return {
    pluginVersion: assertCompleteSemver(codexManifest.version, "Plugin version"),
    cliVersion: parsed.packageVersion
  };
}

function validateCatalog(catalog, paths, failures) {
  const plugin = catalog?.plugins?.[0];
  if (
    catalog?.name !== pluginName ||
    catalog?.interface?.displayName !== "Utsuri" ||
    !Array.isArray(catalog?.plugins) ||
    catalog.plugins.length !== 1 ||
    plugin?.name !== pluginName ||
    plugin?.source?.source !== "local" ||
    plugin?.source?.path !== "./plugins/utsuri" ||
    plugin?.policy?.installation !== "AVAILABLE" ||
    plugin?.policy?.authentication !== "ON_USE" ||
    plugin?.category !== "Engineering"
  ) {
    failures.push("Codex marketplace catalog does not match the required shape");
  }
  validateContainedRelativePath(
    paths.root,
    plugin?.source?.path,
    paths.pluginRoot,
    "Codex marketplace source",
    failures
  );
}

function validateClaudeMarketplace(marketplace, failures) {
  const plugin = marketplace?.plugins?.[0];
  if (
    marketplace?.name !== pluginName ||
    marketplace?.owner?.name !== "hokupod" ||
    !Array.isArray(marketplace?.plugins) ||
    marketplace.plugins.length !== 1 ||
    plugin?.name !== pluginName ||
    plugin?.source !== "./plugins/utsuri" ||
    plugin?.author?.name !== "hokupod"
  ) {
    failures.push("Claude marketplace catalog does not match the required shape");
  }
  try {
    assertCompleteSemver(plugin?.version, "Claude catalog Plugin version");
    assertCompleteSemver(marketplace?.metadata?.version, "Claude marketplace metadata version");
  } catch (error) {
    failures.push(errorMessage(error));
  }
}

function validatePluginManifests(codex, claude, paths, failures) {
  for (const [label, manifest] of [
    ["Codex", codex],
    ["Claude", claude]
  ]) {
    if (
      manifest?.name !== pluginName ||
      manifest?.skills !== "./skills/" ||
      typeof manifest?.description !== "string" ||
      typeof manifest?.repository !== "string" ||
      typeof manifest?.license !== "string"
    ) {
      failures.push(`${label} Plugin manifest does not match the required shape`);
    }
    try {
      assertCompleteSemver(manifest?.version, `${label} Plugin version`);
    } catch (error) {
      failures.push(errorMessage(error));
    }
  }
  if (codex?.mcpServers !== "./.codex-plugin/mcp.json") {
    failures.push("Codex Plugin manifest must reference its MCP config");
  }
  validateContainedRelativePath(
    paths.pluginRoot,
    codex?.skills,
    join(paths.pluginRoot, "skills"),
    "Codex skills path",
    failures
  );
  validateContainedRelativePath(
    paths.pluginRoot,
    codex?.mcpServers,
    paths.codexMcp,
    "Codex MCP path",
    failures
  );
  validateContainedRelativePath(
    paths.pluginRoot,
    claude?.skills,
    join(paths.pluginRoot, "skills"),
    "Claude skills path",
    failures
  );
  if (existsSync(join(paths.pluginRoot, ".mcp.json"))) {
    failures.push("Plugin root must not contain .mcp.json");
  }
}

function validateCodexMcp(mcp, failures) {
  const server = mcp?.utsuri;
  if (
    !server ||
    Object.keys(mcp).length !== 1 ||
    server.command !== "npx" ||
    !Array.isArray(server.args) ||
    server.args.length !== 4 ||
    JSON.stringify(server.env_vars) !== JSON.stringify(["CODEX_THREAD_ID"])
  ) {
    failures.push("Codex MCP config does not match the bounded stdio contract");
    return undefined;
  }
  return validateMcpArgs(server.args, "Codex", failures);
}

function validateClaudeMcp(manifest, failures) {
  const servers = manifest?.mcpServers;
  const server = servers?.utsuri;
  if (
    !server ||
    Object.keys(servers).length !== 1 ||
    server.command !== "npx" ||
    !Array.isArray(server.args) ||
    server.args.length !== 4 ||
    JSON.stringify(server.env) !== JSON.stringify({ CODEX_THREAD_ID: "" })
  ) {
    failures.push("Claude MCP config does not match the bounded stdio contract");
    return undefined;
  }
  return validateMcpArgs(server.args, "Claude", failures);
}

function validateMcpArgs(args, label, failures) {
  if (args[0] !== "-y" || args[2] !== "utsuri" || args[3] !== "mcp") {
    failures.push(`${label} MCP args do not match the required native npx command`);
    return undefined;
  }
  const value = args[1];
  const parsed = parseCliPackagePin(
    typeof value === "string" && value.startsWith("--package=")
      ? value.slice("--package=".length)
      : undefined
  );
  if (!parsed) {
    failures.push(`${label} MCP package must be an exact @utsu-ri/cli SemVer pin`);
    return undefined;
  }
  if (JSON.stringify(args) !== JSON.stringify(buildPluginMcpArgs(parsed.packageVersion))) {
    failures.push(`${label} MCP args contain an unexpected option`);
    return undefined;
  }
  return parsed.packageVersion;
}

function validateVersions(values, failures, options = {}) {
  const pluginVersions = [
    values.codexManifest?.version,
    values.claudeManifest?.version,
    values.claudeMarketplace?.metadata?.version,
    values.claudeMarketplace?.plugins?.[0]?.version,
    values.compatibility?.distribution?.pluginVersion
  ];
  if (new Set(pluginVersions).size !== 1) {
    failures.push("Plugin versions are not synchronized");
  }
  const cliVersions = [
    values.codexVersion,
    values.claudeVersion,
    values.compatibility?.distribution?.cliVersion
  ];
  if (new Set(cliVersions).size !== 1) {
    failures.push("CLI versions and MCP pins are not synchronized");
  }
  const distributionVersions = [...pluginVersions, ...cliVersions];
  if (new Set(distributionVersions).size !== 1) {
    failures.push("Plugin versions and MCP CLI pins are not synchronized");
  }
  const releaseVersions = [
    ...distributionVersions,
    values.packageManifest?.version,
    values.cliManifest?.version
  ];
  if (!options.allowRootReleaseSkew && new Set(releaseVersions).size !== 1) {
    failures.push("Plugin, CLI, and root versions are not synchronized");
  }
  if (values.cliManifest?.name !== cliPackageName) {
    failures.push(`CLI package name must be ${cliPackageName}`);
  }
  try {
    assertCompleteSemver(values.packageManifest?.version, "Root package version");
    assertCompleteSemver(values.cliManifest?.version, "CLI package version");
  } catch (error) {
    failures.push(errorMessage(error));
  }
  if (values.packageManifest?.version !== values.cliManifest?.version) {
    failures.push("Root and CLI package versions are not synchronized");
  }
  const expectedPin = `${cliPackageName}@${values.codexVersion ?? ""}`;
  if (values.compatibility?.distribution?.mcpPackagePin !== expectedPin) {
    failures.push("Compatibility record MCP package pin is not synchronized");
  }
}

function validateDistributionSafety(paths, failures, transactionArtifacts = new Set()) {
  const pluginEntries = listTreeFiles(paths.pluginRoot, failures, transactionArtifacts);
  const expected = [
    ".claude-plugin/plugin.json",
    ".codex-plugin/mcp.json",
    ".codex-plugin/plugin.json",
    ...canonicalSkillFiles.map((path) => `skills/utsuri-review/${path}`),
    `skills/utsuri-review/${generatedInventoryFile}`
  ].sort();
  if (JSON.stringify(pluginEntries) !== JSON.stringify(expected)) {
    failures.push(`Git Plugin inventory mismatch; expected only ${expected.join(", ")}`);
  }
  for (const relativePath of pluginEntries) {
    if (
      relativePath.split("/").includes("ai") ||
      relativePath.endsWith("utsuri.mjs") ||
      relativePath.includes("/native/") ||
      relativePath.includes("/assets/") ||
      relativePath.includes("/schemas/") ||
      relativePath.includes("/metadata/")
    ) {
      failures.push(`Git Plugin contains a forbidden artifact: ${relativePath}`);
    }
    const absolutePath = join(paths.pluginRoot, relativePath);
    const bytes = readFileSync(absolutePath);
    if (bytes.length > 256 * 1024) {
      failures.push(`Git Plugin file is too large: ${relativePath}`);
      continue;
    }
    if (bytes.includes(0)) {
      failures.push(`Git Plugin file contains NUL: ${relativePath}`);
      continue;
    }
    const text = bytes.toString("utf8");
    if (text.includes(paths.root) || /(?:\/Users\/|\/private\/var\/folders\/)/u.test(text)) {
      failures.push(`Git Plugin contains an absolute local path: ${relativePath}`);
    }
    for (const pattern of secretPatterns) {
      if (pattern.test(text)) {
        failures.push(`Git Plugin contains a secret-like value: ${relativePath}`);
      }
    }
  }
}

function verifyPluginSkill(skillRoot, expected, transactionArtifacts = new Set()) {
  const failures = [];
  const actual = listTreeFiles(skillRoot, failures, transactionArtifacts);
  const expectedNames = [...expected.files.keys()].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expectedNames)) {
    failures.push(`Generated Skill inventory drift; expected ${expectedNames.join(", ")}`);
  }
  for (const [relativePath, expectedBytes] of expected.files) {
    const filename = join(skillRoot, relativePath);
    if (!existsSync(filename)) continue;
    const actualBytes = readFileSync(filename);
    if (!actualBytes.equals(expectedBytes)) {
      failures.push(`Generated Skill drift: ${relativePath}`);
    }
  }
  if (failures.length > 0) throw new Error(failures.join("; "));
}

function listTreeFiles(root, failures = [], transactionArtifacts = new Set()) {
  const files = [];
  if (!existsSync(root)) {
    failures.push(`Missing directory: ${root}`);
    return files;
  }
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    failures.push(`Directory must be regular and non-symlink: ${root}`);
    return files;
  }
  function visit(directory, prefix) {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = join(directory, entry.name);
      if (transactionArtifacts.has(absolutePath)) continue;
      const stat = lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        failures.push(`Distribution path must not be a symlink: ${relativePath}`);
      } else if (stat.isDirectory()) {
        visit(absolutePath, relativePath);
      } else if (stat.isFile()) {
        files.push(relativePath);
      } else {
        failures.push(`Distribution path must be a regular file: ${relativePath}`);
      }
    }
  }
  visit(root, "");
  return files.sort();
}

function validateTransactionArtifacts(values, paths, failures) {
  if (values === undefined) return new Set();
  if (!Array.isArray(values)) {
    failures.push("Promotion transaction artifact allowance is invalid");
    return new Set();
  }

  const declaredTargets = new Set([
    paths.catalog,
    paths.claudeMarketplace,
    paths.codexManifest,
    paths.codexMcp,
    paths.claudeManifest,
    paths.compatibility,
    ...canonicalSkillFiles.map((path) => join(paths.pluginSkill, path)),
    join(paths.pluginSkill, generatedInventoryFile)
  ]);
  const backups = new Set();
  const targets = new Set();
  for (const entry of values) {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.path !== "string" ||
      typeof entry.backup !== "string" ||
      !isAbsolute(entry.path) ||
      !isAbsolute(entry.backup) ||
      !Buffer.isBuffer(entry.current) ||
      !Number.isInteger(entry.mode) ||
      entry.mode < 0 ||
      entry.mode > 0o777
    ) {
      failures.push("Promotion transaction artifact allowance is invalid");
      return new Set();
    }
    const target = resolve(entry.path);
    const backup = resolve(entry.backup);
    const prefix = `.${basename(target)}.plugin-promote-backup-`;
    const suffix = basename(backup).slice(prefix.length);
    if (
      !declaredTargets.has(target) ||
      dirname(backup) !== dirname(target) ||
      !basename(backup).startsWith(prefix) ||
      !/^\d+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(suffix) ||
      targets.has(target) ||
      backups.has(backup)
    ) {
      failures.push("Promotion transaction artifact allowance is invalid");
      return new Set();
    }
    let stat;
    try {
      stat = lstatSync(backup);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        (stat.mode & 0o777) !== entry.mode ||
        !readFileSync(backup).equals(entry.current)
      ) {
        throw new Error("invalid transaction artifact");
      }
    } catch {
      failures.push("Promotion transaction artifact allowance is invalid");
      return new Set();
    }
    targets.add(target);
    backups.add(backup);
  }
  return backups;
}

function validateContainedRelativePath(base, value, expected, label, failures) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    isAbsolute(value) ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    failures.push(`${label} must be a contained relative path`);
    return;
  }
  const resolved = resolve(base, value);
  const rel = relative(base, resolved);
  if (rel === ".." || rel.startsWith(`..${sep}`) || resolved !== expected) {
    failures.push(`${label} must resolve to ${expected}`);
  }
}

function readJson(path, label, failures) {
  try {
    return JSON.parse(readRegularFile(path, label).toString("utf8"));
  } catch (error) {
    failures.push(`${label}: ${errorMessage(error)}`);
    return undefined;
  }
}

function readRegularFile(path, label) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file`);
  }
  return readFileSync(path);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length === 3 && process.argv[2] === "--sync-skill") {
      const inventory = syncPluginSkill();
      process.stdout.write(
        `${JSON.stringify({ ok: true, canonicalSha256: inventory.canonicalSha256 })}\n`
      );
    } else if (process.argv.length === 2) {
      const result = verifyPluginDistribution();
      process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
    } else {
      process.stderr.write("Usage: node scripts/plugin-distribution.mjs [--sync-skill]\n");
      process.exitCode = 2;
    }
  } catch (error) {
    process.stderr.write(`${errorMessage(error)}\n`);
    process.exitCode = 1;
  }
}
