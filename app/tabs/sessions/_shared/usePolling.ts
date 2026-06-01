import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

/**
 * Visibility-aware polling. Runs `fn` immediately when enabled, then on an
 * interval — but pauses while the app is backgrounded (the OS suspends timers
 * anyway, and we don't want a burst of stale requests on resume). Replaces the
 * hardcoded `setInterval` that each session type used to roll on its own.
 *
 * `fn` is kept in a ref so callers can pass an inline closure without resetting
 * the interval every render. The interval only restarts when `intervalMs` or
 * `enabled` change.
 */
export function usePolling(
  fn: () => void | Promise<void>,
  intervalMs: number,
  enabled = true,
): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const tick = () => {
      if (!cancelled) void fnRef.current();
    };

    const start = () => {
      if (timer) return;
      tick();
      timer = setInterval(tick, intervalMs);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onAppStateChange = (state: AppStateStatus) => {
      if (state === "active") start();
      else stop();
    };

    if (AppState.currentState === "active") start();
    const sub = AppState.addEventListener("change", onAppStateChange);

    return () => {
      cancelled = true;
      stop();
      sub.remove();
    };
  }, [intervalMs, enabled]);
}
