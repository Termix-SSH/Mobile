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
    transform: [{ translateX: withTiming(checked ? 16 : 2, { duration: 150 }) }],
  }));

  return (
    <Pressable
      disabled={disabled}
      onPress={() => onChange(!checked)}
      hitSlop={8}
      className={`w-9 h-5 rounded-full justify-center ${checked ? "bg-accent-brand" : "bg-muted"} ${disabled ? "opacity-50" : ""}`}
    >
      <Animated.View
        style={thumbStyle}
        className="w-4 h-4 rounded-full bg-white"
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
      className={`w-4 h-4 rounded-check border items-center justify-center ${checked ? "bg-accent-brand border-accent-brand" : "border-input bg-transparent"} ${disabled ? "opacity-50" : ""}`}
    >
      {checked ? <View className="w-2 h-2 bg-white rounded-check" /> : null}
    </Pressable>
  );
}
