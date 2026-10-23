// Auto mode lets CI drive the lab through a deep link and read one result line.
import { round1, summarizeFrames, throughputMBs } from "./metrics";

// termix-mobile://dev/terminal-lab?engine=ghostty&scenario=yes&seconds=20&auto=1

export const ENGINES = ["ghostty", "native", "xterm"] as const;
export type EngineId = (typeof ENGINES)[number];

export const SCENARIOS = ["echo", "yes", "log", "alt", "idle"] as const;
export type ScenarioId = (typeof SCENARIOS)[number];

export interface AutoRun {
  engine: EngineId;
  scenario: ScenarioId;
  seconds: number;
  /** Target flood rate for yes and log, in MB/s. 0 means as fast as possible. */
  rate: number;
}

type Params = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseEngine(v: string | string[] | undefined): EngineId | null {
  const s = first(v);
  return ENGINES.includes(s as EngineId) ? (s as EngineId) : null;
}

export function parseAutoRun(params: Params): AutoRun | null {
  if (first(params.auto) !== "1") return null;
  const engine = parseEngine(params.engine);
  const scenario = first(params.scenario) as ScenarioId;
  if (!engine || !SCENARIOS.includes(scenario)) return null;
  const seconds = Number(first(params.seconds) ?? 20);
  const rate = Number(first(params.rate) ?? 0);
  return {
    engine,
    scenario,
    seconds:
      Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 300) : 20,
    rate: Number.isFinite(rate) && rate >= 0 ? rate : 0,
  };
}

/** The line CI greps from logcat or the simulator log. */
export function resultLine(result: Record<string, unknown>): string {
  return `TXRESULT ${JSON.stringify(result)}`;
}

export interface RunInput {
  run: AutoRun;
  platform: string;
  refreshHz: number;
  intervalsMs: number[];
  frameTotalsMs: number[];
  engine: Record<string, number | undefined> | null;
  bytes: number;
  elapsedMs: number;
  memStartMb: number;
  memPeakMb: number;
}

/** The record CI collects for one engine and scenario. */
export function buildResult(r: RunInput): Record<string, unknown> {
  const ui = summarizeFrames(r.intervalsMs, r.refreshHz);
  const drawn = summarizeFrames(r.frameTotalsMs, r.refreshHz);
  return {
    engine: r.run.engine,
    scenario: r.run.scenario,
    platform: r.platform,
    seconds: r.run.seconds,
    refreshHz: round1(r.refreshHz),
    uiFps: round1(ui.fps),
    uiP50: round1(ui.p50),
    uiP95: round1(ui.p95),
    uiMax: round1(ui.max),
    uiDropped: ui.dropped,
    drawnFrames: drawn.frames,
    drawP50: round1(drawn.p50),
    drawP95: round1(drawn.p95),
    engineFrames: r.engine?.renderedFrames,
    engineP50:
      r.engine?.renderMsP50 != null ? round1(r.engine.renderMsP50) : undefined,
    engineP95:
      r.engine?.renderMsP95 != null ? round1(r.engine.renderMsP95) : undefined,
    mbps: throughputMBs(r.bytes, r.elapsedMs),
    memStartMb: Math.round(r.memStartMb),
    memPeakMb: Math.round(r.memPeakMb),
  };
}
