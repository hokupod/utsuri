export async function runCleanupSteps(steps: ReadonlyArray<() => Promise<void>>): Promise<void> {
  let firstError: unknown;
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      firstError ??= error;
    }
  }
  if (firstError !== undefined) throw firstError;
}
