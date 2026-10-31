import type { NetCookie } from "@/modules/termix-net";

/**
 * Takes newer values from the jar for the cookies we keep. Proxies like
 * Authelia renew their cookie on the fly, and the saved copy must follow or a
 * restart puts the old value back. Returns null when nothing changed.
 */
export function mergeJarCookies(
  saved: NetCookie[],
  jar: NetCookie[],
): NetCookie[] | null {
  let changed = false;
  const next = saved.map((cookie) => {
    const live = jar.find((c) => c.name === cookie.name);
    if (!live || live.value === cookie.value) return cookie;
    changed = true;
    return {
      ...cookie,
      value: live.value,
      // Android's jar has no expiry, so keep ours unless the jar has one.
      expires: live.expires ?? cookie.expires ?? null,
    };
  });
  return changed ? next : null;
}

/** Saved cookies the jar lost, like session cookies after a restart. */
export function missingFromJar(
  saved: NetCookie[],
  jar: NetCookie[],
): NetCookie[] {
  return saved.filter((cookie) => !jar.some((c) => c.name === cookie.name));
}

/** True when any saved cookie has run out, so the proxy will ask again. */
export function hasExpiredCookie(saved: NetCookie[], now = Date.now()) {
  return saved.some(
    (cookie) => typeof cookie.expires === "number" && cookie.expires <= now,
  );
}
