import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { AppState, Keyboard, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { localStores } from "@/core/db/stores";
import { DEVICE_ONLY } from "@/core/storage/kv";
import {
  DEFAULT_LOCK_DELAY_MS,
  NO_PIN_LIMIT,
  initialLockState,
  lockReducer,
  pinFailed,
  pinWaitLeft,
  runLockHooks,
  runUnlockHooks,
  setAppLocked,
  shouldCover,
  type LockAppState,
  type PinLimit,
} from "@/core/lock";

/**
 * App Lock - optional biometric / PIN gate when the app is opened or returns
 * from background. The PIN is stored in the OS secure store; the flags in
 * AsyncStorage. The when-to-lock rules live in `core/lock/machine`.
 */

export const APP_LOCK_ENABLED_KEY = "appLockEnabled";
export const APP_LOCK_DELAY_KEY = "appLockDelayMs";
export const APP_LOCK_HIDE_KEY = "appLockHideInSwitcher";
const ENABLED_KEY = APP_LOCK_ENABLED_KEY;
const PIN_KEY = "appLockPin"; // SecureStore

interface AppLockContextValue {
  enabled: boolean;
  locked: boolean;
  hasBiometrics: boolean;
  /** Goes up each time the user comes back while locked. */
  resumes: number;
  /** True when the screen must be hidden (locked, or leaving with hide on). */
  covered: boolean;
  delayMs: number;
  setDelayMs: (ms: number) => Promise<void>;
  hideInSwitcher: boolean;
  setHideInSwitcher: (on: boolean) => Promise<void>;
  /** Milliseconds left before a PIN can be tried again, 0 when open. */
  pinWaitMs: number;
  /** Enable app lock with a numeric PIN (biometrics used when available). */
  enable: (pin: string) => Promise<void>;
  /**
   * Tear down app lock. Performs no verification - callers MUST authenticate
   * the user (via `verifyPin` / `authenticateBiometrics`) first.
   */
  disable: () => Promise<void>;
  /** Compare a PIN against the stored one. Does NOT change lock state. */
  verifyPin: (pin: string) => Promise<boolean>;
  /**
   * Prompt for biometrics (no device-passcode fallback). Does NOT change lock
   * state - used for re-authentication in Settings.
   */
  authenticateBiometrics: () => Promise<boolean>;
  /** Attempt unlock via biometrics; unlocks on success. Returns success. */
  unlockWithBiometrics: () => Promise<boolean>;
  /** Attempt unlock via PIN; unlocks on success. Returns success. */
  unlockWithPin: (pin: string) => Promise<boolean>;
  /** Swap the PIN after checking the old one. */
  changePin: (oldPin: string, newPin: string) => Promise<boolean>;
}

const AppLockContext = createContext<AppLockContextValue | null>(null);

function toLockApp(s: AppStateStatus): LockAppState {
  return s === "active" || s === "background" ? s : "inactive";
}

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(lockReducer, undefined, () =>
    initialLockState(toLockApp(AppState.currentState)),
  );
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [hideInSwitcher, setHide] = useState(false);
  const [ready, setReady] = useState(false);
  const [limit, setLimit] = useState<PinLimit>(NO_PIN_LIMIT);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    (async () => {
      const [isEnabled, delay, hide, hw, enrolled] = await Promise.all([
        AsyncStorage.getItem(ENABLED_KEY),
        AsyncStorage.getItem(APP_LOCK_DELAY_KEY),
        AsyncStorage.getItem(APP_LOCK_HIDE_KEY),
        LocalAuthentication.hasHardwareAsync().catch(() => false),
        LocalAuthentication.isEnrolledAsync().catch(() => false),
      ]);
      const parsed = delay == null ? NaN : Number(delay);
      dispatch({
        type: "delay",
        ms: Number.isFinite(parsed) ? parsed : DEFAULT_LOCK_DELAY_MS,
      });
      setHide(hide === "true");
      // Only treat biometrics as available when the device has a sensor AND a
      // biometric is actually enrolled - otherwise the fingerprint button would
      // appear but do nothing.
      setHasBiometrics(!!hw && !!enrolled);
      dispatch({ type: "start", enabled: isEnabled === "true" });
      setReady(true);
    })();
  }, []);

  // Local data keys are only read while the app is unlocked.
  useEffect(() => {
    if (!ready) return;
    if (state.locked) localStores.lock();
    else localStores.unlock();
  }, [ready, state.locked]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      dispatch({ type: "app", state: toLockApp(next), now: Date.now() });
    });
    return () => sub.remove();
  }, []);

  // Let go of the keyboard when locking and on every return while locked, so
  // it never sits over the pad.
  useEffect(() => {
    if (!state.enabled || !state.locked) return;
    runLockHooks();
    Keyboard.dismiss();
  }, [state.enabled, state.locked, state.resumes]);

  const isLocked = state.enabled && state.locked;
  const wasLocked = useRef(false);
  useEffect(() => {
    setAppLocked(isLocked);
    if (wasLocked.current && !isLocked) runUnlockHooks();
    wasLocked.current = isLocked;
  }, [isLocked]);

  useEffect(() => () => setAppLocked(false), []);

  // Tick while a PIN wait is running so the pad can show it.
  useEffect(() => {
    if (pinWaitLeft(limit, Date.now()) === 0) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (pinWaitLeft(limit, n) === 0) clearInterval(t);
    }, 1000);
    setNow(Date.now());
    return () => clearInterval(t);
  }, [limit]);

  const setDelayMs = useCallback(async (ms: number) => {
    await AsyncStorage.setItem(APP_LOCK_DELAY_KEY, String(ms));
    dispatch({ type: "delay", ms });
  }, []);

  const setHideInSwitcher = useCallback(async (on: boolean) => {
    await AsyncStorage.setItem(APP_LOCK_HIDE_KEY, on ? "true" : "false");
    setHide(on);
  }, []);

  const enable = useCallback(async (pin: string) => {
    await SecureStore.setItemAsync(PIN_KEY, pin, DEVICE_ONLY);
    await AsyncStorage.setItem(ENABLED_KEY, "true");
    setLimit(NO_PIN_LIMIT);
    dispatch({ type: "enable" });
  }, []);

  const disable = useCallback(async () => {
    await SecureStore.deleteItemAsync(PIN_KEY, DEVICE_ONLY).catch(() => {});
    await AsyncStorage.setItem(ENABLED_KEY, "false");
    dispatch({ type: "disable" });
  }, []);

  // Prompt biometrics without changing lock state. Device-passcode fallback is
  // disabled so iOS never shows the phone passcode prompt - the in-app PIN is
  // the only fallback.
  const authenticateBiometrics = useCallback(async () => {
    try {
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) return false;
      dispatch({ type: "bioStart" });
      try {
        const res = await LocalAuthentication.authenticateAsync({
          promptMessage: "Unlock Termix",
          disableDeviceFallback: true,
          cancelLabel: "Use PIN",
        });
        return res.success;
      } finally {
        dispatch({ type: "bioEnd" });
      }
    } catch {
      return false;
    }
  }, []);

  const unlockWithBiometrics = useCallback(async () => {
    const ok = await authenticateBiometrics();
    if (ok) dispatch({ type: "unlock" });
    return ok;
  }, [authenticateBiometrics]);

  const limitRef = useRef(limit);
  limitRef.current = limit;

  const verifyPin = useCallback(async (pin: string) => {
    if (pinWaitLeft(limitRef.current, Date.now()) > 0) return false;
    const stored = await SecureStore.getItemAsync(PIN_KEY, DEVICE_ONLY).catch(
      () => null,
    );
    const ok = !!stored && stored === pin;
    if (ok) setLimit(NO_PIN_LIMIT);
    else setLimit((l) => pinFailed(l, Date.now()));
    return ok;
  }, []);

  const unlockWithPin = useCallback(
    async (pin: string) => {
      const ok = await verifyPin(pin);
      if (ok) dispatch({ type: "unlock" });
      return ok;
    },
    [verifyPin],
  );

  const changePin = useCallback(
    async (oldPin: string, newPin: string) => {
      if (!(await verifyPin(oldPin))) return false;
      await SecureStore.setItemAsync(PIN_KEY, newPin, DEVICE_ONLY);
      return true;
    },
    [verifyPin],
  );

  const value = useMemo<AppLockContextValue>(
    () => ({
      enabled: state.enabled,
      locked: state.locked,
      hasBiometrics,
      resumes: state.resumes,
      covered: shouldCover(state, hideInSwitcher),
      delayMs: state.delayMs,
      setDelayMs,
      hideInSwitcher,
      setHideInSwitcher,
      pinWaitMs: pinWaitLeft(limit, now),
      enable,
      disable,
      verifyPin,
      authenticateBiometrics,
      unlockWithBiometrics,
      unlockWithPin,
      changePin,
    }),
    [
      state,
      hasBiometrics,
      hideInSwitcher,
      limit,
      now,
      setDelayMs,
      setHideInSwitcher,
      enable,
      disable,
      verifyPin,
      authenticateBiometrics,
      unlockWithBiometrics,
      unlockWithPin,
      changePin,
    ],
  );

  return (
    <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>
  );
}

export function useAppLock(): AppLockContextValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error("useAppLock must be used within AppLockProvider");
  return ctx;
}
