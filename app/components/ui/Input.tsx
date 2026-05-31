import { forwardRef } from "react";
import { TextInput, type TextInputProps, View } from "react-native";
import { MONO_FONT } from "@/app/constants/fonts";
import { useThemeColor } from "@/app/contexts/ThemeContext";

interface InputProps extends TextInputProps {
  className?: string;
  /** Optional leading element (e.g. a search icon). */
  leading?: React.ReactNode;
  /** Optional trailing element (e.g. a clear button). */
  trailing?: React.ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    className,
    leading,
    trailing,
    containerClassName,
    style,
    multiline,
    ...props
  },
  ref,
) {
  const placeholderColor = useThemeColor()("muted-foreground", 0.7);

  // Multiline grows with content, so the container can't be a fixed-height
  // centered row — it must allow height and top-align its children. Single-line
  // keeps the original fixed 40px row.
  const layout = multiline
    ? "flex-row items-start gap-2 min-h-10 py-2 px-2.5"
    : "flex-row items-center gap-2 h-10 px-2.5";

  return (
    <View
      className={`${layout} border border-input bg-card ${containerClassName ?? ""}`}
    >
      {leading ? <View className="shrink-0">{leading}</View> : null}
      <TextInput
        ref={ref}
        multiline={multiline}
        placeholderTextColor={placeholderColor}
        className={`flex-1 text-sm text-foreground ${className ?? ""}`}
        style={[
          { fontFamily: MONO_FONT, paddingVertical: 0 },
          multiline ? { textAlignVertical: "top" } : null,
          style,
        ]}
        {...props}
      />
      {trailing ? <View className="shrink-0">{trailing}</View> : null}
    </View>
  );
});
