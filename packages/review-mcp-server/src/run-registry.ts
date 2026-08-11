import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, link, lstat, mkdir, open, readdir, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { ExitCode, UtsuriError } from "@utsu-ri/core";
import { assertArtifact, type McpRunRegistration, type UtsuriReport } from "@utsu-ri/report-model";

export const mcpRegistrationDirectory = ".artifacts/utsuri/mcp/registrations";
export const maximumRegistrationEntries = 64;
const maximumInternalEntries = 128;
const maximumRegistrationBytes = 16 * 1024;
const maximumReportBytes = 32 * 1024 * 1024;
const registrationFilenamePattern = /^[a-f0-9]{64}\.json$/u;
const registrationTemporaryPattern = /^\.[a-f0-9]{64}\.json\.[0-9a-f-]{36}\.tmp$/u;
const registrationSlotPattern = /^\.slot-(?:[0-5][0-9]|6[0-3])$/u;
const staleInternalEntryAgeMs = 5 * 60 * 1_000;

function registryError(id: string, message: string, exitCode = ExitCode.Security): never {
  throw new UtsuriError(id, message, exitCode);
}

function sanitizeRegistryFailure(error: unknown): never {
  if (error instanceof UtsuriError) throw error;
  registryError("MCP_REGISTRATION_FILESYSTEM", "MCP registration filesystem operation failed");
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function assertSafeRegistrationRunPath(value: string): string {
  const components = value.split("/");
  if (
    !value ||
    value.length > 4096 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("\0") ||
    components.some((component) => !component || component === "." || component === "..") ||
    path.posix.normalize(value) !== value
  ) {
    registryError("MCP_REGISTRATION_RUN_PATH", "Registered run path is invalid");
  }
  return value;
}

interface PathIdentity {
  path: string;
  device: number;
  inode: number;
}

interface DirectoryIdentity {
  projectRoot: string;
  directory: string;
  chain: PathIdentity[];
}

export interface RunRegistryTestHooks {
  beforeOperation?: (operation: string) => Promise<void> | void;
  now?: () => number;
}

async function canonicalProjectRoot(projectRoot: string): Promise<string> {
  return realpath(projectRoot);
}

async function captureDirectoryIdentity(
  projectRoot: string,
  directory: string
): Promise<DirectoryIdentity> {
  const project = await canonicalProjectRoot(projectRoot);
  const canonicalDirectory = await realpath(directory);
  const relative = path.relative(project, canonicalDirectory);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    registryError("MCP_REGISTRATION_PROJECT", "MCP registry path is outside the current project");
  }
  const paths = [project];
  let current = project;
  for (const segment of relative ? relative.split(path.sep) : []) {
    current = path.join(current, segment);
    paths.push(current);
  }
  const chain: PathIdentity[] = [];
  for (const filename of paths) {
    const stat = await lstat(filename);
    if (stat.isSymbolicLink() || !stat.isDirectory() || (await realpath(filename)) !== filename) {
      registryError(
        "MCP_REGISTRATION_DIRECTORY",
        "MCP registration directory is not a regular project directory"
      );
    }
    chain.push({ path: filename, device: stat.dev, inode: stat.ino });
  }
  return { projectRoot: project, directory: canonicalDirectory, chain };
}

async function assertDirectoryIdentity(identity: DirectoryIdentity): Promise<void> {
  for (const expected of identity.chain) {
    const stat = await lstat(expected.path);
    if (
      stat.isSymbolicLink() ||
      !stat.isDirectory() ||
      stat.dev !== expected.device ||
      stat.ino !== expected.inode ||
      (await realpath(expected.path)) !== expected.path
    ) {
      registryError(
        "MCP_REGISTRATION_DIRECTORY_CHANGED",
        "MCP registration directory identity changed during access"
      );
    }
  }
}

async function guardedDirectoryOperation<T>(
  identity: DirectoryIdentity,
  operation: string,
  hooks: RunRegistryTestHooks | undefined,
  callback: () => Promise<T>
): Promise<T> {
  await assertDirectoryIdentity(identity);
  await hooks?.beforeOperation?.(operation);
  await assertDirectoryIdentity(identity);
  const result = await callback();
  await assertDirectoryIdentity(identity);
  return result;
}

async function projectRelativeRun(
  projectRoot: string,
  runDirectory: string
): Promise<{ runPath: string; runIdentity: DirectoryIdentity }> {
  const project = await canonicalProjectRoot(projectRoot);
  const run = await realpath(runDirectory);
  const relative = path.relative(project, run);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    registryError("MCP_REGISTRATION_PROJECT", "Review run is outside the current project");
  }
  return {
    runPath: assertSafeRegistrationRunPath(relative.split(path.sep).join("/")),
    runIdentity: await captureDirectoryIdentity(project, run)
  };
}

