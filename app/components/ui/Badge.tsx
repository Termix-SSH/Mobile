import { View } from "react-native";
import { Text } from "./Text";

export type BadgeVariant = "accent" | "muted" | "destructive" | "success";

const VARIANTS: Record<BadgeVariant, { box: string; text: string }> = {
  accent: {
    box: "bg-accent-brand/10 border-accent-brand/40",
    text: "text-accent-brand",
  },
  muted: { box: "bg-muted border-border", text: "text-muted-foreground" },
  destructive: {
    box: "bg-destructive/10 border-destructive/40",
    text: "text-destructive",
  },
  success: { box: "bg-chart-3/15 border-chart-3/40", text: "text-chart-3" },
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
      <Text
        weight="medium"
        className={`text-[9px] uppercase tracking-wider ${v.text}`}
      >
        {children}
      </Text>
    </View>
  );
}
