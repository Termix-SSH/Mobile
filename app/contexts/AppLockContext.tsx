import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

/**
 * App Lock — optional biometric / PIN gate when the app is opened or returns
 * from background. Addresses Support issues #496 / #338 (account security on
 * mobile). The PIN is stored in the OS secure store; the enabled flag in
 * AsyncStorage.
 */

const ENABLED_KEY = "appLockEnabled";
const PIN_KEY = "appLockPin"; // SecureStore
const LOCK_DELAY_MS = 15_000; // re-lock if backgrounded longer than this

interface AppLockContextValue {
  enabled: boolean;
  locked: boolean;
  hasBiometrics: boolean;
  /** Enable app lock with a numeric PIN (biometrics used when available). */
  enable: (pin: string) => Promise<void>;
  /**
   * Tear down app lock. Performs no verification — callers MUST authenticate
   * the user (via `verifyPin` / `authenticateBiometrics`) first.
   */
  disable: () => Promise<void>;
  /** Compare a PIN against the stored one. Does NOT change lock state. */
  verifyPin: (pin: string) => Promise<boolean>;
  /**
   * Prompt for biometrics (no device-passcode fallback). Does NOT change lock
   * state — used for re-authentication in Settings.
   */
  authenticateBiometrics: () => Promise<boolean>;
  /** Attempt unlock via biometrics; unlocks on success. Returns success. */
  unlockWithBiometrics: () => Promise<boolean>;
  /** Attempt unlock via PIN; unlocks on success. Returns success. */
  unlockWithPin: (pin: string) => Promise<boolean>;
}

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    (async () => {
      const [isEnabled, hw, enrolled] = await Promise.all([
        AsyncStorage.getItem(ENABLED_KEY),
        LocalAuthentication.hasHardwareAsync().catch(() => false),
        LocalAuthentication.isEnrolledAsync().catch(() => false),
      ]);
      const on = isEnabled === "true";
      setEnabled(on);
      // Only treat biometrics as available when the device has a sensor AND a
      // biometric is actually enrolled — otherwise the fingerprint button would
      // appear but do nothing.
      setHasBiometrics(!!hw && !!enrolled);
      if (on) setLocked(true); // lock on cold start
    })();
  }, []);

  // Re-lock when returning from background after the delay.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      const prev = appState.current;
      appState.current = next;
      if (!enabled) return;
      if (next.match(/inactive|background/)) {
        backgroundedAt.current = Date.now();
      } else if (prev.match(/inactive|background/) && next === "active") {
        const elapsed = Date.now() - (backgroundedAt.current ?? 0);
        if (elapsed >= LOCK_DELAY_MS) setLocked(true);
      }
    });
    return () => sub.remove();
  }, [enabled]);

  const enable = useCallback(async (pin: string) => {
    await SecureStore.setItemAsync(PIN_KEY, pin);
    await AsyncStorage.setItem(ENABLED_KEY, "true");
    setEnabled(true);
    setLocked(false);
  }, []);

  const disable = useCallback(async () => {
    await SecureStore.deleteItemAsync(PIN_KEY).catch(() => {});
    await AsyncStorage.setItem(ENABLED_KEY, "false");
    setEnabled(false);
    setLocked(false);
  }, []);

  // Prompt biometrics without changing lock state. Device-passcode fallback is
  // disabled so iOS never shows the phone passcode prompt — the in-app PIN is
  // the only fallback.
  const authenticateBiometrics = useCallback(async () => {
    try {
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) return false;
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Termix",
        disableDeviceFallback: true,
        cancelLabel: "Use PIN",
      });
      return res.success;
    } catch {
      return false;
    }
  }, []);

  const unlockWithBiometrics = useCallback(async () => {
    const ok = await authenticateBiometrics();
    if (ok) setLocked(false);
    return ok;
  }, [authenticateBiometrics]);

  const verifyPin = useCallback(async (pin: string) => {
    const stored = await SecureStore.getItemAsync(PIN_KEY).catch(() => null);
    return !!stored && stored === pin;
  }, []);

  const unlockWithPin = useCallback(
    async (pin: string) => {
      const ok = await verifyPin(pin);
      if (ok) setLocked(false);
      return ok;
    },
    [verifyPin],
  );

  return (
    <AppLockContext.Provider
      value={{
        enabled,
        locked,
        hasBiometrics,
        enable,
        disable,
        verifyPin,
        authenticateBiometrics,
        unlockWithBiometrics,
        unlockWithPin,
      }}
    >
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock(): AppLockContextValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error("useAppLock must be used within AppLockProvider");
  return ctx;
}