async function ensurePrivateRegistrationDirectory(
  projectRoot: string,
  hooks?: RunRegistryTestHooks
): Promise<DirectoryIdentity> {
  const project = await canonicalProjectRoot(projectRoot);
  let current = project;
  let identity = await captureDirectoryIdentity(project, project);
  for (const segment of mcpRegistrationDirectory.split("/")) {
    await assertDirectoryIdentity(identity);
    current = path.join(current, segment);
    await mkdir(current, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    identity = await captureDirectoryIdentity(project, current);
  }
  await guardedDirectoryOperation(identity, "chmod-registry", hooks, () => chmod(current, 0o700));
  return identity;
}

async function existingRegistrationDirectory(
  projectRoot: string
): Promise<DirectoryIdentity | null> {
  const project = await canonicalProjectRoot(projectRoot);
  let current = project;
  for (const segment of mcpRegistrationDirectory.split("/")) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = await lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      registryError(
        "MCP_REGISTRATION_DIRECTORY",
        "MCP registration directory is not a regular project directory"
      );
    }
  }
  return captureDirectoryIdentity(project, current);
}

async function readRegularFile(
  identity: DirectoryIdentity,
  name: string,
  maximumBytes: number,
  operation: string,
  hooks?: RunRegistryTestHooks
): Promise<Buffer> {
  if (path.basename(name) !== name) {
    registryError("MCP_REGISTRATION_FILE", "MCP registration file is invalid");
  }
  return guardedDirectoryOperation(identity, operation, hooks, async () => {
    let handle;
    try {
      handle = await open(
        path.join(identity.directory, name),
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
      );
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > maximumBytes) {
        registryError("MCP_REGISTRATION_FILE", "MCP registration file is invalid");
      }
      return await handle.readFile();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ELOOP") {
        registryError("MCP_REGISTRATION_FILE", "MCP registration symlinks are forbidden");
      }
      throw error;
    } finally {
      await handle?.close();
    }
  });
}

function parseRegistration(bytes: Buffer): McpRunRegistration {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    registryError("MCP_REGISTRATION_JSON", "MCP registration JSON is invalid");
  }
  assertArtifact("mcp-run-registration", value);
  const registration = value as McpRunRegistration;
  assertSafeRegistrationRunPath(registration.runPath);
  return registration;
}

function canonicalRegistration(registration: McpRunRegistration): Buffer {
  return Buffer.from(`${JSON.stringify(registration)}\n`, "utf8");
}

interface RegistrationInventory {
  registrationNames: string[];
  slotNames: string[];
}

function internalEntryAge(stat: Awaited<ReturnType<typeof lstat>>, hooks?: RunRegistryTestHooks) {
  return (hooks?.now?.() ?? Date.now()) - Number(stat.mtimeMs);
}

async function removeStaleInternalEntry(
  identity: DirectoryIdentity,
  name: string,
  hooks?: RunRegistryTestHooks
): Promise<void> {
  const filename = path.join(identity.directory, name);
  const stat = await lstat(filename);
  if (stat.isSymbolicLink()) {
    registryError("MCP_REGISTRATION_INVENTORY", "Unexpected MCP registration entry");
  }
  if (registrationTemporaryPattern.test(name)) {
    if (!stat.isFile() || stat.size > maximumRegistrationBytes) {
      registryError("MCP_REGISTRATION_INVENTORY", "Unexpected MCP registration entry");
    }
    if (internalEntryAge(stat, hooks) >= staleInternalEntryAgeMs) {
      await guardedDirectoryOperation(identity, "cleanup-stale-temp", hooks, () =>
        unlink(filename).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        })
      );
    }
    return;
  }
  registryError("MCP_REGISTRATION_INVENTORY", "Unexpected MCP registration entry");
}

