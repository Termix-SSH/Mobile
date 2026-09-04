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

  // Padding sits on the container so leading/trailing icons are inset from the
  // border like the text is. Multiline grows with content, so it can't use a
  // fixed height.
  const layout = multiline
    ? "flex-row items-start gap-2 px-2.5 py-2"
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
        className={`${multiline ? "min-h-6" : "h-full"} flex-1 text-sm text-foreground ${className ?? ""}`}
        style={[
          { fontFamily: MONO_FONT, paddingVertical: 0, paddingHorizontal: 0 },
          multiline ? { textAlignVertical: "top" } : null,
          style,
        ]}
        {...props}
      />
      {trailing ? <View className="shrink-0">{trailing}</View> : null}
    </View>
  );
});
