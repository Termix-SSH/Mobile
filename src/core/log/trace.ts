import { pushLog } from "./buffer";
import { redactText } from "./logger";

/** Short lines for chasing a bug with a user. They land in Settings, Logs in every build. */
export function trace(
  area: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  let extra = "";
  try {
    extra = data ? ` ${JSON.stringify(data)}` : "";
  } catch {
    extra = "";
  }
  const text = redactText(`[trace:${area}] ${message}${extra}`);
  pushLog("debug", text);
  if (__DEV__) console.log(text);
}

/** The last part of a tab id, enough to tell tabs apart in a log. */
export function tabTag(id: string | null | undefined): string {
  if (!id) return "none";
  return id.split("-").slice(-1)[0];
}
