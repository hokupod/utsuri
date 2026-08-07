import { describe, expect, test } from "bun:test";
import {
  terminateTrackedBrowserProcesses,
  trackedBrowserProcessIds,
  waitForTrackedBrowserProcesses
} from "./browser-process";

describe("browser process tracking", () => {
  test("selects only the marked browser parent process", () => {
    const executable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    const token = "7e03802d-3670-4c68-a3e5-b82186cbc79c";
    const processList = `
      101 ps -o pid=,command= -P 99
      102 ${executable} --utsuri-capture-token=${token} --remote-debugging-pipe
      103 ${executable} --remote-debugging-pipe
      104 /tmp/fake --utsuri-capture-token=${token} --remote-debugging-pipe
      105 ${executable} --utsuri-capture-token=other --remote-debugging-pipe
      106 ${executable} --utsuri-capture-token=${token}
    `;

    expect(trackedBrowserProcessIds(processList, executable, token)).toEqual(new Set([102]));
  });

  test("observes an empty tracked process set as fully reaped", async () => {
    await expect(waitForTrackedBrowserProcesses(new Set(), 10)).resolves.toBeTrue();
    await expect(terminateTrackedBrowserProcesses(new Set())).resolves.toBeTrue();
  });
});
