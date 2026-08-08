import assert from "node:assert/strict";
import { test } from "node:test";
import { publishPackageSequence } from "../../scripts/publish-release-packages.mjs";

const helper = {
  name: "@utsu-ri/cli-linux-x64",
  version: "0.1.0",
  integrity: "sha512-aGVscGVy",
  tarball: "/candidate/helper.tgz"
};
const cli = {
  name: "@utsu-ri/cli",
  version: "0.1.0",
  integrity: "sha512-Y2xp",
  tarball: "/candidate/cli.tgz"
};

test("skips matching versions and publishes missing packages in order", async () => {
  const calls = [];
  let cliPublished = false;
  const results = await publishPackageSequence({
    packages: [helper, cli],
    lookupIntegrity: async (package_) => {
      calls.push(`lookup:${package_.name}`);
      if (package_.name === helper.name) return helper.integrity;
      return cliPublished ? cli.integrity : null;
    },
    publish: async (package_) => {
      calls.push(`publish:${package_.name}`);
      cliPublished = true;
      return { ok: true, status: 0 };
    },
    sleep: async () => {},
    pollDelayMs: 0
  });
  assert.deepEqual(results, [
    { name: helper.name, status: "already-published" },
    { name: cli.name, status: "published" }
  ]);
  assert.deepEqual(calls, [
    `lookup:${helper.name}`,
    `lookup:${cli.name}`,
    `publish:${cli.name}`,
    `lookup:${cli.name}`
  ]);
});

test("fails closed when an immutable npm version has different bytes", async () => {
  let published = false;
  await assert.rejects(
    publishPackageSequence({
      packages: [helper],
      lookupIntegrity: async () => "sha512-ZGlmZmVyZW50",
      publish: async () => {
        published = true;
        return { ok: true, status: 0 };
      }
    }),
    /different bytes/u
  );
  assert.equal(published, false);
});

test("accepts a matching registry result after a lost publish response", async () => {
  let lookups = 0;
  const results = await publishPackageSequence({
    packages: [helper],
    lookupIntegrity: async () => (++lookups === 1 ? null : helper.integrity),
    publish: async () => ({ ok: false, status: 1 }),
    sleep: async () => {},
    pollDelayMs: 0
  });
  assert.deepEqual(results, [{ name: helper.name, status: "recovered-after-publish-error" }]);
});
