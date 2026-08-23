import assert from "node:assert/strict";
import { test } from "node:test";
import { gitleaksArgumentsForPush, pushRangesFromStdin } from "../../scripts/scan-push-secrets.mjs";

const localObjectId = "a".repeat(40);
const remoteObjectId = "b".repeat(40);
const zeroObjectId = "0".repeat(40);

test("scans only commits introduced by existing pushed refs", () => {
  const input = `refs/heads/main ${localObjectId} refs/heads/main ${remoteObjectId}\n`;
  assert.deepEqual(pushRangesFromStdin(input), [`${remoteObjectId}..${localObjectId}`]);
  assert.deepEqual(gitleaksArgumentsForPush(input), [
    "git",
    "--log-opts",
    `--diff-filter=ACMR ${remoteObjectId}..${localObjectId}`,
    "--config",
    ".gitleaks.toml",
    "--redact",
    "--no-banner",
    "--no-color",
    "."
  ]);
});

test("scans reachable history for a newly created remote ref", () => {
  const input = `refs/heads/topic ${localObjectId} refs/heads/topic ${zeroObjectId}\n`;
  assert.deepEqual(pushRangesFromStdin(input), [localObjectId]);
});

test("skips deleted refs and duplicate pushed ranges", () => {
  const update = `refs/heads/main ${localObjectId} refs/heads/main ${remoteObjectId}`;
  const deletion = `(delete) ${zeroObjectId} refs/heads/old ${remoteObjectId}`;
  assert.deepEqual(pushRangesFromStdin(`${update}\n${update}\n${deletion}\n`), [
    `${remoteObjectId}..${localObjectId}`
  ]);
  assert.equal(gitleaksArgumentsForPush(`${deletion}\n`), null);
});

test("rejects malformed or untrusted object ids", () => {
  assert.throws(
    () => pushRangesFromStdin("refs/heads/main HEAD refs/heads/main origin/main\n"),
    /invalid local object id/u
  );
  assert.throws(
    () => pushRangesFromStdin(`refs/heads/main ${localObjectId} refs/heads/main\n`),
    /invalid pre-push input/u
  );
});
