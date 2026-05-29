import { useEffect, useState } from "react";
import { View } from "react-native";
import { Lock, Fingerprint, Delete } from "lucide-react-native";
import { Pressable } from "react-native";
import { useAppLock } from "@/app/contexts/AppLockContext";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";

/**
 * Full-screen lock overlay shown when app lock is enabled and the app is
 * locked. Offers biometrics (if available) and a numeric PIN keypad.
 */
export function LockScreen() {
  const { hasBiometrics, unlockWithBiometrics, unlockWithPin } = useAppLock();
  const color = useThemeColor();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    // Offer biometrics immediately on appear.
    if (hasBiometrics) unlockWithBiometrics();
  }, [hasBiometrics, unlockWithBiometrics]);

  useEffect(() => {
    if (pin.length === 4) {
      unlockWithPin(pin).then((ok) => {
        if (!ok) {
          setError(true);
          setTimeout(() => {
            setPin("");
            setError(false);
          }, 600);
        }
      });
    }
  }, [pin, unlockWithPin]);

  const press = (d: string) => {
    if (pin.length < 4) setPin((p) => p + d);
  };

  return (
    <View className="absolute inset-0 bg-background items-center justify-center px-8 z-50">
      <View className="w-14 h-14 border border-accent-brand/40 bg-accent-brand/10 items-center justify-center mb-5">
        <Lock size={26} color={color("accent-brand")} />
      </View>
      <Text weight="bold" className="text-lg text-foreground">
        Termix Locked
      </Text>
      <Text className="text-xs text-muted-foreground mt-1 mb-6">
        Enter your PIN to continue
      </Text>

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
            onPress={() => hasBiometrics && unlockWithBiometrics()}
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
