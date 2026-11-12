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
import {
  dropDeviceKey,
  getPlainDbKey,
  isDeviceKeySealed,
  removePlainDeviceKey,
  restorePlainDeviceKey,
  setDeviceKeyState,
  unlockedDeviceKey,
} from "@/core/db/keys";
import { keyVault } from "@/core/lock/vault-store";
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
 * from background. While it is on, this device's database key is sealed by
 * the PIN and by a biometric Keychain/Keystore item (core/lock/key-vault), so
 * unlocking is what gives the app its data. The flags are in AsyncStorage;
 * the when-to-lock rules live in `core/lock/machine`.
 */

export const APP_LOCK_ENABLED_KEY = "appLockEnabled";
export const APP_LOCK_DELAY_KEY = "appLockDelayMs";
export const APP_LOCK_HIDE_KEY = "appLockHideInSwitcher";
const ENABLED_KEY = APP_LOCK_ENABLED_KEY;
// Builds before the key vault kept the PIN itself here. Moved on the first
// PIN unlock, then removed.
const LEGACY_PIN_KEY = "appLockPin";
const UNLOCK_PROMPT = "Unlock Termix";

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
      const [sealed, isEnabled, delay, hide, hw, enrolled] = await Promise.all([
        // Fails closed: a store that can't be read counts as sealed.
        keyVault.active().catch(() => true),
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
      setDeviceKeyState(sealed, null);
      if (sealed) setLimit(await keyVault.loadFails());
      // A sealed key means locked, whatever the flag says.
      dispatch({ type: "start", enabled: sealed || isEnabled === "true" });
      setReady(true);
    })();
  }, []);

  // Local data keys are only read while the app is unlocked.
  useEffect(() => {
    if (!ready) return;
    if (state.locked) {
      localStores.lock();
      dropDeviceKey();
    } else localStores.unlock();
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

  const hasBiometricsRef = useRef(hasBiometrics);
  useEffect(() => {
    hasBiometricsRef.current = hasBiometrics;
  }, [hasBiometrics]);
  // Set when the biometric copy did not open (cancelled, or the enrolled
  // biometrics changed), so the next PIN unlock seals it again.
  const bioNeedsSeal = useRef(false);

  const enable = useCallback(async (pin: string) => {
    // Seal the key the device data opens with, check it opens again, and
    // only then drop the plain copy.
    const key = unlockedDeviceKey() ?? (await getPlainDbKey("local"));
    await keyVault.seal(pin, key, hasBiometricsRef.current);
    setDeviceKeyState(true, key);
    await removePlainDeviceKey();
    await SecureStore.deleteItemAsync(LEGACY_PIN_KEY, DEVICE_ONLY).catch(
      () => {},
    );
    await AsyncStorage.setItem(ENABLED_KEY, "true");
    setLimit(NO_PIN_LIMIT);
    dispatch({ type: "enable" });
  }, []);

  const disable = useCallback(async () => {
    if (isDeviceKeySealed()) {
      const key = unlockedDeviceKey();
      // Only reachable unlocked; without the key the data would be lost.
      if (!key) throw new Error("Unlock Termix first.");
      await restorePlainDeviceKey(key);
      await keyVault.clear();
      setDeviceKeyState(false, null);
    }
    await SecureStore.deleteItemAsync(LEGACY_PIN_KEY, DEVICE_ONLY).catch(
      () => {},
    );
    await AsyncStorage.setItem(ENABLED_KEY, "false");
    setLimit(NO_PIN_LIMIT);
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
    if (isDeviceKeySealed()) {
      // The system prompt opens the Keychain/Keystore item itself.
      dispatch({ type: "bioStart" });
      try {
        const key = await keyVault.openBiometric(UNLOCK_PROMPT);
        setDeviceKeyState(true, key);
        dispatch({ type: "unlock" });
        return true;
      } catch {
        // Cancelled, or the enrolled biometrics changed: the PIN still works.
        bioNeedsSeal.current = true;
        return false;
      } finally {
        dispatch({ type: "bioEnd" });
      }
    }
    const ok = await authenticateBiometrics();
    if (ok) dispatch({ type: "unlock" });
    return ok;
  }, [authenticateBiometrics]);

  const limitRef = useRef(limit);
  limitRef.current = limit;

  const recordTry = useCallback(async (ok: boolean) => {
    const next = ok ? NO_PIN_LIMIT : pinFailed(limitRef.current, Date.now());
    limitRef.current = next;
    setLimit(next);
    if (isDeviceKeySealed()) await keyVault.saveFails(next).catch(() => {});
  }, []);

  /** The device key for this PIN ("" before the vault), or null when wrong. */
  const openWithPin = useCallback(
    async (pin: string): Promise<string | null> => {
      if (pinWaitLeft(limitRef.current, Date.now()) > 0) return null;
      if (isDeviceKeySealed()) {
        try {
          const key = await keyVault.openPin(pin);
          await recordTry(true);
          return key;
        } catch {
          await recordTry(false);
          return null;
        }
      }
      const stored = await SecureStore.getItemAsync(
        LEGACY_PIN_KEY,
        DEVICE_ONLY,
      ).catch(() => null);
      const ok = !!stored && stored === pin;
      await recordTry(ok);
      return ok ? "" : null;
    },
    [recordTry],
  );

  const verifyPin = useCallback(
    async (pin: string) => (await openWithPin(pin)) !== null,
    [openWithPin],
  );

  const unlockWithPin = useCallback(
    async (pin: string) => {
      const opened = await openWithPin(pin);
      if (opened === null) return false;
      if (isDeviceKeySealed()) {
        setDeviceKeyState(true, opened);
        if (bioNeedsSeal.current && hasBiometricsRef.current) {
          bioNeedsSeal.current = false;
          void keyVault.sealBiometric(opened);
        }
      } else {
        // First unlock after the update: seal the key and drop the old PIN.
        const key = await getPlainDbKey("local");
        await keyVault.seal(pin, key, hasBiometricsRef.current);
        setDeviceKeyState(true, key);
        await removePlainDeviceKey();
        await SecureStore.deleteItemAsync(LEGACY_PIN_KEY, DEVICE_ONLY).catch(
          () => {},
        );
      }
      dispatch({ type: "unlock" });
      return true;
    },
    [openWithPin],
  );

  const changePin = useCallback(
    async (oldPin: string, newPin: string) => {
      const opened = await openWithPin(oldPin);
      if (opened === null) return false;
      if (isDeviceKeySealed()) {
        await keyVault.changePin(opened, newPin);
      } else {
        await SecureStore.setItemAsync(LEGACY_PIN_KEY, newPin, DEVICE_ONLY);
      }
      return true;
    },
    [openWithPin],
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
