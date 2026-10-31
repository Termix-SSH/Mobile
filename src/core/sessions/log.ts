import type { ConnectionLogEntry } from "@/types";

export interface LogMeta {
  appVersion: string;
  platform: string;
  /** The host's name only; addresses and usernames stay out of bug reports. */
  hostName: string;
  transport: string | null;
  state: string;
  network?: string | null;
  lowPower?: boolean;
  /** Text to hide from messages, like the address and username. */
  redact?: { text: string; as: string }[];
}

function redact(message: string, rules: LogMeta["redact"]): string {
  let out = message;
  for (const r of rules ?? []) {
    if (r.text.length >= 2) out = out.split(r.text).join(r.as);
  }
  return out;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function time(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** The connection log as plain text to paste into a bug report. */
export function formatConnectionLog(
  entries: ConnectionLogEntry[],
  meta: LogMeta,
  now: number = Date.now(),
): string {
  const head = [
    `Termix Mobile ${meta.appVersion} | ${meta.platform}`,
    `Host: ${meta.hostName} | Way: ${meta.transport ?? "unknown"} | State: ${meta.state}`,
  ];
  if (meta.network || meta.lowPower) {
    head.push(
      [
        meta.network ? `Network: ${meta.network}` : null,
        meta.lowPower ? "Low power mode" : null,
      ]
        .filter(Boolean)
        .join(" | "),
    );
  }
  head.push(`Copied: ${new Date(now).toISOString()}`, "");
  const lines = entries.map((e) => {
    const stage = e.stage ? ` ${e.stage}` : "";
    return `${time(e.timestamp)} [${e.level.toUpperCase()}${stage}] ${redact(e.message, meta.redact)}`;
  });
  return [...head, ...lines].join("\n");
}
