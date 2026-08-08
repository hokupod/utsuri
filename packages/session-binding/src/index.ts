import { timingSafeEqual } from "node:crypto";
import { realpath } from "node:fs/promises";
import { ExitCode, UtsuriError } from "@utsu-ri/core";
import type { OriginSessionBinding } from "@utsu-ri/report-model";
import { assertArtifact } from "@utsu-ri/report-model";
import { nodeReviewDigest, type ReviewDigest } from "@utsu-ri/review-state";

export type SessionHost = OriginSessionBinding["host"];

export interface CurrentSessionIdentity {
  host: SessionHost;
  sessionRef?: string;
  projectFingerprint: string;
  reportId: string;
}

function bindingError(id: string, message: string): never {
  throw new UtsuriError(id, message, ExitCode.Security);
}

function equalOpaqueValue(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export async function opaqueSessionRef(
  host: SessionHost,
  sessionId: string,
  digest: ReviewDigest = nodeReviewDigest
): Promise<string> {
  const normalized = sessionId.trim();
  if (!normalized || normalized.length > 4096) {
    bindingError("SESSION_REF_INVALID", "Origin Session reference is invalid");
  }
  return `session:${await digest({ host, sessionId: normalized })}`;
}

export async function projectFingerprint(
  projectRoot: string,
  repositoryFingerprint: string,
  digest: ReviewDigest = nodeReviewDigest
): Promise<string> {
  const canonicalRoot = await realpath(projectRoot);
  return digest({ canonicalProjectRoot: canonicalRoot, repositoryFingerprint });
}

export async function createOriginSessionBinding(input: {
  host: SessionHost;
  sessionId?: string;
  projectRoot: string;
  repositoryFingerprint: string;
  reportId: string;
  createdAt: string;
  directBridgeAvailable?: boolean;
  digest?: ReviewDigest;
}): Promise<OriginSessionBinding> {
  const digest = input.digest ?? nodeReviewDigest;
  const sessionRef = input.sessionId
    ? await opaqueSessionRef(input.host, input.sessionId, digest)
    : undefined;
  const binding: OriginSessionBinding = {
    host: input.host,
    ...(sessionRef ? { sessionRef } : {}),
    projectFingerprint: await projectFingerprint(
      input.projectRoot,
      input.repositoryFingerprint,
      digest
    ),
    reportId: input.reportId,
    bindingMode: sessionRef
      ? input.directBridgeAvailable
        ? "direct-same-session"
        : "return-to-session"
      : "unbound",
    createdAt: input.createdAt
  };
  assertArtifact("origin-session", binding);
  return binding;
}

export function assertOriginSessionMatch(
  binding: OriginSessionBinding,
  current: CurrentSessionIdentity
): void {
  assertArtifact("origin-session", binding);
  if (
    binding.reportId !== current.reportId ||
    binding.host !== current.host ||
    !equalOpaqueValue(binding.projectFingerprint, current.projectFingerprint)
  ) {
    bindingError(
      "ORIGIN_SESSION_MISMATCH",
      "Current conversation or project does not match the report Origin Session"
    );
  }
  if (binding.sessionRef) {
    if (!current.sessionRef || !equalOpaqueValue(binding.sessionRef, current.sessionRef)) {
      bindingError(
        "ORIGIN_SESSION_MISMATCH",
        "Current conversation does not match the report Origin Session"
      );
    }
  } else {
    bindingError(
      "ORIGIN_SESSION_UNBOUND",
      "The report has no Origin Session binding and cannot be claimed"
    );
  }
}

export async function currentSessionIdentityFromEnvironment(input: {
  environment?: NodeJS.ProcessEnv;
  projectFingerprint: string;
  reportId: string;
  digest?: ReviewDigest;
}): Promise<CurrentSessionIdentity> {
  const environment = input.environment ?? process.env;
  const codex = environment.UTSURI_CODEX_SESSION_ID;
  const claude = environment.CLAUDE_SESSION_ID;
  if (codex && claude) {
    bindingError(
      "ORIGIN_SESSION_AMBIGUOUS",
      "More than one host supplied a current Origin Session identifier"
    );
  }
  if (codex) {
    return {
      host: "codex",
      sessionRef: await opaqueSessionRef("codex", codex, input.digest),
      projectFingerprint: input.projectFingerprint,
      reportId: input.reportId
    };
  }
  if (claude) {
    return {
      host: "claude-code",
      sessionRef: await opaqueSessionRef("claude-code", claude, input.digest),
      projectFingerprint: input.projectFingerprint,
      reportId: input.reportId
    };
  }
  return {
    host: "unknown",
    projectFingerprint: input.projectFingerprint,
    reportId: input.reportId
  };
}
