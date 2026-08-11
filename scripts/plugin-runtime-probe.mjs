#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { arch, platform, release, tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const exactVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const syntheticCodexThreadId = "00000000-0000-4000-8000-000000000146";
const syntheticClaudeSessionId = "00000000-0000-4000-8000-000000000220";
const deniedSentinel = "utsuri-plugin-probe-denied";

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.localE2e) {
    const result = await runLocalPluginE2e();
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const result = await runPluginRuntimeProbe(options);
  if (options.record) updateCompatibilityRecord(resolve(options.record), result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

export async function runPluginRuntimeProbe(options) {
  assertOptions(options);
  const root = mkdtempSync(join(tmpdir(), `utsuri-${options.host}-plugin-probe-`));
  const marketplace = join(root, "marketplace");
  const home = join(root, "home");
  const codexHome = join(root, "codex-home");
  const workspace = join(root, "workspace");
  const observation = join(root, "observation.json");
  for (const directory of [marketplace, home, codexHome, workspace]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  try {
    writeFixture({ marketplace, observation });
    const common = { root, marketplace, home, codexHome, workspace, observation };
    const result =
      options.host === "codex"
        ? await probeCodex(common, options.version)
        : await probeClaude(common, options.version);
    return {
      schemaVersion: 1,
      verifiedAt: localDate(),
      host: options.host,
      version: result.version,
      os: { platform: platform(), release: release(), arch: arch() },
      contract: result.contract
    };
  } finally {
    if (!options.keep) rmSync(root, { recursive: true, force: true });
    else process.stderr.write(`probe kept at ${root}\n`);
  }
}

export async function runLocalPluginE2e() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "utsuri-local-plugin-e2e-")));
  const bin = join(root, "bin");
  const observation = join(root, "mcp-observations.ndjson");
  const codex = {
    home: join(root, "codex-home"),
    codexHome: join(root, "codex-config"),
    workspace: join(root, "codex-workspace")
  };
  const claude = {
    home: join(root, "claude-home"),
    workspace: join(root, "claude-workspace")
  };
  const foreignWorkspace = join(root, "foreign-workspace");
  for (const directory of [
    bin,
    codex.home,
    codex.codexHome,
    codex.workspace,
    claude.home,
    claude.workspace,
    foreignWorkspace
  ]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  const cli = join(repositoryRoot, "packages", "cli", "dist", "utsuri.mjs");
  if (!existsSync(cli)) throw new Error("LOCAL_E2E_BUILD_REQUIRED");
  writeLocalNpxShim(join(bin, "npx"), cli, observation);
  const pathValue = `${bin}${delimiter}${process.env.PATH ?? ""}`;
  const codexSession = syntheticCodexThreadId;
  const claudeSession = syntheticClaudeSessionId;
  const deniedValue = "synthetic-local-e2e-denied";

  try {
    const codexVersion = versionFrom(
      run("codex", ["--version"], codex.workspace, safeHostEnvironment()).stdout,
      /^codex-cli\s+/u
    );
    const claudeVersion = versionFrom(
      run("claude", ["--version"], claude.workspace, safeHostEnvironment()).stdout
    );
    assertVersion("Codex", codexVersion, "0.146.0");
    assertVersion("Claude Code", claudeVersion, "2.1.220");

    const baseCodexEnvironment = {
      ...safeHostEnvironment(),
      PATH: pathValue,
      HOME: codex.home,
      CODEX_HOME: codex.codexHome,
      CODEX_THREAD_ID: codexSession,
      UTSURI_PROBE_DENIED_SENTINEL: deniedValue
    };
    const baseClaudeEnvironment = {
      ...safeHostEnvironment(),
      PATH: pathValue,
      HOME: claude.home,
      CLAUDE_CONFIG_DIR: join(claude.home, ".claude"),
      CODEX_THREAD_ID: codexSession,
      UTSURI_PROBE_DENIED_SENTINEL: deniedValue
    };

    const zero = runBrokerMcp(
      cli,
      codex.workspace,
      {
        ...safeHostEnvironment(),
        CODEX_THREAD_ID: codexSession,
        UTSURI_PROBE_DENIED_SENTINEL: deniedValue
      },
      {},
      "ZERO"
    );
    assertBrokerResponse(zero, "MCP_RUN_UNAVAILABLE");
    assertSafeBrokerOutput(zero, [codex.workspace, codexSession, deniedValue]);

    const first = finalizeSyntheticRun(cli, codex.workspace, "run-one", {
      CODEX_THREAD_ID: codexSession,
      UTSURI_PROBE_DENIED_SENTINEL: deniedValue
    });
    const one = runBrokerMcp(
      cli,
      codex.workspace,
      {
        ...safeHostEnvironment(),
        CODEX_THREAD_ID: codexSession,
        UTSURI_PROBE_DENIED_SENTINEL: deniedValue
      },
      {},
      "ONE"
    );
    const oneResult = brokerCallResult(one);
    if (oneResult?.reportId !== first.reportId) throw new Error("LOCAL_E2E_ONE_FAILED");
    assertSafeBrokerOutput(one, [codex.workspace, codexSession, deniedValue]);

    const second = finalizeSyntheticRun(cli, codex.workspace, "run-two", {
      CODEX_THREAD_ID: codexSession,
      UTSURI_PROBE_DENIED_SENTINEL: deniedValue
    });
    const multiple = runBrokerMcp(
      cli,
      codex.workspace,
      {
        ...safeHostEnvironment(),
        CODEX_THREAD_ID: codexSession
      },
      {},
      "MULTIPLE"
    );
    assertBrokerResponse(multiple, "MCP_RUN_AMBIGUOUS");
    const exact = runBrokerMcp(
      cli,
      codex.workspace,
      { ...safeHostEnvironment(), CODEX_THREAD_ID: codexSession },
      { report_id: second.reportId },
      "EXACT"
    );
    if (brokerCallResult(exact)?.reportId !== second.reportId) {
      throw new Error("LOCAL_E2E_EXACT_SELECTION_FAILED");
    }

    const crossSession = runBrokerMcp(
      cli,
      codex.workspace,
      {
        ...safeHostEnvironment(),
        CODEX_THREAD_ID: "00000000-0000-4000-8000-000000000999"
      },
      {},
      "CROSS_SESSION"
    );
    assertBrokerResponse(crossSession, "MCP_RUN_UNAVAILABLE");
    const crossHost = runBrokerMcp(
      cli,
      codex.workspace,
      {
        ...safeHostEnvironment(),
        CODEX_THREAD_ID: "",
        CLAUDE_PROJECT_DIR: codex.workspace,
        CLAUDE_CODE_SESSION_ID: claudeSession
      },
      {},
      "CROSS_HOST"
    );
    assertBrokerResponse(crossHost, "MCP_RUN_UNAVAILABLE");

    cpSync(join(codex.workspace, ".artifacts"), join(foreignWorkspace, ".artifacts"), {
      recursive: true,
      dereference: false
    });
    for (const runName of ["run-one", "run-two"]) {
      cpSync(join(codex.workspace, runName), join(foreignWorkspace, runName), {
        recursive: true,
        dereference: false
      });
    }
    const crossProject = runBrokerMcp(
      cli,
      foreignWorkspace,
      {
        ...safeHostEnvironment(),
        CODEX_THREAD_ID: codexSession
      },
      {},
      "CROSS_PROJECT"
    );
    assertBrokerResponse(crossProject, "MCP_RUN_UNAVAILABLE");
    for (const responses of [multiple, exact]) {
      assertSafeBrokerOutput(responses, [
        codex.workspace,
        foreignWorkspace,
        codexSession,
        claudeSession,
        deniedValue
      ]);
    }
    for (const responses of [crossSession, crossHost, crossProject]) {
      assertSafeBrokerOutput(responses, [
        codex.workspace,
        foreignWorkspace,
        codexSession,
        claudeSession,
        deniedValue,
        first.reportId,
        second.reportId
      ]);
    }

    const codexHost = await verifyLocalCodexPlugin({
      ...codex,
      environment: baseCodexEnvironment,
      observation
    });
    const claudeHost = await verifyLocalClaudePlugin({
      ...claude,
      environment: baseClaudeEnvironment,
      observation,
      session: claudeSession
    });

    const registrations = join(codex.workspace, ".artifacts", "utsuri", "mcp", "registrations");
    const files = readdirSync(registrations)
      .filter((name) => /^[a-f0-9]{64}\.json$/u.test(name))
      .sort();
    if (files.length !== 2) throw new Error("LOCAL_E2E_REGISTRATION_COUNT_FAILED");
    const selected = files.find((name) => {
      const registration = JSON.parse(readFileSync(join(registrations, name), "utf8"));
      return registration.reportId === second.reportId;
    });
    if (!selected) throw new Error("LOCAL_E2E_REGISTRATION_SELECTION_FAILED");
    const swapped = JSON.parse(readFileSync(join(registrations, selected), "utf8"));
    swapped.runPath = swapped.runPath === "run-one" ? "run-two" : "run-one";
    writeJson(join(registrations, selected), swapped);
    const stale = runBrokerMcp(
      cli,
      codex.workspace,
      { ...safeHostEnvironment(), CODEX_THREAD_ID: codexSession },
      { report_id: second.reportId },
      "STALE"
    );
    const staleId = brokerErrorId(stale);
    if (
      !new Set([
        "MCP_REGISTRATION_CONFLICT",
        "MCP_REGISTRATION_REPORT_CHANGED",
        "MCP_REGISTRATION_BINDING_CHANGED"
      ]).has(staleId)
    ) {
      throw new Error("LOCAL_E2E_STALE_FALLBACK_FAILED");
    }
    assertSafeBrokerOutput(stale, [codex.workspace, codexSession, claudeSession, deniedValue]);

    return {
      ok: true,
      packageResolution: "local-unpublished-exact-pin-standin",
      versions: { codex: codexVersion, claude: claudeVersion },
      codex: codexHost,
      claude: claudeHost,
      broker: {
        zero: "MCP_RUN_UNAVAILABLE",
        one: true,
        multiple: "MCP_RUN_AMBIGUOUS",
        exactSelection: true,
        crossSession: "MCP_RUN_UNAVAILABLE",
        crossHost: "MCP_RUN_UNAVAILABLE",
        crossProject: "MCP_RUN_UNAVAILABLE",
        staleRegistrationBlocksFallback: staleId
      },
      outputSafety: true,
      isolatedStateRemoved: true
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function verifyLocalCodexPlugin(paths) {
  const added = runJson(
    "codex",
    ["plugin", "marketplace", "add", repositoryRoot, "--json"],
    paths.workspace,
    paths.environment
  );
  const before = pluginEntry(
    runJson(
      "codex",
      ["plugin", "list", "--marketplace", "utsuri", "--available", "--json"],
      paths.workspace,
      paths.environment
    ),
    "utsuri@utsuri"
  );
  const installed = runJson(
    "codex",
    ["plugin", "add", "utsuri@utsuri", "--json"],
    paths.workspace,
    paths.environment
  );
  const after = pluginEntry(
    runJson(
      "codex",
      ["plugin", "list", "--marketplace", "utsuri", "--json"],
      paths.workspace,
      paths.environment
    ),
    "utsuri@utsuri"
  );
  const observationBefore = observationCount(paths.observation);
  const enabledStatus = await runCodexAppServer(paths.workspace, paths.environment);
  const enabledObservation = readLastObservation(paths.observation);
  if (
    !enabledObservation?.cwdIsExpected ||
    !enabledObservation?.codexThreadPresent ||
    enabledObservation?.claudeProjectPresent ||
    enabledObservation?.claudeSessionPresent ||
    enabledObservation?.ambientDeniedPresent
  ) {
    throw new Error("LOCAL_E2E_CODEX_IDENTITY_FAILED");
  }

  const config = join(paths.environment.CODEX_HOME, "config.toml");
  const original = readFileSync(config, "utf8");
  const disabled = original.replace(
    /(\[plugins\."utsuri@utsuri"\]\nenabled = )(?:true|false)/u,
    "$1false"
  );
  if (disabled === original) throw new Error("LOCAL_E2E_CODEX_DISABLE_STATE_MISSING");
  writeFileSync(config, disabled, { encoding: "utf8", mode: 0o600 });
  const disabledStatus = await runCodexAppServer(paths.workspace, paths.environment);
  const afterDisableObservation = observationCount(paths.observation);
  const removed = runJson(
    "codex",
    ["plugin", "remove", "utsuri@utsuri", "--json"],
    paths.workspace,
    paths.environment
  );
  const removedStatus = await runCodexAppServer(paths.workspace, paths.environment);
  const afterRemoveObservation = observationCount(paths.observation);

  const contract = {
    marketplaceListed: added.marketplaceName === "utsuri" && before.installed === false,
    installed: installed.pluginId === "utsuri@utsuri" && after.installed === true,
    enabled: after.enabled === true,
    mcpDiscovered: enabledStatus.serverFound,
    toolsListed: enabledStatus.toolNames.length === 6,
    disabledStopsMcp:
      !disabledStatus.serverFound && afterDisableObservation === observationBefore + 1,
    removed: removed.pluginId === "utsuri@utsuri",
    removedStopsMcp:
      !removedStatus.serverFound && afterRemoveObservation === afterDisableObservation
  };
  assertBooleanContract("Codex local Plugin", contract);
  return contract;
}

async function verifyLocalClaudePlugin(paths) {
  run(
    "claude",
    ["plugin", "validate", repositoryRoot, "--strict"],
    paths.workspace,
    paths.environment
  );
  run(
    "claude",
    ["plugin", "validate", join(repositoryRoot, "plugins", "utsuri"), "--strict"],
    paths.workspace,
    paths.environment
  );
  run(
    "claude",
    ["plugin", "marketplace", "add", repositoryRoot, "--scope", "user"],
    paths.workspace,
    paths.environment
  );
  run(
    "claude",
    ["plugin", "install", "utsuri@utsuri", "--scope", "user"],
    paths.workspace,
    paths.environment
  );
  const installedList = run(
    "claude",
    ["plugin", "list"],
    paths.workspace,
    paths.environment
  ).stdout;
  const before = observationCount(paths.observation);
  const toolsBefore = toolsListObservationCount(paths.observation);
  await runClaudeSessionProbe(
    paths.workspace,
    paths.environment,
    paths.session,
    () =>
      observationCount(paths.observation) === before + 1 &&
      toolsListObservationCount(paths.observation) === toolsBefore + 1
  );
  const afterEnabled = observationCount(paths.observation);
  const observed = readLastObservation(paths.observation);
  run(
    "claude",
    ["plugin", "disable", "utsuri@utsuri", "--scope", "user"],
    paths.workspace,
    paths.environment
  );
  const disabledList = run("claude", ["plugin", "list"], paths.workspace, paths.environment).stdout;
  runStatus(
    "claude",
    ["--session-id", paths.session, "mcp", "get", "plugin:utsuri:utsuri"],
    paths.workspace,
    paths.environment
  );
  const afterDisabled = observationCount(paths.observation);
  run(
    "claude",
    ["plugin", "uninstall", "utsuri@utsuri", "--scope", "user"],
    paths.workspace,
    paths.environment
  );
  const removedList = run("claude", ["plugin", "list"], paths.workspace, paths.environment).stdout;
  runStatus(
    "claude",
    ["--session-id", paths.session, "mcp", "get", "plugin:utsuri:utsuri"],
    paths.workspace,
    paths.environment
  );
  const afterRemoved = observationCount(paths.observation);

  const contract = {
    marketplaceListed: true,
    installed: /utsuri@utsuri/u.test(installedList),
    enabled: afterEnabled === before + 1,
    mcpDiscovered: afterEnabled === before + 1,
    toolsListed: toolsListObservationCount(paths.observation) === toolsBefore + 1,
    projectDirectoryForwarded: observed?.claudeProjectPresent === true,
    sessionInputForwarded: observed?.claudeSessionPresent === true,
    sessionInputMatchesHostArgument: observed?.claudeSessionMatchesSynthetic === true,
    projectDirectoryMatchesCwd: observed?.claudeProjectMatchesCwd === true,
    codexThreadCleared: observed?.codexThreadCleared === true,
    ambientDeniedInheritedHostLimitation: observed?.ambientDeniedPresent === true,
    disabled:
      /utsuri@utsuri/u.test(disabledList) &&
      /disabled/iu.test(disabledList) &&
      afterDisabled === afterEnabled,
    removed: !/utsuri@utsuri/u.test(removedList),
    removedStopsMcp: afterRemoved === afterDisabled
  };
  assertBooleanContract("Claude local Plugin", contract);
  return contract;
}

function writeLocalNpxShim(path, cli, observation) {
  const source = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
const { spawn } = require("node:child_process");
const expected = ["-y", "--package=@utsu-ri/cli@0.2.0", "utsuri", "mcp"];
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(expected)) process.exit(64);
appendFileSync(${JSON.stringify(observation)}, JSON.stringify({
  kind: "launch",
  cwdIsExpected: process.cwd().endsWith("-workspace"),
  codexThreadPresent: Boolean(process.env.CODEX_THREAD_ID),
  codexThreadCleared: process.env.CODEX_THREAD_ID === "",
  claudeProjectPresent: Boolean(process.env.CLAUDE_PROJECT_DIR),
  claudeSessionPresent: Boolean(process.env.CLAUDE_CODE_SESSION_ID),
  claudeProjectMatchesCwd: process.env.CLAUDE_PROJECT_DIR === process.cwd(),
  claudeSessionMatchesSynthetic: process.env.CLAUDE_CODE_SESSION_ID === ${JSON.stringify(syntheticClaudeSessionId)},
  ambientDeniedPresent: Boolean(process.env.UTSURI_PROBE_DENIED_SENTINEL)
}) + "\\n", { mode: 0o600 });
const child = spawn(process.execPath, [${JSON.stringify(cli)}, "mcp"], {
  cwd: process.cwd(), env: process.env, stdio: ["pipe", "pipe", "inherit"]
});
let requestBuffer = "";
let toolsListRecorded = false;
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  child.stdin.write(chunk);
  requestBuffer += chunk;
  for (;;) {
    const newline = requestBuffer.indexOf("\\n");
    if (newline === -1) break;
    const line = requestBuffer.slice(0, newline).trim();
    requestBuffer = requestBuffer.slice(newline + 1);
    if (!line || toolsListRecorded) continue;
    try {
      if (JSON.parse(line).method === "tools/list") {
        toolsListRecorded = true;
        appendFileSync(
          ${JSON.stringify(observation)},
          JSON.stringify({ kind: "tools-list" }) + "\\n",
          { mode: 0o600 }
        );
      }
    } catch {}
  }
});
process.stdin.on("end", () => child.stdin.end());
child.stdout.pipe(process.stdout);
child.once("error", () => process.exit(70));
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
`;
  writeFileSync(path, source, { encoding: "utf8", mode: 0o700 });
  chmodSync(path, 0o700);
}

function finalizeSyntheticRun(cli, workspace, name, environment) {
  const runDirectory = join(workspace, name);
  mkdirSync(runDirectory, { mode: 0o700 });
  writeJson(join(runDirectory, "input.json"), { mode: "empty", probe: name });
  const result = runStatus(
    process.execPath,
    [cli, "finalize", "--run", name, "--json"],
    workspace,
    { ...safeHostEnvironment(), ...environment }
  );
  if (result.status !== 0 || result.stderr !== "") {
    throw new Error("LOCAL_E2E_FINALIZE_FAILED");
  }
  const lines = result.stdout.trim().split(/\r?\n/u);
  if (lines.length !== 1) throw new Error("LOCAL_E2E_FINALIZE_OUTPUT_INVALID");
  const value = JSON.parse(lines[0]);
  if (!value.ok || value.mcpRegistration !== "registered") {
    throw new Error("LOCAL_E2E_REGISTRATION_FAILED");
  }
  return value;
}

function runBrokerMcp(cli, workspace, environment, toolArguments = {}, stage = "UNKNOWN") {
  const input = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", id: 2, method: "ping", params: {} },
    { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} },
    {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "review_list_batches", arguments: toolArguments }
    }
  ]
    .map((value) => JSON.stringify(value))
    .join("\n");
  const result = spawnSyncWithInput(
    process.execPath,
    [cli, "mcp"],
    workspace,
    environment,
    `${input}\n`
  );
  if (result.status !== 0 || result.stderr !== "") {
    throw new Error(`LOCAL_E2E_MCP_TRANSPORT_FAILED_${stage}_${result.status ?? "SIGNAL"}`);
  }
  const lines = result.stdout.trim().split(/\r?\n/u);
  if (lines.length !== 4) throw new Error("LOCAL_E2E_MCP_FRAMING_FAILED");
  const responses = lines.map((line) => JSON.parse(line));
  if (responses[2]?.result?.tools?.length !== 6) {
    throw new Error("LOCAL_E2E_MCP_TOOLS_FAILED");
  }
  return responses;
}

function spawnSyncWithInput(command, args, cwd, environment, input) {
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: "utf8",
    input,
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) throw result.error;
  return result;
}

function brokerCallResult(responses) {
  return responses.find((response) => response.id === 4)?.result?.structuredContent;
}

function brokerErrorId(responses) {
  return brokerCallResult(responses)?.error?.id;
}

function assertBrokerResponse(responses, expected) {
  if (brokerErrorId(responses) !== expected) {
    throw new Error(`LOCAL_E2E_BROKER_ERROR_MISMATCH_${expected}`);
  }
}

function assertSafeBrokerOutput(responses, forbiddenValues) {
  const serialized = JSON.stringify(responses);
  if (forbiddenValues.some((value) => value && serialized.includes(value))) {
    throw new Error("LOCAL_E2E_OUTPUT_DISCLOSURE");
  }
  const tools = responses.find((response) => response.id === 3)?.result?.tools ?? [];
  const forbidden = new Set([
    "path",
    "cwd",
    "command",
    "provider",
    "model",
    "destination",
    "session_id"
  ]);
  for (const tool of tools) {
    if (Object.keys(tool.inputSchema?.properties ?? {}).some((key) => forbidden.has(key))) {
      throw new Error("LOCAL_E2E_UNSAFE_TOOL_SCHEMA");
    }
  }
}

function observationCount(path) {
  return readLocalObservations(path).filter((observation) => observation.kind === "launch").length;
}

function readLastObservation(path) {
  return readLocalObservations(path)
    .filter((observation) => observation.kind === "launch")
    .at(-1);
}

function toolsListObservationCount(path) {
  return readLocalObservations(path).filter((observation) => observation.kind === "tools-list")
    .length;
}

function readLocalObservations(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function assertBooleanContract(label, contract) {
  const failed = Object.entries(contract)
    .filter(([, value]) => value !== true)
    .map(([key]) => key);
  if (failed.length > 0) throw new Error(`${label} failed: ${failed.join(", ")}`);
}

async function probeCodex(paths, expectedVersion) {
  const environment = {
    ...safeHostEnvironment(),
    HOME: paths.home,
    CODEX_HOME: paths.codexHome,
    CODEX_THREAD_ID: syntheticCodexThreadId,
    UTSURI_PROBE_DENIED_SENTINEL: deniedSentinel
  };
  const version = versionFrom(
    run("codex", ["--version"], paths.workspace, environment).stdout,
    /^codex-cli\s+/u
  );
  assertVersion("Codex", version, expectedVersion);
  const addedMarketplace = runJson(
    "codex",
    ["plugin", "marketplace", "add", paths.marketplace, "--json"],
    paths.workspace,
    environment
  );
  const before = pluginEntry(
    runJson(
      "codex",
      ["plugin", "list", "--marketplace", "utsuri-probe", "--available", "--json"],
      paths.workspace,
      environment
    )
  );
  const installed = runJson(
    "codex",
    ["plugin", "add", "utsuri@utsuri-probe", "--json"],
    paths.workspace,
    environment
  );
  const after = pluginEntry(
    runJson(
      "codex",
      ["plugin", "list", "--marketplace", "utsuri-probe", "--json"],
      paths.workspace,
      environment
    )
  );
  const appServer = await runCodexAppServer(paths.workspace, environment, paths.observation);
  const observed = readObservation(paths.observation);

  const configPath = join(paths.codexHome, "config.toml");
  const config = readFileSync(configPath, "utf8");
  const disabled = config.replace(
    /(\[plugins\."utsuri@utsuri-probe"\]\nenabled = )(?:true|false)/u,
    "$1false"
  );
  if (disabled === config) throw new Error("Codex installed Plugin enable state was not found");
  writeFileSync(configPath, disabled, { encoding: "utf8", mode: 0o600 });
  const disabledEntry = pluginEntry(
    runJson(
      "codex",
      ["plugin", "list", "--marketplace", "utsuri-probe", "--json"],
      paths.workspace,
      environment
    )
  );
  const removed = runJson(
    "codex",
    ["plugin", "remove", "utsuri@utsuri-probe", "--json"],
    paths.workspace,
    environment
  );
  const finalEntry = pluginEntry(
    runJson(
      "codex",
      ["plugin", "list", "--marketplace", "utsuri-probe", "--available", "--json"],
      paths.workspace,
      environment
    )
  );

  const contract = {
    marketplaceListed: addedMarketplace.marketplaceName === "utsuri-probe",
    selector: "utsuri@utsuri-probe",
    beforeInstalled: before.installed === false,
    installed: installed.pluginId === "utsuri@utsuri-probe" && after.installed === true,
    enabled: after.enabled === true,
    disabled: disabledEntry.enabled === false,
    removed: removed.pluginId === "utsuri@utsuri-probe" && finalEntry.installed === false,
    mcpDiscovered: appServer.serverFound,
    toolsListed: appServer.toolNames.includes("probe_environment"),
    cwdIsWorkspace: observed.cwd === realpathSync(paths.workspace),
    sessionInputForwarded: observed.env.CODEX_THREAD_ID === syntheticCodexThreadId,
    deniedSentinelForwarded: observed.env.UTSURI_PROBE_DENIED_SENTINEL === deniedSentinel
  };
  assertContract("Codex", contract);
  return { version, contract };
}

async function probeClaude(paths, expectedVersion) {
  const environment = {
    ...safeHostEnvironment(),
    HOME: paths.home,
    CLAUDE_CONFIG_DIR: join(paths.home, ".claude"),
    CODEX_THREAD_ID: syntheticCodexThreadId,
    UTSURI_PROBE_DENIED_SENTINEL: deniedSentinel
  };
  const version = versionFrom(run("claude", ["--version"], paths.workspace, environment).stdout);
  assertVersion("Claude Code", version, expectedVersion);
  run(
    "claude",
    ["plugin", "validate", paths.marketplace, "--strict"],
    paths.workspace,
    environment
  );
  run(
    "claude",
    ["plugin", "marketplace", "add", paths.marketplace, "--scope", "user"],
    paths.workspace,
    environment
  );
  run(
    "claude",
    ["plugin", "install", "utsuri@utsuri-probe", "--scope", "user"],
    paths.workspace,
    environment
  );
  const installedList = run("claude", ["plugin", "list"], paths.workspace, environment).stdout;
  await runClaudeSessionProbe(paths.workspace, environment, syntheticClaudeSessionId, () => {
    if (!existsSync(paths.observation)) return false;
    const current = readObservation(paths.observation);
    return current.methods?.includes("tools/list") === true;
  });
  const observed = readObservation(paths.observation);
  run("claude", ["plugin", "disable", "utsuri@utsuri-probe"], paths.workspace, environment);
  const disabledList = run("claude", ["plugin", "list"], paths.workspace, environment).stdout;
  run("claude", ["plugin", "uninstall", "utsuri@utsuri-probe"], paths.workspace, environment);
  const removedList = run("claude", ["plugin", "list"], paths.workspace, environment).stdout;

  const contract = {
    marketplaceListed: true,
    selector: "utsuri@utsuri-probe",
    installed: /utsuri@utsuri-probe/u.test(installedList),
    enabled: /enabled/iu.test(installedList),
    disabled: /utsuri@utsuri-probe/u.test(disabledList) && /disabled/iu.test(disabledList),
    removed: !/utsuri@utsuri-probe/u.test(removedList),
    mcpDiscovered: true,
    toolsListed: observed.methods?.includes("tools/list") === true,
    cwdIsWorkspace: observed.cwd === realpathSync(paths.workspace),
    projectDirectoryForwarded: observed.env.CLAUDE_PROJECT_DIR === realpathSync(paths.workspace),
    sessionInputForwarded: observed.env.CLAUDE_CODE_SESSION_ID === syntheticClaudeSessionId,
    codexThreadCleared: observed.env.CODEX_THREAD_ID === "",
    ambientDeniedSentinelForwarded: observed.env.UTSURI_PROBE_DENIED_SENTINEL === deniedSentinel
  };
  assertContract("Claude Code", contract);
  return { version, contract };
}

function writeFixture({ marketplace, observation }) {
  const plugin = join(marketplace, "plugins", "utsuri");
  mkdirSync(join(marketplace, ".agents", "plugins"), { recursive: true });
  mkdirSync(join(marketplace, ".claude-plugin"), { recursive: true });
  mkdirSync(join(plugin, ".codex-plugin"), { recursive: true });
  mkdirSync(join(plugin, ".claude-plugin"), { recursive: true });
  mkdirSync(join(plugin, "skills", "utsuri-review"), { recursive: true });
  writeJson(join(marketplace, ".agents", "plugins", "marketplace.json"), {
    name: "utsuri-probe",
    interface: { displayName: "Utsuri Probe" },
    plugins: [
      {
        name: "utsuri",
        source: { source: "local", path: "./plugins/utsuri" },
        policy: { installation: "AVAILABLE", authentication: "ON_USE" },
        category: "Engineering"
      }
    ]
  });
  writeJson(join(marketplace, ".claude-plugin", "marketplace.json"), {
    name: "utsuri-probe",
    owner: { name: "hokupod" },
    metadata: { description: "Utsuri runtime probe", version: "0.1.0" },
    plugins: [
      {
        name: "utsuri",
        source: "./plugins/utsuri",
        description: "Utsuri runtime probe",
        version: "0.1.0",
        author: { name: "hokupod" },
        category: "development",
        keywords: ["review"]
      }
    ]
  });
  const commonManifest = {
    name: "utsuri",
    version: "0.1.0",
    description: "Utsuri runtime probe",
    author: { name: "hokupod", url: "https://github.com/hokupod" },
    homepage: "https://github.com/hokupod/utsuri",
    repository: "https://github.com/hokupod/utsuri",
    license: "AGPL-3.0-or-later",
    keywords: ["review"],
    skills: "./skills/"
  };
  writeJson(join(plugin, ".codex-plugin", "plugin.json"), {
    ...commonManifest,
    mcpServers: "./.codex-plugin/mcp.json"
  });
  writeJson(join(plugin, ".codex-plugin", "mcp.json"), {
    utsuri: {
      command: process.execPath,
      args: [join(repositoryRoot, "fixtures", "plugin-runtime", "probe-server.mjs"), observation],
      env_vars: ["CODEX_THREAD_ID"],
      startup_timeout_sec: 20,
      tool_timeout_sec: 20
    }
  });
  writeJson(join(plugin, ".claude-plugin", "plugin.json"), {
    ...commonManifest,
    mcpServers: {
      utsuri: {
        command: process.execPath,
        args: [join(repositoryRoot, "fixtures", "plugin-runtime", "probe-server.mjs"), observation],
        env: { CODEX_THREAD_ID: "" }
      }
    }
  });
  writeFileSync(
    join(plugin, "skills", "utsuri-review", "SKILL.md"),
    "---\nname: utsuri-review\ndescription: Runtime probe only.\n---\n\nReturn probe status.\n",
    "utf8"
  );
}

async function runClaudeSessionProbe(cwd, environment, sessionId, ready) {
  const child = spawn(
    "claude",
    [
      "--session-id",
      sessionId,
      "--print",
      "--no-session-persistence",
      "local-only MCP startup probe"
    ],
    {
      cwd,
      env: {
        ...environment,
        ANTHROPIC_API_KEY: "synthetic-local-only",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:9",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
        DISABLE_ERROR_REPORTING: "1",
        DISABLE_NON_ESSENTIAL_MODEL_CALLS: "1",
        DISABLE_TELEMETRY: "1"
      },
      stdio: "ignore"
    }
  );
  let exitCode;
  child.once("exit", (code, signal) => {
    exitCode = signal ? "SIGNAL" : (code ?? "UNKNOWN");
  });
  try {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (ready()) return;
      if (exitCode !== undefined) {
        throw new Error(`CLAUDE_SESSION_PROBE_EXITED_${exitCode}`);
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    throw new Error("CLAUDE_SESSION_PROBE_TIMEOUT");
  } finally {
    if (exitCode === undefined) {
      child.kill("SIGTERM");
      await withTimeout(
        new Promise((resolveExit) => child.once("exit", resolveExit)),
        2_000,
        ""
      ).catch(() => child.kill("SIGKILL"));
    }
  }
}

async function runCodexAppServer(cwd, environment, observation) {
  const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
    cwd,
    env: environment,
    stdio: ["pipe", "pipe", "pipe"]
  });
  const responses = new Map();
  const waiters = new Map();
  let buffer = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => (stderr += chunk));
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    for (;;) {
      const newline = buffer.indexOf("\n");
      if (newline === -1) break;
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.id === undefined) continue;
      responses.set(message.id, message);
      waiters.get(message.id)?.();
    }
  });
  const send = (value) => child.stdin.write(`${JSON.stringify(value)}\n`);
  const response = async (id) => {
    if (!responses.has(id)) {
      await withTimeout(
        new Promise((resolveResponse) => waiters.set(id, resolveResponse)),
        30_000,
        `Codex app-server response timed out: ${stderr}`
      );
    }
    const value = responses.get(id);
    if (value?.error) throw new Error(`Codex app-server error: ${JSON.stringify(value.error)}`);
    return value.result;
  };
  try {
    send({
      id: 1,
      method: "initialize",
      params: {
        clientInfo: { name: "utsuri-plugin-runtime-probe", version: "1.0.0" },
        capabilities: { experimentalApi: true }
      }
    });
    await response(1);
    send({ id: 2, method: "mcpServerStatus/list", params: { detail: "full" } });
    const status = await response(2);
    if (observation) await waitForFile(observation, 10_000);
    const server = status?.data?.find((entry) => entry.name === "utsuri");
    return { serverFound: Boolean(server), toolNames: Object.keys(server?.tools ?? {}).sort() };
  } finally {
    child.stdin.end();
    child.kill("SIGTERM");
    await withTimeout(
      new Promise((resolveExit) => child.once("exit", resolveExit)),
      2_000,
      ""
    ).catch(() => child.kill("SIGKILL"));
  }
}

function run(command, args, cwd, environment, timeout = 60_000) {
  const result = runStatus(command, args, cwd, environment, timeout);
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status}): ${result.stderr || result.stdout}`
    );
  }
  return result;
}

