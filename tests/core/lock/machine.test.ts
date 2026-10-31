import {
  initialLockState,
  lockReducer,
  shouldCover,
  pinFailed,
  pinWaitLeft,
  NO_PIN_LIMIT,
  PIN_MAX_FAILS,
  PIN_WAIT_MS,
  type LockEvent,
  type LockState,
} from "@/core/lock/machine";

function run(s: LockState, ...events: LockEvent[]) {
  return events.reduce(lockReducer, s);
}
const app = (state: "active" | "inactive" | "background", now: number) =>
  ({ type: "app", state, now }) as const;

const on = () => run(initialLockState(), { type: "enable" });

describe("lock machine", () => {
  it("never locks when disabled", () => {
    const s = run(initialLockState(), app("background", 0), app("active", 1e9));
    expect(s.locked).toBe(false);
  });

  it("locks on cold start when enabled", () => {
    expect(
      run(initialLockState(), { type: "start", enabled: true }).locked,
    ).toBe(true);
    expect(
      run(initialLockState(), { type: "start", enabled: false }).locked,
    ).toBe(false);
  });

  it("stays open for a short trip and locks after the delay", () => {
    expect(run(on(), app("background", 0), app("active", 14_999)).locked).toBe(
      false,
    );
    expect(run(on(), app("background", 0), app("active", 15_000)).locked).toBe(
      true,
    );
  });

  it("keeps the first leave time through inactive then background", () => {
    const s = run(
      on(),
      app("inactive", 0),
      app("background", 10_000),
      app("active", 15_000),
    );
    expect(s.locked).toBe(true);
  });

  it("clears the leave time on return so a stale stamp cannot lock later", () => {
    const s = run(
      on(),
      app("background", 0),
      app("active", 1000),
      app("inactive", 100_000),
      app("active", 100_500),
    );
    expect(s.locked).toBe(false);
    expect(s.leftAt).toBeNull();
  });

  it("locks the moment the app leaves when the delay is zero", () => {
    const s = run(on(), { type: "delay", ms: 0 }, app("inactive", 5));
    expect(s.locked).toBe(true);
  });

  it("counts resumes only when locked", () => {
    const s = run(on(), app("background", 0), app("active", 20_000));
    expect(s.resumes).toBe(1);
    const t = run(s, app("background", 20_001), app("active", 20_002));
    expect(t.resumes).toBe(2);
    const u = run(on(), app("background", 0), app("active", 1));
    expect(u.resumes).toBe(0);
  });

  it("ignores inactive caused by our own biometric prompt", () => {
    const s = run(
      on(),
      { type: "delay", ms: 0 },
      { type: "bioStart" },
      app("inactive", 100),
      app("active", 5000),
      { type: "bioEnd" },
    );
    expect(s.locked).toBe(false);
  });

  it("ignores the settle when the prompt closes before active returns", () => {
    const s = run(
      on(),
      { type: "delay", ms: 0 },
      { type: "bioStart" },
      app("inactive", 100),
      { type: "bioEnd" },
      app("active", 9000),
    );
    expect(s.locked).toBe(false);
    expect(s.settling).toBe(false);
  });

  it("locks again after the prompt when the user really leaves", () => {
    const s = run(
      on(),
      { type: "bioStart" },
      app("inactive", 1),
      app("active", 2),
      { type: "bioEnd" },
      app("background", 10),
      app("active", 20_000),
    );
    expect(s.locked).toBe(true);
  });

  it("unlock clears the lock and enable/disable reset it", () => {
    const locked = run(on(), app("background", 0), app("active", 20_000));
    expect(run(locked, { type: "unlock" }).locked).toBe(false);
    expect(run(locked, { type: "disable" }).enabled).toBe(false);
    expect(run(locked, { type: "enable" }).locked).toBe(false);
  });

  it("stays locked while backgrounded again", () => {
    const s = run(
      on(),
      app("background", 0),
      app("active", 20_000),
      app("background", 21_000),
    );
    expect(s.locked).toBe(true);
  });

  it("covers the screen when locked or leaving with hide on", () => {
    const front = on();
    expect(shouldCover(front, true)).toBe(false);
    const away = run(front, { type: "delay", ms: 60_000 }, app("inactive", 1));
    expect(shouldCover(away, true)).toBe(true);
    expect(shouldCover(away, false)).toBe(false);
    // With App Lock off, hide still covers the app switcher picture.
    expect(shouldCover(initialLockState("inactive"), true)).toBe(true);
    expect(shouldCover(initialLockState("inactive"), false)).toBe(false);
    expect(shouldCover(initialLockState("active"), true)).toBe(false);
    const prompt = run(front, { type: "bioStart" }, app("inactive", 1));
    expect(shouldCover(prompt, true)).toBe(false);
  });
});

describe("pin limiter", () => {
  it("waits after too many wrong pins", () => {
    let l = NO_PIN_LIMIT;
    for (let i = 0; i < PIN_MAX_FAILS - 1; i++) {
      l = pinFailed(l, 1000);
      expect(pinWaitLeft(l, 1000)).toBe(0);
    }
    l = pinFailed(l, 1000);
    expect(pinWaitLeft(l, 1000)).toBe(PIN_WAIT_MS);
    expect(pinWaitLeft(l, 1000 + PIN_WAIT_MS)).toBe(0);
    expect(l.fails).toBe(0);
  });
});
