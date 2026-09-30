export function resolveRemoteDesktopSize(
  config: unknown,
  width: number,
  height: number,
  pixelRatio: number,
): { width: number; height: number } {
  let settings: Record<string, unknown> = {};
  try {
    const parsed = typeof config === "string" ? JSON.parse(config) : config;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      settings = parsed;
    }
  } catch {
    // Older servers may return malformed or empty optional configuration.
  }
  const dimension = (value: unknown, fallback: number) => {
    const configured =
      typeof value === "number" || typeof value === "string"
        ? Number(value)
        : NaN;
    return Number.isFinite(configured) && configured > 0
      ? Math.max(1, Math.round(configured))
      : Math.max(1, Math.round(fallback * pixelRatio));
  };
  return {
    width: dimension(settings.width, width),
    height: dimension(settings.height, height),
  };
}
