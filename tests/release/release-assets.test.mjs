import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { test } from "node:test";
import { createDeterministicTarGzip } from "../../scripts/release-assets.mjs";

test("Plugin tarball assembly is deterministic and preserves declared modes", () => {
  const entries = [
    { path: "utsuri-plugin/", mode: 0o755, type: "directory" },
    {
      path: "utsuri-plugin/run.mjs",
      mode: 0o755,
      type: "file",
      bytes: Buffer.from("run\n")
    }
  ];
  const first = createDeterministicTarGzip(entries);
  const second = createDeterministicTarGzip(entries);
  assert.deepEqual(first, second);
  const tar = gunzipSync(first);
  assert.equal(tar.subarray(0, "utsuri-plugin/".length).toString(), "utsuri-plugin/");
  assert.equal(tar.subarray(100, 107).toString(), "0000755");
  assert.equal(tar.length % 512, 0);
});
