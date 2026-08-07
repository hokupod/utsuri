import { describe, expect, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { validateArtifact } from "../../packages/report-model/src";

const fixtureRoot = path.resolve(import.meta.dir, "../../fixtures/capture-actions");

async function readActions(kind: "valid" | "invalid") {
  const directory = path.join(fixtureRoot, kind);
  const files = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  return Promise.all(
    files.map(async (name) => ({
      name,
      actions: JSON.parse(await readFile(path.join(directory, name), "utf8")) as unknown[]
    }))
  );
}

describe("capture action schema", () => {
  test("accepts only the bounded state-action DSL", async () => {
    for (const fixture of await readActions("valid")) {
      for (const [index, action] of fixture.actions.entries()) {
        expect(
          validateArtifact("capture-action", action).errors,
          `${fixture.name}:${index}`
        ).toEqual([]);
      }
    }
  });

  test("rejects JavaScript, shell, upload, and download actions", async () => {
    for (const fixture of await readActions("invalid")) {
      for (const [index, action] of fixture.actions.entries()) {
        expect(
          validateArtifact("capture-action", action).ok,
          `${fixture.name}:${index}`
        ).toBeFalse();
      }
    }
  });
});
