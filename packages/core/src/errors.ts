export const ExitCode = {
  Success: 0,
  Internal: 1,
  Arguments: 2,
  Environment: 3,
  Incomplete: 4,
  Artifact: 5,
  Security: 6,
  Policy: 10
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export class UtsuriError extends Error {
  readonly diagnosticId: string;
  readonly exitCode: ExitCodeValue;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    diagnosticId: string,
    message: string,
    exitCode: ExitCodeValue,
    details: Readonly<Record<string, unknown>> = {}
  ) {
    super(message);
    this.name = "UtsuriError";
    this.diagnosticId = diagnosticId;
    this.exitCode = exitCode;
    this.details = details;
  }
}

export function toUtsuriError(error: unknown): UtsuriError {
  return error instanceof UtsuriError
    ? error
    : new UtsuriError(
        "UTSURI_INTERNAL",
        error instanceof Error ? error.message : String(error),
        ExitCode.Internal
      );
}
