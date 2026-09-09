import { forwardRef } from "react";
import { Platform, TextInput, type TextInputProps, View } from "react-native";
import { MONO_FONT } from "@/app/constants/fonts";
import { useThemeColor } from "@/app/contexts/ThemeContext";

export type InputSize = "sm" | "default";

interface InputProps extends TextInputProps {
  className?: string;
  /** Optional leading element (e.g. a search icon). */
  leading?: React.ReactNode;
  /** Optional trailing element (e.g. a clear button). */
  trailing?: React.ReactNode;
  containerClassName?: string;
  size?: InputSize;
}

// Android adds font ascent/descent padding inside text inputs, which pushes the
// text off centre. Turning it off and pinning a line height keeps the text on
// the vertical centre of the box on both platforms.
const BASE_TEXT_STYLE = {
  fontFamily: MONO_FONT,
  paddingTop: 0,
  paddingBottom: 0,
  paddingLeft: 0,
  paddingRight: 0,
  ...Platform.select({ android: { includeFontPadding: false } }),
} as const;

const SIZES: Record<InputSize, { box: string; fontSize: number; line: number }> =
  {
    sm: { box: "h-8", fontSize: 12, line: 16 },
    default: { box: "h-10", fontSize: 14, line: 18 },
  };

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    className,
    leading,
    trailing,
    containerClassName,
    style,
    multiline,
    size = "default",
    ...props
  },
  ref,
) {
  const placeholderColor = useThemeColor()("muted-foreground", 0.7);
  const { box, fontSize, line } = SIZES[size];

  // Padding sits on the container so leading/trailing icons are inset from the
  // border like the text is. Multiline grows with content, so it can't use a
  // fixed height.
  const layout = multiline
    ? "flex-row items-start gap-2 px-2.5 py-2"
    : `flex-row items-center gap-2 px-2.5 ${box}`;

  return (
    <View
      className={`${layout} border border-input bg-card ${containerClassName ?? ""}`}
    >
      {leading ? <View className="shrink-0">{leading}</View> : null}
      <TextInput
        ref={ref}
        multiline={multiline}
        placeholderTextColor={placeholderColor}
        className={`flex-1 text-foreground ${className ?? ""}`}
        style={[
          BASE_TEXT_STYLE,
          { fontSize, lineHeight: line },
          multiline
            ? { textAlignVertical: "top", minHeight: line + 6 }
            : { textAlignVertical: "center" },
          style,
        ]}
        {...props}
      />
      {trailing ? <View className="shrink-0">{trailing}</View> : null}
    </View>
  );
});
