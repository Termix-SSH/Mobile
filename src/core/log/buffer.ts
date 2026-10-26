import { useSyncExternalStore } from "react";

export interface LogLine {
  at: number;
  level: string;
  text: string;
}

export const LOG_LIMIT = 3000;
const MAX_LINE = 1000;

let lines: LogLine[] = [];
const listeners = new Set<() => void>();

/** Keeps the latest log lines in memory so About can show or share them. */
export function pushLog(level: string, text: string, at = Date.now()): void {
  const line = {
    at,
    level,
    text: text.length > MAX_LINE ? `${text.slice(0, MAX_LINE)}...` : text,
  };
  lines = [...lines.slice(-(LOG_LIMIT - 1)), line];
  listeners.forEach((l) => l());
}

export function getLogs(): LogLine[] {
  return lines;
}

export function clearLogs(): void {
  lines = [];
  listeners.forEach((l) => l());
}

/** One text block, oldest first, ready to copy or share. */
export function formatLogs(list: LogLine[] = lines): string {
  return list
    .map(
      (l) =>
        `${new Date(l.at).toISOString()} ${l.level.toUpperCase()} ${l.text}`,
    )
    .join("\n");
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useLogs(): LogLine[] {
  return useSyncExternalStore(subscribe, getLogs, getLogs);
}
