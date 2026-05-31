import { Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

/**
 * FakeSwitch — pill toggle matching the web design (bg-accent-brand when on,
 * bg-muted when off). One of the few intentionally rounded elements.
 */
export function FakeSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: withTiming(checked ? 16 : 2, { duration: 150 }) },
    ],
  }));

  return (
    <Pressable
      disabled={disabled}
      onPress={() => onChange(!checked)}
      hitSlop={8}
      className={`h-5 w-9 justify-center rounded-full ${checked ? "bg-accent-brand" : "bg-muted"} ${disabled ? "opacity-50" : ""}`}
    >
      <Animated.View
        style={thumbStyle}
        className="h-4 w-4 rounded-full bg-white"
      />
    </Pressable>
  );
}

/** Square checkbox with 4px rounding (matches web). */
export function Checkbox({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => onChange(!checked)}
      hitSlop={8}
      className={`h-4 w-4 items-center justify-center rounded-check border ${checked ? "border-accent-brand bg-accent-brand" : "border-input bg-transparent"} ${disabled ? "opacity-50" : ""}`}
    >
      {checked ? <View className="h-2 w-2 rounded-check bg-white" /> : null}
    </Pressable>
  );
}
