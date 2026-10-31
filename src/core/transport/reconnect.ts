import type { ConnectFailure } from "./errors";

/** Tries after a drop before the tab gives up and shows the reason. */
export const MAX_RECONNECT_TRIES = 10;

// The first try is right away, then it backs off.
const STEPS_MS = [0, 1000, 2000, 4000, 8000, 15000, 30000];
const LOW_POWER_CAP_MS = 60000;

/**
 * Wait before reconnect try `attempt` (1 based), with a little jitter so many
 * tabs don't hit the host at the same moment. Low power mode waits longer.
 */
export function reconnectDelay(
  attempt: number,
  opts: { lowPower?: boolean; random?: () => number } = {},
): number {
  const base = STEPS_MS[Math.min(Math.max(attempt, 1), STEPS_MS.length) - 1];
  if (base === 0) return 0;
  const wait = opts.lowPower ? Math.min(base * 2, LOW_POWER_CAP_MS) : base;
  const random = opts.random ?? Math.random;
  return Math.round(wait * (0.8 + 0.4 * random()));
}

const SIGNED_OUT = /sign in|signed out|server url|not configured/i;

/** Whether a failure while reconnecting is worth another try. */
export function isRetryable(failure: ConnectFailure): boolean {
  if (failure.noRetry) return false;
  switch (failure.stage) {
    case "network":
    case "session":
      return true;
    case "server":
      return (
        !SIGNED_OUT.test(failure.message) && !SIGNED_OUT.test(failure.hint)
      );
    default:
      return false;
  }
}
