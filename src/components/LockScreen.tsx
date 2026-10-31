import { useEffect, useRef, useState } from "react";
import { AppState, Keyboard, View, Pressable } from "react-native";
import { Lock, ChevronLeft } from "lucide-react-native";
import { useAppLock } from "@/contexts/AppLockContext";
import { PinPad, PIN_LENGTH, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";

interface LockScreenProps {
  title?: string;
  subtitle?: string;
  /**
   * Verify-mode overrides. When provided, the keypad calls these instead of the
   * context's unlock methods and does NOT change global lock state - used for
   * re-authentication (e.g. disabling app lock in Settings).
   */
  onVerifyPin?: (pin: string) => Promise<boolean>;
  onBiometric?: () => Promise<boolean>;
  /** Called after a successful PIN/biometric verification. */
  onSuccess?: () => void;
  /** When set, shows a Cancel affordance and makes the screen dismissible. */
  onCancel?: () => void;
}

/**
 * Full-screen 4-digit PIN gate. Used both as the app-lock overlay (default
 * mode) and as a re-auth screen in Settings (verify mode via props). The app
 * lock overlay asks for biometrics once per return to the app, after the
 * keyboard is gone. The OS device passcode is never offered as a fallback.
 */
export function LockScreen({
  title = "Termix Locked",
  subtitle = "Enter your PIN to continue",
  onVerifyPin,
  onBiometric,
  onSuccess,
  onCancel,
}: LockScreenProps = {}) {
  const {
    hasBiometrics,
    unlockWithBiometrics,
    unlockWithPin,
    resumes,
    pinWaitMs,
  } = useAppLock();
  const color = useThemeColor();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const verifyPin = onVerifyPin ?? unlockWithPin;
  const biometric = onBiometric ?? unlockWithBiometrics;

  // The keyboard must never sit over the pad, and the prompt waits for it.
  const overlay = !onVerifyPin && !onBiometric;
  const prompting = useRef(false);
  useEffect(() => {
    if (!overlay) return;
    Keyboard.dismiss();
    setPin("");
    if (!hasBiometrics) return;
    const t = setTimeout(async () => {
      if (prompting.current || AppState.currentState !== "active") return;
      prompting.current = true;
      try {
        await unlockWithBiometrics();
      } finally {
        prompting.current = false;
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay, resumes, hasBiometrics]);

  useEffect(() => {
    if (pin.length !== PIN_LENGTH) return;
    verifyPin(pin).then((ok) => {
      if (ok) {
        onSuccess?.();
      } else {
        setError(true);
        setTimeout(() => {
          setPin("");
          setError(false);
        }, 600);
      }
    });
  }, [pin, verifyPin, onSuccess]);

  const waiting = pinWaitMs > 0;

  const handleBiometric = async () => {
    if (!hasBiometrics) return;
    const ok = await biometric();
    if (ok) onSuccess?.();
  };

  return (
    <View
      className="absolute inset-0 z-50 items-center justify-center bg-background px-8"
      accessibilityViewIsModal
    >
      {onCancel ? (
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          className="absolute left-5 top-14 flex-row items-center"
          hitSlop={12}
        >
          <ChevronLeft size={20} color={color("muted-foreground")} />
          <Text className="text-sm text-muted-foreground">Cancel</Text>
        </Pressable>
      ) : null}

      <View className="mb-5 h-14 w-14 items-center justify-center border border-accent-brand/40 bg-accent-brand/10">
        <Lock size={26} color={color("accent-brand")} />
      </View>
      <Text
        weight="bold"
        accessibilityRole="header"
        className="text-lg text-foreground"
      >
        {title}
      </Text>
      <Text
        className="mb-6 mt-1 text-xs text-muted-foreground"
        accessibilityLiveRegion="polite"
      >
        {waiting
          ? `Too many tries. Wait ${Math.ceil(pinWaitMs / 1000)} seconds`
          : subtitle}
      </Text>

      <PinPad
        value={pin}
        onChange={setPin}
        error={error}
        disabled={waiting}
        onBiometric={hasBiometrics ? handleBiometric : undefined}
      />
    </View>
  );
}
