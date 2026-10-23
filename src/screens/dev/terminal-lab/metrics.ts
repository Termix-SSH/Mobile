// Frame timing summary for the lab overlay and the CI result line.

export interface FrameSummary {
  frames: number;
  fps: number;
  p50: number;
  p95: number;
  max: number;
  /** Frames that took longer than 1.5 vsync intervals. */
  dropped: number;
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

export function summarizeFrames(
  intervalsMs: number[],
  refreshHz = 60,
): FrameSummary {
  if (intervalsMs.length === 0) {
    return { frames: 0, fps: 0, p50: 0, p95: 0, max: 0, dropped: 0 };
  }
  const sorted = [...intervalsMs].sort((a, b) => a - b);
  const total = intervalsMs.reduce((a, b) => a + b, 0);
  const budget = (1000 / refreshHz) * 1.5;
  return {
    frames: intervalsMs.length,
    fps: total > 0 ? (intervalsMs.length * 1000) / total : 0,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1],
    dropped: intervalsMs.filter((ms) => ms > budget).length,
  };
}

/** Bytes per second over a window, as MB/s with one decimal. */
export function throughputMBs(bytes: number, ms: number): number {
  if (ms <= 0) return 0;
  return Math.round((bytes / 1024 / 1024 / (ms / 1000)) * 10) / 10;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
