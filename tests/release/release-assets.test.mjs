import assert from "node:assert/strict";
import { gunzipSync, gzipSync } from "node:zlib";
import { test } from "node:test";
import {
  assertDeterministicTarGzip,
  createDeterministicTar,
  createDeterministicTarGzip
} from "../../scripts/release-assets.mjs";

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

test("Plugin verification accepts alternate gzip bytes for the exact deterministic tar", () => {
  const entries = [
    { path: "utsuri-plugin/", mode: 0o755, type: "directory" },
    {
      path: "utsuri-plugin/run.mjs",
      mode: 0o755,
      type: "file",
      bytes: Buffer.from("const value = 'portable';\n".repeat(4096))
    }
  ];
  const tar = createDeterministicTar(entries);
  const canonical = createDeterministicTarGzip(entries);
  const alternate = gzipSync(tar, { level: 1, mtime: 0 });
  assert.notDeepEqual(alternate, canonical);
  assert.doesNotThrow(() => assertDeterministicTarGzip(alternate, tar));

  const tamperedTar = Buffer.from(tar);
  tamperedTar[512] ^= 1;
  assert.throws(
    () => assertDeterministicTarGzip(gzipSync(tamperedTar), tar),
    /does not contain the deterministic candidate tar/u
  );
  assert.throws(
    () => assertDeterministicTarGzip(Buffer.from("not gzip"), tar),
    /not a bounded gzip archive/u
  );
});