function runStatus(command, args, cwd, environment, timeout = 60_000) {
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: "utf8",
    timeout,
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) throw result.error;
  return result;
}

function runJson(command, args, cwd, environment) {
  const result = run(command, args, cwd, environment);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(
      `${command} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function pluginEntry(result, selector = "utsuri@utsuri-probe") {
  const entries = [...(result.installed ?? []), ...(result.available ?? [])];
  const entry = entries.find((candidate) => candidate.pluginId === selector);
  if (!entry) throw new Error(`${selector} was not present in Codex plugin list`);
  return entry;
}

function readObservation(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

async function waitForFile(path, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (existsSync(path)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error("MCP observation was not written");
}

function assertContract(host, contract) {
  const failed = Object.entries(contract)
    .filter(
      ([key, value]) =>
        key !== "selector" && (key === "deniedSentinelForwarded" ? value !== false : value !== true)
    )
    .map(([key]) => key);
  if (failed.length > 0) throw new Error(`${host} runtime contract failed: ${failed.join(", ")}`);
}

function assertVersion(host, actual, expected) {
  if (actual !== expected)
    throw new Error(`${host} version mismatch: expected ${expected}, received ${actual}`);
}

function safeHostEnvironment() {
  const environment = {};
  for (const name of ["PATH", "TMPDIR", "LANG", "LC_ALL", "TERM", "SHELL"]) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}

function localDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function versionFrom(output, prefix = /^/u) {
  return output.trim().replace(prefix, "").split(/\s+/u)[0];
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function updateCompatibilityRecord(path, result) {
  const record = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8"))
    : { schemaVersion: 1, minimumSupported: {}, hosts: {} };
  if (record.schemaVersion !== 1) throw new Error("Unsupported compatibility record schema");
  record.minimumSupported[result.host] = result.version;
  record.hosts[result.host] = {
    version: result.version,
    verifiedAt: result.verifiedAt,
    os: result.os,
    contract: result.contract
  };
  writeJson(path, record);
}

function parseOptions(args) {
  const options = { keep: false, localE2e: false };
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item === "--keep") {
      options.keep = true;
      continue;
    }
    if (item === "--local-e2e") {
      options.localE2e = true;
      continue;
    }
    if (item === "--host" || item === "--version" || item === "--record") {
      const value = args[index + 1];
      if (!value) throw new Error(`${item} requires a value`);
      index += 1;
      options[item.slice(2)] = value;
      continue;
    }
    throw new Error(`Unknown option: ${item}`);
  }
  return options;
}

function assertOptions(options) {
  if (options.host !== "codex" && options.host !== "claude") {
    throw new Error("--host must be codex or claude");
  }
  if (typeof options.version !== "string" || !exactVersionPattern.test(options.version)) {
    throw new Error("--version must be an exact complete SemVer");
  }
}

async function withTimeout(promise, timeout, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message || "Timed out")), timeout);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
