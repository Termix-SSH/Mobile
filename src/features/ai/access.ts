import type { AiStatus } from "./types";

export type AiAccess =
  | { state: "not-installed" }
  | { state: "disabled-globally" }
  | { state: "needs-opt-in"; allowReadOnlyCommands: boolean }
  | { state: "ready"; allowReadOnlyCommands: boolean }
  | { state: "signed-out" }
  | { state: "forbidden" }
  | { state: "error"; message: string };

export function accessFromStatus(status: AiStatus | null): AiAccess {
  if (!status) return { state: "error", message: "Unexpected response" };
  if (!status.globallyEnabled) return { state: "disabled-globally" };
  return {
    state: status.enabled ? "ready" : "needs-opt-in",
    allowReadOnlyCommands: status.allowReadOnlyCommands,
  };
}

export function accessFromHttpError(
  httpStatus: number | undefined,
  data: unknown,
): AiAccess {
  if (httpStatus === 401) return { state: "signed-out" };
  if (httpStatus === 403) return { state: "forbidden" };
  if (
    httpStatus === 404 ||
    (typeof data === "string" && /^\s*<(!doctype|html)/i.test(data))
  ) {
    return { state: "not-installed" };
  }
  const message =
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "string" &&
    data.error.trim()
      ? data.error
      : httpStatus === undefined
        ? "Unable to reach the AI service"
        : `AI request failed (${httpStatus})`;
  return { state: "error", message };
}
