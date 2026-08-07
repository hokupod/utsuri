import type { CaptureCapability, CaptureMode } from "./types";

export const captureCapabilities: Readonly<Record<CaptureMode, CaptureCapability>> = Object.freeze({
  "dual-url": Object.freeze({
    supported: true,
    startsProjectCode: false,
    requiresExplicitCommand: false
  }),
  "static-fragment": Object.freeze({
    supported: true,
    startsProjectCode: false,
    requiresExplicitCommand: false
  }),
  worktree: Object.freeze({
    supported: true,
    startsProjectCode: true,
    requiresExplicitCommand: true
  }),
  container: Object.freeze({
    supported: false,
    startsProjectCode: true,
    requiresExplicitCommand: true,
    availablePhase: 4
  })
});
