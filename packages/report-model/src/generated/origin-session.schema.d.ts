/* Generated from schemas/origin-session.schema.json. Do not edit directly. */

export type OriginSessionBinding = {
  [k: string]: any;
} & {
  host: "codex" | "claude-code" | "unknown";
  sessionRef?: string;
  projectFingerprint: string;
  reportId: string;
  bindingMode: "direct-same-session" | "return-to-session" | "unbound";
  createdAt: string;
};
