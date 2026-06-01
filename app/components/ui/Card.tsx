import { View, type ViewProps } from "react-native";
import { Text } from "./Text";

export function Card({
  className,
  ...props
}: ViewProps & { className?: string }) {
  return (
    <View
      className={`border border-border bg-card ${className ?? ""}`}
      {...props}
    />
  );
}

/** Small uppercase tracking-widest muted label — the web design's section/field label. */
export function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Text
      weight="bold"
      className={`text-[10px] uppercase tracking-[2px] text-muted-foreground ${className ?? ""}`}
    >
      {children}
    </Text>
  );
}
