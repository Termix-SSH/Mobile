import { Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { Check } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useReduceMotion } from "./motion";

/** Square toggle like core's switch: accent track when on, muted when off. */
export function FakeSwitch({
  checked,
  onChange,
  disabled,
  accessibilityLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const still = useReduceMotion();
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: withTiming(checked ? 16 : 0, {
          duration: still ? 0 : 110,
        }),
      },
    ],
  }));

  return (
    <Pressable
      disabled={disabled}
      onPress={() => onChange(!checked)}
      hitSlop={12}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled: !!disabled }}
      className={`h-5 w-9 justify-center border-2 ${checked ? "border-accent-brand bg-accent-brand" : "border-border bg-muted"} ${disabled ? "opacity-50" : ""}`}
    >
      <Animated.View style={thumbStyle} className="h-3 w-3 bg-background" />
    </Pressable>
  );
}

export function Checkbox({
  checked,
  onChange,
  disabled,
  accessibilityLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const color = useThemeColor();
  return (
    <Pressable
      disabled={disabled}
      onPress={() => onChange(!checked)}
      hitSlop={14}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled: !!disabled }}
      className={`h-4 w-4 items-center justify-center border ${checked ? "border-accent-brand bg-accent-brand" : "border-input bg-transparent"} ${disabled ? "opacity-50" : ""}`}
    >
      {checked ? (
        <Check size={12} strokeWidth={3} color={color("background")} />
      ) : null}
    </Pressable>
  );
}
