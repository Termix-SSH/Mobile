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
  { className, leading, trailing, containerClassName, style, ...props },
  ref,
) {
  const placeholderColor = useThemeColor()("muted-foreground", 0.7);

  return (
    <View
      className={`flex-row items-center gap-2 h-10 px-2.5 bg-card border border-input ${containerClassName ?? ""}`}
    >
      {leading ? <View className="shrink-0">{leading}</View> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={placeholderColor}
        className={`flex-1 text-sm text-foreground ${className ?? ""}`}
        style={[{ fontFamily: MONO_FONT, paddingVertical: 0 }, style]}
        {...props}
      />
      {trailing ? <View className="shrink-0">{trailing}</View> : null}
    </View>
  );
});
