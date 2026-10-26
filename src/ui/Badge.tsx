import { View } from "react-native";
import { Text } from "./Text";

export type BadgeVariant =
  "accent" | "muted" | "destructive" | "success" | "warning";

const VARIANTS: Record<BadgeVariant, { box: string; text: string }> = {
  accent: {
    box: "bg-accent-brand/10 border-accent-brand/40",
    text: "text-accent-text",
  },
  muted: { box: "bg-muted border-border", text: "text-muted-foreground" },
  destructive: {
    box: "bg-destructive/10 border-destructive/40",
    text: "text-destructive-text",
  },
  success: {
    box: "bg-green-500/10 border-green-500/40",
    text: "text-green-500",
  },
  warning: {
    box: "bg-warning/10 border-warning/40",
    text: "text-warning-text",
  },
};

export function Badge({
  children,
  variant = "muted",
  className,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  const v = VARIANTS[variant];
  return (
    <View
      className={`self-start border px-1.5 py-0.5 ${v.box} ${className ?? ""}`}
    >
      <Text weight="medium" className={`text-2xs ${v.text}`}>
        {children}
      </Text>
    </View>
  );
}
