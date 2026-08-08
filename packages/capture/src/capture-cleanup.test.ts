import { describe, expect, test } from "bun:test";
import { ExitCode, UtsuriError } from "@utsu-ri/core";
import { assertBrowserCleanupOutcome, closeBrowserRuntime, retryTransient } from "./capture";

function observation(
  processIds: Set<number>,
  candidateProcessIds: Set<number> = processIds,
  error: UtsuriError | null = null
) {
  return { processIds, candidateProcessIds, error };
}

describe("browser runtime cleanup", () => {
  test("preserves parent ambiguity from a failed launch after cleanup", async () => {
    const processIds = new Set([2_147_483_646, 2_147_483_647]);
    await expect(
      closeBrowserRuntime(null, observation(processIds), new Set(), "token")
    ).rejects.toMatchObject({
      diagnosticId: "CAPTURE_BROWSER_PROCESS_AMBIGUOUS"
    });
  });

  test("reports ambiguity before an incomplete cleanup result", () => {
    let thrown: unknown;
    try {
      assertBrowserCleanupOutcome(true, false);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ diagnosticId: "CAPTURE_BROWSER_PROCESS_AMBIGUOUS" });
  });

  test("does not retry a typed browser ownership failure", async () => {
    let attempts = 0;
    await expect(
      retryTransient("browser", 1, () => {
        attempts += 1;
        assertBrowserCleanupOutcome(true, true);
        return Promise.resolve();
      })
    ).rejects.toMatchObject({ diagnosticId: "CAPTURE_BROWSER_PROCESS_AMBIGUOUS" });
    expect(attempts).toBe(1);
  });

  test("preserves known ambiguity when a later observation loses tracking", async () => {
    const trackingError = new UtsuriError(
      "CAPTURE_BROWSER_TRACKING_UNAVAILABLE",
      "tracking unavailable",
      ExitCode.Environment
    );
    await expect(
      closeBrowserRuntime(null, observation(new Set([301, 302])), new Set(["/browser"]), "token", {
        observe: () => ({
          processIds: new Set(),
          candidateProcessIds: new Set(),
          error: trackingError
        }),
        wait: () => Promise.resolve(true)
      })
    ).rejects.toMatchObject({ diagnosticId: "CAPTURE_BROWSER_PROCESS_AMBIGUOUS" });
  });

  test("never signals candidates after ownership becomes ambiguous", async () => {
    const terminated: number[][] = [];
    await expect(
      closeBrowserRuntime(null, observation(new Set([301])), new Set(["/browser"]), "token", {
        observe: () => ({
          processIds: new Set([302]),
          candidateProcessIds: new Set([302]),
          error: null
        }),
        terminate: (processIds) => {
          terminated.push([...processIds]);
          return Promise.resolve(true);
        },
        wait: () => Promise.resolve(false)
      })
    ).rejects.toMatchObject({ diagnosticId: "CAPTURE_BROWSER_PROCESS_AMBIGUOUS" });
    expect(terminated).toEqual([]);
  });

  test("never signals a verified parent after a forged candidate is observed", async () => {
    const trackingError = new UtsuriError(
      "CAPTURE_BROWSER_TRACKING_UNAVAILABLE",
      "forged process",
      ExitCode.Environment
    );
    const terminated: number[][] = [];
    let observationCount = 0;
    await expect(
      closeBrowserRuntime(null, observation(new Set()), new Set(["/browser"]), "token", {
        observe: () => {
          observationCount += 1;
          return observationCount === 1
            ? {
                processIds: new Set([301]),
                candidateProcessIds: new Set([301, 302]),
                error: trackingError
              }
            : { processIds: new Set(), candidateProcessIds: new Set(), error: null };
        },
        terminate: (processIds) => {
          terminated.push([...processIds]);
          return Promise.resolve(true);
        },
        wait: () => Promise.resolve(false)
      })
    ).rejects.toMatchObject({ diagnosticId: "CAPTURE_BROWSER_PROCESS_AMBIGUOUS" });
    expect(terminated).toEqual([]);
  });

  test("preserves rejected initial candidates after they disappear", async () => {
    const trackingError = new UtsuriError(
      "CAPTURE_BROWSER_TRACKING_UNAVAILABLE",
      "forged process",
      ExitCode.Environment
    );
    const terminated: number[][] = [];
    await expect(
      closeBrowserRuntime(
        null,
        observation(new Set([301]), new Set([301, 302]), trackingError),
        new Set(["/browser"]),
        "token",
        {
          observe: () => observation(new Set([301])),
          terminate: (processIds) => {
            terminated.push([...processIds]);
            return Promise.resolve(true);
          },
          wait: () => Promise.resolve(false)
        }
      )
    ).rejects.toMatchObject({ diagnosticId: "CAPTURE_BROWSER_PROCESS_AMBIGUOUS" });
    expect(terminated).toEqual([]);
  });
});
