import {
  Pressable,
  type PressableProps,
  View,
  ActivityIndicator,
} from "react-native";
import { Text } from "./Text";
import { useThemeColor } from "@/contexts/ThemeContext";
import { HEIGHTS, hitSlopFor } from "@/constants/tokens";

// Same variants as core's button. "muted" is core's prompt button, used for
// Cancel and other quiet actions.
export type ButtonVariant =
  | "default"
  | "outline"
  | "secondary"
  | "muted"
  | "ghost"
  | "destructive"
  | "link";

export type ButtonSize = "xs" | "sm" | "default" | "lg" | "icon";

interface BaseButtonProps extends Omit<PressableProps, "children"> {
  variant?: ButtonVariant;
  loading?: boolean;
  className?: string;
  textClassName?: string;
  children?: React.ReactNode;
  icon?: React.ReactNode;
}

// An icon button has no text, so a screen reader needs its label.
type ButtonProps = BaseButtonProps &
  (
    | { size: "icon"; accessibilityLabel: string }
    | { size?: Exclude<ButtonSize, "icon"> }
  );

// A minimum height, so large system text grows the button instead of clipping.
const SIZES: Record<ButtonSize, { box: string; height: number }> = {
  xs: { box: "min-h-7 px-2", height: HEIGHTS.controlXs },
  sm: { box: "min-h-8 px-2.5", height: HEIGHTS.controlSm },
  default: { box: "min-h-9 px-3", height: HEIGHTS.control },
  lg: { box: "min-h-11 px-4", height: HEIGHTS.controlLg },
  icon: { box: "h-9 w-9", height: HEIGHTS.control },
};

export const BUTTON_CONTAINER: Record<ButtonVariant, string> = {
  default: "border border-accent-brand/40 bg-accent-brand/15",
  outline: "border border-accent-brand/40 bg-transparent",
  secondary: "border border-accent-brand/20 bg-accent-brand/10",
  muted: "border border-border bg-transparent",
  ghost: "border border-transparent bg-transparent",
  destructive: "border border-destructive/40 bg-destructive/15",
  link: "border border-transparent bg-transparent",
};

export const BUTTON_PRESSED: Record<ButtonVariant, string> = {
  default: "hover:bg-accent-brand/20 active:bg-accent-brand/25",
  outline: "hover:bg-accent-brand/5 active:bg-accent-brand/10",
  secondary: "hover:bg-accent-brand/15 active:bg-accent-brand/20",
  muted: "hover:bg-muted/60 active:bg-muted",
  ghost: "hover:bg-muted/60 active:bg-muted",
  destructive: "hover:bg-destructive/20 active:bg-destructive/25",
  link: "hover:opacity-80 active:opacity-70",
};

export const BUTTON_TEXT: Record<ButtonVariant, string> = {
  default: "text-accent-text",
  outline: "text-accent-text",
  secondary: "text-accent-text",
  muted: "text-muted-foreground",
  ghost: "text-foreground",
  destructive: "text-destructive-text",
  link: "text-accent-text underline",
};

const SPINNER_TOKEN: Record<ButtonVariant, string> = {
  default: "accent-brand",
  outline: "accent-brand",
  secondary: "accent-brand",
  muted: "muted-foreground",
  ghost: "foreground",
  destructive: "destructive",
  link: "accent-brand",
};

export function Button({
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  className,
  textClassName,
  children,
  icon,
  hitSlop,
  ...props
}: ButtonProps) {
  const color = useThemeColor();
  const isDisabled = disabled || loading;
  const { box, height } = SIZES[size];

  return (
    <Pressable
      disabled={isDisabled}
      hitSlop={hitSlop ?? hitSlopFor(height)}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      className={`flex-row items-center justify-center gap-1.5 ${box} ${BUTTON_CONTAINER[variant]} ${isDisabled ? "opacity-50" : BUTTON_PRESSED[variant]} ${className ?? ""}`}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color(SPINNER_TOKEN[variant])} />
      ) : (
        <>
          {icon ? <View className="shrink-0">{icon}</View> : null}
          {typeof children === "string" ? (
            <Text
              weight="medium"
              className={`text-xs ${BUTTON_TEXT[variant]} ${textClassName ?? ""}`}
            >
              {children}
            </Text>
          ) : (
            children
          )}
        </>
      )}
    </Pressable>
  );
}
