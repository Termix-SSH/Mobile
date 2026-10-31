export interface RemoteDesktopSize {
  width: number;
  height: number;
  /** Only set when the session should scale up, e.g. RDP on a high density screen. */
  dpi?: number;
}

const MAX_RATIO = 3;

function readConfig(config: unknown): Record<string, unknown> {
  try {
    const parsed = typeof config === "string" ? JSON.parse(config) : config;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Older servers may return malformed or empty optional configuration.
  }
  return {};
}

function positive(value: unknown): number | null {
  const n =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : NaN;
  return Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n)) : null;
}

export function resolveRemoteDesktopSize(
  config: unknown,
  width: number,
  height: number,
  pixelRatio: number,
): RemoteDesktopSize {
  const settings = readConfig(config);
  const ratio = Math.min(pixelRatio, MAX_RATIO);
  const fixedW = positive(settings.width);
  const fixedH = positive(settings.height);
  const size: RemoteDesktopSize = {
    width: fixedW ?? Math.max(1, Math.round(width * ratio)),
    height: fixedH ?? Math.max(1, Math.round(height * ratio)),
  };
  // A size scaled by the pixel ratio needs the same dpi, or text comes out tiny.
  const dpi = positive(settings.dpi);
  if (dpi) size.dpi = dpi;
  else if ((!fixedW || !fixedH) && ratio > 1) {
    size.dpi = Math.round(96 * ratio);
  }
  return size;
}
