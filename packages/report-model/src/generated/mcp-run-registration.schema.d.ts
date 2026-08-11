/* Generated from schemas/mcp-run-registration.schema.json. Do not edit directly. */

export interface McpRunRegistration {
  schemaVersion: "1.0";
  sessionRef: string;
  projectFingerprint: string;
  reportId: string;
  runPath: string;
  reportSha256: string;
  createdAt: string;
}