async function reconcileRegistrationSlots(
  identity: DirectoryIdentity,
  registrationNames: string[],
  slotNames: string[],
  hooks?: RunRegistryTestHooks
): Promise<string[]> {
  const registrations = new Set(registrationNames);
  const slotTargets = new Set<string>();
  for (const slotName of slotNames) {
    const bytes = await readRegularFile(
      identity,
      slotName,
      maximumRegistrationBytes,
      "read-registration-slot",
      hooks
    );
    const registration = parseRegistration(bytes);
    const targetName = `${sha256(registration.reportId)}.json`;
    if (slotTargets.has(targetName)) {
      registryError("MCP_REGISTRATION_SLOT", "Duplicate MCP registration slot");
    }
    slotTargets.add(targetName);
    if (!registrations.has(targetName)) {
      try {
        await guardedDirectoryOperation(identity, "promote-registration-slot", hooks, () =>
          link(path.join(identity.directory, slotName), path.join(identity.directory, targetName))
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      registrations.add(targetName);
    }
    const finalBytes = await readRegularFile(
      identity,
      targetName,
      maximumRegistrationBytes,
      "read-registration",
      hooks
    );
    if (!finalBytes.equals(bytes)) {
      registryError("MCP_REGISTRATION_CONFLICT", "MCP registration slot differs from its entry");
    }
  }
  for (const name of registrations) {
    if (!slotTargets.has(name)) {
      registryError("MCP_REGISTRATION_SLOT", "MCP registration entry has no bounded slot");
    }
  }
  return [...registrations].sort();
}

async function registrationInventory(
  identity: DirectoryIdentity,
  hooks?: RunRegistryTestHooks
): Promise<RegistrationInventory> {
  const names = (
    await guardedDirectoryOperation(identity, "read-inventory", hooks, () =>
      readdir(identity.directory)
    )
  ).sort();
  if (names.length > maximumRegistrationEntries * 2 + maximumInternalEntries) {
    registryError("MCP_REGISTRATION_LIMIT", "MCP registration inventory limit exceeded");
  }
  let registrationNames = names.filter((name) => registrationFilenamePattern.test(name));
  if (registrationNames.length > maximumRegistrationEntries) {
    registryError("MCP_REGISTRATION_LIMIT", "MCP registration entry limit exceeded");
  }
  const slotNames = names.filter((name) => registrationSlotPattern.test(name));
  if (slotNames.length > maximumRegistrationEntries) {
    registryError("MCP_REGISTRATION_LIMIT", "MCP registration slot limit exceeded");
  }
  const internalNames = names.filter(
    (name) => !registrationFilenamePattern.test(name) && !registrationSlotPattern.test(name)
  );
  if (internalNames.length > maximumInternalEntries) {
    registryError("MCP_REGISTRATION_LIMIT", "MCP registration internal entry limit exceeded");
  }
  for (const name of internalNames) await removeStaleInternalEntry(identity, name, hooks);
  registrationNames = await reconcileRegistrationSlots(
    identity,
    registrationNames,
    slotNames,
    hooks
  );
  return { registrationNames, slotNames };
}

async function claimRegistrationSlot(
  registry: DirectoryIdentity,
  temporaryName: string,
  bytes: Buffer,
  hooks?: RunRegistryTestHooks
): Promise<{ name: string; reused: boolean }> {
  for (let index = 0; index < maximumRegistrationEntries; index += 1) {
    const slotName = `.slot-${String(index).padStart(2, "0")}`;
    try {
      await guardedDirectoryOperation(registry, "claim-registration-slot", hooks, () =>
        link(path.join(registry.directory, temporaryName), path.join(registry.directory, slotName))
      );
      return { name: slotName, reused: false };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const existing = await readRegularFile(
      registry,
      slotName,
      maximumRegistrationBytes,
      "read-registration-slot",
      hooks
    );
    if (existing.equals(bytes)) return { name: slotName, reused: true };
  }
  registryError("MCP_REGISTRATION_LIMIT", "MCP registration entry limit reached");
}

export interface RegisterMcpRunResult {
  state: "registered" | "not-registered";
  reused: boolean;
  reportId: string;
}

async function registerMcpRunInternal(
  input: { projectRoot: string; runDirectory: string; report: UtsuriReport },
  hooks?: RunRegistryTestHooks
): Promise<RegisterMcpRunResult> {
  assertArtifact("report", input.report);
  if (input.report.origin.bindingMode === "unbound" || !input.report.origin.sessionRef) {
    return { state: "not-registered", reused: false, reportId: input.report.reportId };
  }
  if (input.report.origin.reportId !== input.report.reportId) {
    registryError("MCP_REGISTRATION_REPORT", "Report Origin Session does not match the report");
  }
  const { runPath, runIdentity } = await projectRelativeRun(input.projectRoot, input.runDirectory);
  const reportIdentity = await captureDirectoryIdentity(
    runIdentity.projectRoot,
    path.join(runIdentity.directory, "report")
  );
  const reportBytes = await readRegularFile(
    reportIdentity,
    "report.json",
    maximumReportBytes,
    "read-published-report",
    hooks
  );
  let published: unknown;
  try {
    published = JSON.parse(reportBytes.toString("utf8")) as unknown;
  } catch {
    registryError("MCP_REGISTRATION_REPORT", "Published report JSON is invalid");
  }
  assertArtifact("report", published);
  const publishedReport = published as UtsuriReport;
  if (
    publishedReport.reportId !== input.report.reportId ||
    publishedReport.origin.sessionRef !== input.report.origin.sessionRef ||
    publishedReport.origin.projectFingerprint !== input.report.origin.projectFingerprint
  ) {
    registryError(
      "MCP_REGISTRATION_REPORT",
      "Published report binding changed before registration"
    );
  }
  const registration: McpRunRegistration = {
    schemaVersion: "1.0",
    sessionRef: input.report.origin.sessionRef,
    projectFingerprint: input.report.origin.projectFingerprint,
    reportId: input.report.reportId,
    runPath,
    reportSha256: sha256(reportBytes),
    createdAt: input.report.origin.createdAt
  };
  assertArtifact("mcp-run-registration", registration);
  const registry = await ensurePrivateRegistrationDirectory(input.projectRoot, hooks);
  const filename = `${sha256(registration.reportId)}.json`;
  const bytes = canonicalRegistration(registration);
  let temporaryName: string | undefined;
  let result: RegisterMcpRunResult | undefined;
  let primaryError: unknown;
  try {
    result = await (async () => {
      const inventory = await registrationInventory(registry, hooks);
      if (inventory.registrationNames.includes(filename)) {
        const existing = await readRegularFile(
          registry,
          filename,
          maximumRegistrationBytes,
          "read-registration",
          hooks
        );
        if (!existing.equals(bytes)) {
          registryError(
            "MCP_REGISTRATION_CONFLICT",
            "Existing MCP registration differs from the requested registration"
          );
        }
        return { state: "registered", reused: true, reportId: registration.reportId };
      }
      if (inventory.registrationNames.length >= maximumRegistrationEntries) {
        registryError("MCP_REGISTRATION_LIMIT", "MCP registration entry limit reached");
      }
      temporaryName = `.${filename}.${randomUUID()}.tmp`;
      await guardedDirectoryOperation(registry, "write-registration-temp", hooks, async () => {
        const handle = await open(
          path.join(registry.directory, temporaryName!),
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
          0o600
        );
        try {
          await handle.writeFile(bytes);
          await handle.sync();
        } finally {
          await handle.close();
        }
      });
      const slot = await claimRegistrationSlot(registry, temporaryName, bytes, hooks);
      try {
        await guardedDirectoryOperation(registry, "link-registration", hooks, () =>
          link(path.join(registry.directory, slot.name), path.join(registry.directory, filename))
        );
        return {
          state: "registered",
          reused: slot.reused,
          reportId: registration.reportId
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const existing = await readRegularFile(
          registry,
          filename,
          maximumRegistrationBytes,
          "read-registration",
          hooks
        );
        if (!existing.equals(bytes)) {
          registryError(
            "MCP_REGISTRATION_CONFLICT",
            "Existing MCP registration differs from the requested registration"
          );
        }
        return {
          state: "registered",
          reused: true,
          reportId: registration.reportId
        };
      }
    })();
  } catch (error) {
    primaryError = error;
  }
  let cleanupError: unknown;
  try {
    if (temporaryName) {
      await guardedDirectoryOperation(registry, "remove-registration-temp", hooks, () =>
        unlink(path.join(registry.directory, temporaryName!)).catch(
          (error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
          }
        )
      );
    }
  } catch (error) {
    cleanupError = error;
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  if (!result) registryError("MCP_REGISTRATION_FILESYSTEM", "MCP registration did not complete");
  return result;
}

export async function registerMcpRun(
  input: { projectRoot: string; runDirectory: string; report: UtsuriReport },
  hooks?: RunRegistryTestHooks
): Promise<RegisterMcpRunResult> {
  try {
    return await registerMcpRunInternal(input, hooks);
  } catch (error) {
    sanitizeRegistryFailure(error);
  }
}

async function readMcpRunRegistrationsInternal(
  projectRoot: string,
  hooks?: RunRegistryTestHooks
): Promise<McpRunRegistration[]> {
  const registry = await existingRegistrationDirectory(projectRoot);
  if (!registry) return [];
  const { registrationNames } = await registrationInventory(registry, hooks);
  const registrations: McpRunRegistration[] = [];
  const reportIds = new Set<string>();
  for (const name of registrationNames) {
    const bytes = await readRegularFile(
      registry,
      name,
      maximumRegistrationBytes,
      "read-registration",
      hooks
    );
    const registration = parseRegistration(bytes);
    if (`${sha256(registration.reportId)}.json` !== name) {
      registryError("MCP_REGISTRATION_FILENAME", "MCP registration filename is invalid");
    }
    if (reportIds.has(registration.reportId)) {
      registryError("MCP_REGISTRATION_DUPLICATE", "Duplicate MCP report registration");
    }
    reportIds.add(registration.reportId);
    registrations.push(registration);
  }
  return registrations;
}

export async function readMcpRunRegistrations(
  projectRoot: string,
  hooks?: RunRegistryTestHooks
): Promise<McpRunRegistration[]> {
  try {
    return await readMcpRunRegistrationsInternal(projectRoot, hooks);
  } catch (error) {
    sanitizeRegistryFailure(error);
  }
}
