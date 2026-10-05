/** Client cache age only; the server rotates its capability at every startup. */
export const capabilityCacheAgeMs = 8 * 60 * 60 * 1000;

export function capabilityStorageKey(origin: string, pathname: string, reportId: string): string {
  return `utsuri:interactive:${JSON.stringify([origin, pathname, reportId])}`;
}

export function parseCachedCapability(
  serialized: string,
  now: number
): { token: string; expiresAt: number } | null {
  try {
    const value = JSON.parse(serialized);
    if (
      !value ||
      Object.keys(value).sort().join(",") !== "expiresAt,token" ||
      typeof value.token !== "string" ||
      !/^[A-Za-z0-9_-]{32,128}$/u.test(value.token) ||
      !Number.isSafeInteger(value.expiresAt) ||
      value.expiresAt <= now ||
      value.expiresAt > now + capabilityCacheAgeMs
    )
      return null;
    return { token: value.token, expiresAt: value.expiresAt };
  } catch {
    return null;
  }
}
