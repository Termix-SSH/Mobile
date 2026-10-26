import { Pressable, View } from "react-native";
import { Delete, Fingerprint } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { Text } from "./Text";

export const PIN_LENGTH = 4;

/**
 * Dots and a number pad. It has no text input, so the system keyboard never
 * opens over it. The caller owns the value.
 */
export function PinPad({
  value,
  onChange,
  error,
  disabled,
  onBiometric,
  length = PIN_LENGTH,
}: {
  value: string;
  onChange: (next: string) => void;
  error?: boolean;
  disabled?: boolean;
  /** Shows a fingerprint key when set. */
  onBiometric?: () => void;
  length?: number;
}) {
  const color = useThemeColor();
  const press = (d: string) => {
    if (!disabled && value.length < length) onChange(value + d);
  };
  return (
    <View className="items-center">
      <View className="mb-8 flex-row gap-3">
        {Array.from({ length }, (_, i) => (
          <View
            key={i}
            className={`h-3.5 w-3.5 rounded-full border ${
              error
                ? "border-destructive bg-destructive"
                : i < value.length
                  ? "border-accent-brand bg-accent-brand"
                  : "border-border"
            }`}
          />
        ))}
      </View>
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
            onPress={onBiometric}
            disabled={!onBiometric}
            accessibilityRole="button"
            accessibilityLabel="Use biometrics"
            accessibilityElementsHidden={!onBiometric}
            importantForAccessibility={
              onBiometric ? "auto" : "no-hide-descendants"
            }
            className="h-16 w-16 items-center justify-center"
          >
            {onBiometric ? (
              <Fingerprint size={24} color={color("muted-foreground")} />
            ) : null}
          </Pressable>
          <Key label="0" onPress={() => press("0")} />
          <Pressable
            onPress={() => onChange(value.slice(0, -1))}
            accessibilityRole="button"
            accessibilityLabel="Delete"
            className="h-16 w-16 items-center justify-center border border-border active:bg-muted/40"
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
      accessibilityRole="keyboardkey"
      accessibilityLabel={label}
      className="h-16 w-16 items-center justify-center border border-border bg-card active:bg-muted/40"
    >
      <Text weight="medium" className="text-xl text-foreground">
        {label}
      </Text>
    </Pressable>
  );
}
