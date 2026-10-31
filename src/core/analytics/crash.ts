import { sendEvent } from "./client";
import { crashEvent } from "./events";

interface ErrorUtilsLike {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(h: (error: unknown, isFatal?: boolean) => void): void;
}

/** Reports the class of a crash. Never the message or the stack. */
export function reportCrash(error: unknown, fatal: boolean): void {
  void sendEvent(crashEvent(error, fatal));
}

let installed = false;

/** Wraps the global handler, which still runs after the report is queued. */
export function installCrashReporting(
  utils: ErrorUtilsLike | undefined = (
    globalThis as { ErrorUtils?: ErrorUtilsLike }
  ).ErrorUtils,
): void {
  if (installed || !utils) return;
  installed = true;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    try {
      reportCrash(error, !!isFatal);
    } catch {
      // Never block the real handler.
    }
    previous?.(error, isFatal);
  });
}

/** For tests. */
export function resetCrashState(): void {
  installed = false;
}
