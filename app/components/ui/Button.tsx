import {
  Pressable,
  type PressableProps,
  View,
  ActivityIndicator,
} from "react-native";
import { Text } from "./Text";
import { useThemeColor } from "@/app/contexts/ThemeContext";

export type ButtonVariant =
  | "default" // solid primary
  | "accent" // accent-brand outline (primary action in the web design)
  | "outline"
  | "ghost"
  | "destructive";

export type ButtonSize = "sm" | "default" | "lg" | "icon";

interface ButtonProps extends Omit<PressableProps, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  className?: string;
  textClassName?: string;
  children?: React.ReactNode;
  /** Leading icon element (already colored, or it inherits via color prop). */
  icon?: React.ReactNode;
}

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5",
  default: "h-10 px-3",
  lg: "h-12 px-4",
  icon: "h-10 w-10",
};

const VARIANT_CONTAINER: Record<ButtonVariant, string> = {
  default: "bg-primary border border-primary",
  accent: "bg-accent-brand/10 border border-accent-brand/40",
  outline: "bg-transparent border border-border",
  ghost: "bg-transparent border border-transparent",
  destructive: "bg-transparent border border-destructive/40",
};

const VARIANT_TEXT: Record<ButtonVariant, string> = {
  default: "text-primary-foreground",
  accent: "text-accent-brand",
  outline: "text-foreground",
  ghost: "text-foreground",
  destructive: "text-destructive",
};

export function Button({
  variant = "outline",
  size = "default",
  loading = false,
  disabled,
  className,
  textClassName,
  children,
  icon,
  ...props
}: ButtonProps) {
  const accent = useThemeColor()("accent-brand");
  const isDisabled = disabled || loading;

  return (
    <Pressable
      disabled={isDisabled}
      className={`flex-row items-center justify-center gap-1.5 ${SIZES[size]} ${VARIANT_CONTAINER[variant]} ${isDisabled ? "opacity-50" : "active:opacity-80"} ${className ?? ""}`}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "default" ? undefined : accent}
        />
      ) : (
        <>
          {icon ? <View className="shrink-0">{icon}</View> : null}
          {typeof children === "string" ? (
            <Text
              weight="medium"
              className={`text-xs ${VARIANT_TEXT[variant]} ${textClassName ?? ""}`}
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
