import {
  nativeDebugInfo,
  takeNativeDebugLines,
} from "@/modules/termix-terminal";
import { trace } from "@/core/log/trace";

let timer: ReturnType<typeof setInterval> | null = null;
let lastError = "";

/** Moves the native terminal's trace lines into Settings, Logs once a second. */
export function startNativeTrace(): void {
  if (timer) return;
  trace("native", "drain started", nativeDebugInfo());
  let total = 0;
  const drain = () => {
    try {
      const lines = takeNativeDebugLines();
      if (!Array.isArray(lines)) {
        trace("native", "drain got something odd", { type: typeof lines });
        return;
      }
      if (!total && lines.length) {
        trace("native", "first native lines", { count: lines.length });
      }
      total += lines.length;
      for (const line of lines) trace("native", String(line));
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (text !== lastError) {
        lastError = text;
        trace("native", "drain failed", { error: text });
      }
    }
  };
  drain();
  timer = setInterval(drain, 1000);
}
