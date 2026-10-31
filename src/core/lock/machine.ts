export type LockAppState = "active" | "inactive" | "background";

export interface LockState {
  enabled: boolean;
  locked: boolean;
  /** Our own biometric prompt is open, so inactive does not mean the user left. */
  authenticating: boolean;
  /** The prompt closed while the app was not active yet, so the next active is ours. */
  settling: boolean;
  app: LockAppState;
  /** When the app stopped being active, or null while it is in front. */
  leftAt: number | null;
  delayMs: number;
  /** Goes up on every return to the app while locked. */
  resumes: number;
}

export type LockEvent =
  | { type: "app"; state: LockAppState; now: number }
  | { type: "enable" }
  | { type: "disable" }
  | { type: "start"; enabled: boolean }
  | { type: "unlock" }
  | { type: "delay"; ms: number }
  | { type: "bioStart" }
  | { type: "bioEnd" };

export const LOCK_DELAYS = [
  { id: "now", label: "Right away", ms: 0 },
  { id: "15s", label: "After 15 seconds", ms: 15_000 },
  { id: "1m", label: "After 1 minute", ms: 60_000 },
  { id: "5m", label: "After 5 minutes", ms: 300_000 },
] as const;

export const DEFAULT_LOCK_DELAY_MS = 15_000;

export function initialLockState(
  app: LockAppState = "active",
  delayMs = DEFAULT_LOCK_DELAY_MS,
): LockState {
  return {
    enabled: false,
    locked: false,
    authenticating: false,
    settling: false,
    app,
    leftAt: null,
    delayMs,
    resumes: 0,
  };
}

export function lockReducer(s: LockState, e: LockEvent): LockState {
  switch (e.type) {
    case "start":
      return { ...s, enabled: e.enabled, locked: e.enabled };
    case "enable":
      return { ...s, enabled: true, locked: false, leftAt: null };
    case "disable":
      return { ...s, enabled: false, locked: false, leftAt: null };
    case "unlock":
      return { ...s, locked: false, leftAt: null };
    case "delay":
      return { ...s, delayMs: Math.max(0, e.ms) };
    case "bioStart":
      return { ...s, authenticating: true, settling: false };
    case "bioEnd":
      return {
        ...s,
        authenticating: false,
        settling: s.app !== "active",
        leftAt: null,
      };
    case "app":
      return appChange(s, e.state, e.now);
  }
}

function appChange(s: LockState, next: LockAppState, now: number): LockState {
  const prev = s.app;
  if (next === prev) return s;
  const base = { ...s, app: next };
  if (!s.enabled) return base;

  if (next !== "active") {
    // Our own prompt (and the settle after it) is not the user leaving.
    if (s.authenticating || s.settling) return base;
    const leftAt = s.leftAt ?? now;
    return { ...base, leftAt, locked: s.locked || s.delayMs === 0 };
  }

  // Back in front.
  if (s.settling) return { ...base, settling: false, leftAt: null };
  const away = s.leftAt == null ? 0 : now - s.leftAt;
  const locked = s.locked || (s.leftAt != null && away >= s.delayMs);
  return {
    ...base,
    locked,
    leftAt: null,
    resumes: locked ? s.resumes + 1 : s.resumes,
  };
}

/**
 * Whether the screen should be covered: locked, or the system may snapshot
 * it. Hiding in the app switcher works with App Lock off too.
 */
export function shouldCover(s: LockState, hideInSwitcher: boolean): boolean {
  if (s.enabled && s.locked) return true;
  return hideInSwitcher && s.app !== "active" && !s.authenticating;
}

export const PIN_MAX_FAILS = 5;
export const PIN_WAIT_MS = 30_000;

export interface PinLimit {
  fails: number;
  until: number;
}

export const NO_PIN_LIMIT: PinLimit = { fails: 0, until: 0 };

export function pinWaitLeft(l: PinLimit, now: number): number {
  return Math.max(0, l.until - now);
}

export function pinFailed(l: PinLimit, now: number): PinLimit {
  const fails = l.fails + 1;
  if (fails >= PIN_MAX_FAILS) return { fails: 0, until: now + PIN_WAIT_MS };
  return { fails, until: l.until };
}
