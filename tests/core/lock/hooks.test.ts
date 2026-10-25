import {
  isAppLocked,
  onAppLocked,
  onAppUnlocked,
  runLockHooks,
  runUnlockHooks,
  setAppLocked,
} from "@/core/lock";

afterEach(() => setAppLocked(false));

describe("lock hooks", () => {
  it("keeps the locked flag", () => {
    expect(isAppLocked()).toBe(false);
    setAppLocked(true);
    expect(isAppLocked()).toBe(true);
    setAppLocked(false);
    expect(isAppLocked()).toBe(false);
  });

  it("runs lock and unlock hooks apart and stops after removal", () => {
    const lock = jest.fn();
    const unlock = jest.fn();
    const offLock = onAppLocked(lock);
    const offUnlock = onAppUnlocked(unlock);
    runLockHooks();
    expect(lock).toHaveBeenCalledTimes(1);
    expect(unlock).not.toHaveBeenCalled();
    runUnlockHooks();
    expect(unlock).toHaveBeenCalledTimes(1);
    offLock();
    offUnlock();
    runLockHooks();
    runUnlockHooks();
    expect(lock).toHaveBeenCalledTimes(1);
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it("keeps going when a hook throws", () => {
    const after = jest.fn();
    const offBad = onAppUnlocked(() => {
      throw new Error("boom");
    });
    const off = onAppUnlocked(after);
    expect(() => runUnlockHooks()).not.toThrow();
    expect(after).toHaveBeenCalled();
    offBad();
    off();
  });
});
