import { pushLog } from "./buffer";
import { redactText } from "./logger";

function short(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) =>
      typeof v === "string" && v.length > 80 ? `${v.slice(0, 80)}...` : v,
    );
  } catch {
    return String(value);
  }
}

/**
 * Detailed lines for chasing a bug with a user. They land in Settings, Logs
 * in every build, with addresses and secrets hidden like other log lines.
 */
export function trace(
  area: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  const text = redactText(
    `[trace:${area}] ${message}${data ? ` ${short(data)}` : ""}`,
  );
  pushLog("debug", text);
  if (__DEV__) console.log(text);
}

/** Who called the function that calls this, from the stack. Names only show in dev builds. */
export function callerOf(): string | undefined {
  return new Error().stack?.split("\n")[3]?.trim();
}

/** The last part of a tab id, enough to tell tabs apart in a log. */
export function tabTag(id: string | null | undefined): string {
  if (!id) return "none";
  const parts = id.split("-");
  return parts.length > 2 ? parts.slice(-2).join("-") : id;
}
