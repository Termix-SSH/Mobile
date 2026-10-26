import { AppState, Keyboard } from "react-native";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { AppLockProvider, useAppLock } from "@/contexts/AppLockContext";
import { isAppLocked, onAppLocked, onAppUnlocked } from "@/core/lock";
import { resetStorage } from "../helpers/http";

jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));
jest.mock("@/core/db/stores", () => ({
  localStores: { lock: jest.fn(), unlock: jest.fn() },
}));

type Listener = (s: string) => void;
let listener: Listener | null = null;

beforeEach(async () => {
  await resetStorage();
  listener = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation(((
    _t: string,
    fn: Listener,
  ) => {
    listener = fn;
    return { remove: () => (listener = null) };
  }) as never);
  jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

async function setup(enabled = true) {
  if (enabled) {
    await AsyncStorage.setItem("appLockEnabled", "true");
  }
  const hook = await renderHook(() => useAppLock(), {
    wrapper: AppLockProvider,
  });
  await waitFor(() => expect(hook.result.current.enabled).toBe(enabled));
  return hook;
}

const send = (s: string) => act(() => listener?.(s));

describe("AppLockProvider", () => {
  it("hides the app switcher picture with App Lock off", async () => {
    const { result } = await setup(false);
    await act(() => result.current.setHideInSwitcher(true));
    await send("inactive");
    expect(result.current.covered).toBe(true);
    expect(result.current.locked).toBe(false);
    await send("active");
    expect(result.current.covered).toBe(false);
  });

  it("starts locked when enabled and runs the lock hooks", async () => {
    const hook = jest.fn();
    const off = onAppLocked(hook);
    const { result } = await setup();
    expect(result.current.locked).toBe(true);
    expect(hook).toHaveBeenCalled();
    expect(Keyboard.dismiss).toHaveBeenCalled();
    off();
  });

  it("marks the app locked and runs unlock hooks once on unlock", async () => {
    const unlock = jest.fn();
    const off = onAppUnlocked(unlock);
    const { result } = await setup();
    expect(isAppLocked()).toBe(true);
    expect(unlock).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.unlockWithBiometrics();
    });
    expect(result.current.locked).toBe(false);
    expect(isAppLocked()).toBe(false);
    expect(unlock).toHaveBeenCalledTimes(1);
    off();
  });

  it("unlocks with the right pin and rejects a wrong one", async () => {
    const { result } = await setup(false);
    await act(() => result.current.enable("1234"));
    expect(result.current.locked).toBe(false);
    await send("background");
    await act(() => result.current.setDelayMs(0));
    await send("active");
    await send("inactive");
    expect(result.current.locked).toBe(true);
    await send("active");
    let ok = true;
    await act(async () => {
      ok = await result.current.unlockWithPin("0000");
    });
    expect(ok).toBe(false);
    expect(result.current.locked).toBe(true);
    await act(async () => {
      ok = await result.current.unlockWithPin("1234");
    });
    expect(ok).toBe(true);
    expect(result.current.locked).toBe(false);
  });

  it("blocks the pin after five wrong tries", async () => {
    const { result } = await setup(false);
    await act(() => result.current.enable("1234"));
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await result.current.verifyPin("9999");
      });
    }
    expect(result.current.pinWaitMs).toBeGreaterThan(0);
    let ok = true;
    await act(async () => {
      ok = await result.current.verifyPin("1234");
    });
    expect(ok).toBe(false);
  });

  it("does not lock for the biometric prompt", async () => {
    const { result } = await setup(false);
    await act(() => result.current.enable("1234"));
    await act(() => result.current.setDelayMs(0));
    (LocalAuthentication.authenticateAsync as jest.Mock).mockImplementationOnce(
      async () => {
        listener?.("inactive");
        listener?.("active");
        return { success: false };
      },
    );
    await act(async () => {
      await result.current.authenticateBiometrics();
    });
    expect(result.current.locked).toBe(false);
  });

  it("changes the pin only with the old one", async () => {
    const { result } = await setup(false);
    await act(() => result.current.enable("1234"));
    let ok = true;
    await act(async () => {
      ok = await result.current.changePin("0000", "5555");
    });
    expect(ok).toBe(false);
    await act(async () => {
      ok = await result.current.changePin("1234", "5555");
    });
    expect(ok).toBe(true);
    await act(async () => {
      ok = await result.current.verifyPin("5555");
    });
    expect(ok).toBe(true);
  });

  it("covers the screen in the switcher only when hide is on", async () => {
    const { result } = await setup(false);
    await act(() => result.current.enable("1234"));
    await act(() => result.current.setDelayMs(60_000));
    await send("inactive");
    expect(result.current.covered).toBe(false);
    await send("active");
    await act(() => result.current.setHideInSwitcher(true));
    await send("inactive");
    expect(result.current.covered).toBe(true);
    await send("active");
    expect(result.current.covered).toBe(false);
  });
});
