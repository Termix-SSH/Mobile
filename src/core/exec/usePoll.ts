import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { sessionLifecycle } from "@/core/sessions/lifecycle";

export interface PollOptions {
  intervalMs: number;
  /** False pauses it, for a hidden tab or screen. */
  enabled?: boolean;
}

/** Low power mode polls this many times slower. */
export const LOW_POWER_FACTOR = 3;

/**
 * Runs `task` now and then every `intervalMs` while enabled and the app is in
 * front. Runs never overlap, and the one in flight is aborted when polling
 * pauses or the screen goes away, so nothing keeps the host busy behind the
 * user's back.
 */
export function usePoll(
  task: (signal: AbortSignal) => void | Promise<void>,
  { intervalMs, enabled = true }: PollOptions,
): void {
  const taskRef = useRef(task);
  taskRef.current = task;

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running: AbortController | null = null;
    let active = false;

    const schedule = () => {
      if (!active) return;
      const factor = sessionLifecycle.isLowPower ? LOW_POWER_FACTOR : 1;
      timer = setTimeout(tick, intervalMs * factor);
    };

    const tick = async () => {
      timer = null;
      if (!active || running) return;
      const controller = new AbortController();
      running = controller;
      try {
        await taskRef.current(controller.signal);
      } catch {
        // The task shows its own errors; a failed poll just waits for the next.
      } finally {
        if (running === controller) running = null;
      }
      if (!controller.signal.aborted) schedule();
    };

    const start = () => {
      if (active) return;
      active = true;
      void tick();
    };
    const stop = () => {
      active = false;
      if (timer) clearTimeout(timer);
      timer = null;
      running?.abort();
      running = null;
    };

    if (AppState.currentState === "active") start();
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") start();
      else if (state === "background") stop();
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [intervalMs, enabled]);
}
