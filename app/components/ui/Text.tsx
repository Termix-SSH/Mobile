import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import {
  MONO_FONT,
  MONO_FONT_BOLD,
  MONO_FONT_MEDIUM,
} from "@/app/constants/fonts";

export type TextWeight = "regular" | "medium" | "bold";

export interface ThemedTextProps extends RNTextProps {
  weight?: TextWeight;
  /** Tailwind classes (color, size, etc.). Defaults to foreground. */
  className?: string;
}

const FONT_BY_WEIGHT: Record<TextWeight, string> = {
  regular: MONO_FONT,
  medium: MONO_FONT_MEDIUM,
  bold: MONO_FONT_BOLD,
};

/**
 * App-wide text. Always monospace (JetBrains Mono), defaults to the theme
 * foreground color. Use `weight` for medium/bold since RN cannot synthesize
 * weights for custom fonts.
 */
export function Text({
  weight = "regular",
  className,
  style,
  ...props
}: ThemedTextProps) {
  return (
    <RNText
      className={`text-foreground ${className ?? ""}`}
      style={[{ fontFamily: FONT_BY_WEIGHT[weight] }, style]}
      {...props}
    />
  );
}
