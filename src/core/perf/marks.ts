import { systemLogger } from "@/core/log/logger";

export type StartupMark = "bundle" | "fonts" | "ready";

const marks: Partial<Record<StartupMark, number>> = {};

/** Notes when a startup step finished, in ms since the app started. The first time only. */
export function markStartup(name: StartupMark, now = performance.now()): void {
  if (marks[name] !== undefined) return;
  marks[name] = Math.round(now);
  if (name === "ready" && __DEV__) {
    systemLogger.performance(`startup ${describeStartup()}`);
  }
}

export function startupMarks(): Partial<Record<StartupMark, number>> {
  return { ...marks };
}

/** "bundle 410 ms | fonts 520 ms | ready 830 ms", for the log. */
export function describeStartup(): string {
  return (["bundle", "fonts", "ready"] as const)
    .filter((name) => marks[name] !== undefined)
    .map((name) => `${name} ${marks[name]} ms`)
    .join(" | ");
}

export function resetStartupMarksForTests(): void {
  for (const key of Object.keys(marks)) delete marks[key as StartupMark];
}
