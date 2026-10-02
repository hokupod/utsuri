import { expect, test } from "bun:test";
import {
  capabilityCacheAgeMs,
  capabilityStorageKey,
  parseCachedCapability
} from "./interactive-capability";

test("scopes capabilities to origin including port, viewer path and report identity", () => {
  const key = capabilityStorageKey("http://127.0.0.1:4000", "/index.html", "report-a");
  expect(key).not.toBe(capabilityStorageKey("http://127.0.0.1:4001", "/index.html", "report-a"));
  expect(key).not.toBe(capabilityStorageKey("http://127.0.0.1:4000", "/other.html", "report-a"));
  expect(key).not.toBe(capabilityStorageKey("http://127.0.0.1:4000", "/index.html", "report-b"));
});

test("retains expiry and rejects expired, oversized-age and malformed capability caches", () => {
  const now = 1000;
  const token = "a".repeat(32);
  const serialized = JSON.stringify({ token, expiresAt: now + capabilityCacheAgeMs });
  expect(parseCachedCapability(serialized, now + 100)).toEqual({
    token,
    expiresAt: now + capabilityCacheAgeMs
  });
  expect(parseCachedCapability(serialized, now + capabilityCacheAgeMs)).toBeNull();
  for (const value of [
    { token, expiresAt: now + capabilityCacheAgeMs + 1 },
    { token, expiresAt: now, extra: true },
    { token: "bad", expiresAt: now + 1 },
    { token, expiresAt: "2000" }
  ])
    expect(parseCachedCapability(JSON.stringify(value), now)).toBeNull();
  expect(parseCachedCapability("malformed", now)).toBeNull();
});
