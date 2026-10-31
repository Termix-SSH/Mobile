import { usePoll } from "@/core/exec/usePoll";

/**
 * Polling that pauses while the app is in the background or `enabled` is
 * false. A thin wrapper around `usePoll` for callers that need no abort signal.
 */
export function usePolling(
  fn: () => void | Promise<void>,
  intervalMs: number,
  enabled = true,
): void {
  usePoll(() => fn(), { intervalMs, enabled });
}
