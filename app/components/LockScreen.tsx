import { useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import { Lock, Fingerprint, Delete, ChevronLeft } from "lucide-react-native";
import { useAppLock } from "@/app/contexts/AppLockContext";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";

interface LockScreenProps {
  title?: string;
  subtitle?: string;
  /**
   * Verify-mode overrides. When provided, the keypad calls these instead of the
   * context's unlock methods and does NOT change global lock state — used for
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
 * mode) and as a re-auth screen in Settings (verify mode via props). Biometrics
 * are opt-in: the user taps the fingerprint button — they are never prompted
 * automatically, and the OS device passcode is never offered as a fallback.
 */
export function LockScreen({
  title = "Termix Locked",
  subtitle = "Enter your PIN to continue",
  onVerifyPin,
  onBiometric,
  onSuccess,
  onCancel,
}: LockScreenProps = {}) {
  const { hasBiometrics, unlockWithBiometrics, unlockWithPin } = useAppLock();
  const color = useThemeColor();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const verifyPin = onVerifyPin ?? unlockWithPin;
  const biometric = onBiometric ?? unlockWithBiometrics;

  useEffect(() => {
    if (pin.length !== 4) return;
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

  const press = (d: string) => {
    if (pin.length < 4) setPin((p) => p + d);
  };

  const handleBiometric = async () => {
    if (!hasBiometrics) return;
    const ok = await biometric();
    if (ok) onSuccess?.();
  };

  return (
    <View className="absolute inset-0 bg-background items-center justify-center px-8 z-50">
      {onCancel ? (
        <Pressable
          onPress={onCancel}
          className="absolute top-14 left-5 flex-row items-center"
          hitSlop={12}
        >
          <ChevronLeft size={20} color={color("muted-foreground")} />
          <Text className="text-sm text-muted-foreground">Cancel</Text>
        </Pressable>
      ) : null}

      <View className="w-14 h-14 border border-accent-brand/40 bg-accent-brand/10 items-center justify-center mb-5">
        <Lock size={26} color={color("accent-brand")} />
      </View>
      <Text weight="bold" className="text-lg text-foreground">
        {title}
      </Text>
      <Text className="text-xs text-muted-foreground mt-1 mb-6">{subtitle}</Text>

      {/* PIN dots */}
      <View className="flex-row gap-3 mb-8">
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            className={`w-3.5 h-3.5 rounded-full border ${
              error
                ? "border-destructive bg-destructive"
                : i < pin.length
                  ? "border-accent-brand bg-accent-brand"
                  : "border-border"
            }`}
          />
        ))}
      </View>

      {/* Keypad */}
      <View className="gap-3">
        {[
          ["1", "2", "3"],
          ["4", "5", "6"],
          ["7", "8", "9"],
        ].map((row, ri) => (
          <View key={ri} className="flex-row gap-3">
            {row.map((d) => (
              <Key key={d} label={d} onPress={() => press(d)} />
            ))}
          </View>
        ))}
        <View className="flex-row gap-3">
          <Pressable
            onPress={handleBiometric}
            className="w-16 h-16 items-center justify-center"
          >
            {hasBiometrics ? (
              <Fingerprint size={24} color={color("muted-foreground")} />
            ) : null}
          </Pressable>
          <Key label="0" onPress={() => press("0")} />
          <Pressable
            onPress={() => setPin((p) => p.slice(0, -1))}
            className="w-16 h-16 items-center justify-center border border-border active:bg-muted/40"
          >
            <Delete size={20} color={color("foreground")} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Key({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="w-16 h-16 items-center justify-center border border-border bg-card active:bg-muted/40"
    >
      <Text weight="medium" className="text-xl text-foreground">
        {label}
      </Text>
    </Pressable>
  );
}
