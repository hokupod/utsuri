import { timingSafeEqual } from "node:crypto";
import { interactiveReportCsp, reportSecurityHeaders, staticReportCsp } from "../../security/src";

export type ViewerMode = "interactive" | "static";

const staticCspMeta = `<meta http-equiv="Content-Security-Policy" content="${staticReportCsp}">`;
const interactiveCspMeta = `<meta http-equiv="Content-Security-Policy" content="${interactiveReportCsp}">`;

export function viewerSecurityHeaders(mode: ViewerMode): Readonly<Record<string, string>> {
  return Object.freeze({
    ...reportSecurityHeaders,
    "content-security-policy": mode === "interactive" ? interactiveReportCsp : staticReportCsp
  });
}

export function viewerDocument(document: string, mode: ViewerMode): string {
  const first = document.indexOf(staticCspMeta);
  if (first === -1 || document.indexOf(staticCspMeta, first + staticCspMeta.length) !== -1) {
    throw new Error("Viewer document must contain exactly one canonical static CSP boundary");
  }
  return mode === "interactive"
    ? `${document.slice(0, first)}${interactiveCspMeta}${document.slice(first + staticCspMeta.length)}`
    : document;
}

function equalToken(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function assertInteractiveMutationBoundary(input: {
  origin: string | null;
  expectedOrigin: string;
  reportId: string;
  expectedReportId: string;
  capabilityToken: string;
  expectedCapabilityToken: string;
  schemaValid: boolean;
}): void {
  if (input.origin !== input.expectedOrigin)
    throw new Error("Interactive request origin is invalid");
  if (input.reportId !== input.expectedReportId) {
    throw new Error("Interactive request report binding is invalid");
  }
  if (!equalToken(input.capabilityToken, input.expectedCapabilityToken)) {
    throw new Error("Interactive request capability is invalid");
  }
  if (!input.schemaValid) throw new Error("Interactive request schema is invalid");
}
