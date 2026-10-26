import { View } from "react-native";
import { Text } from "./Text";

/** The one section heading: small, muted and uppercase, like core's list headers. */
export function SectionLabel({
  children,
  hint,
  icon,
  className,
}: {
  children: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={`mb-1.5 px-1 ${className ?? ""}`}>
      <View className="flex-row items-center gap-1.5">
        {icon}
        <Text
          weight="medium"
          accessibilityRole="header"
          className="text-meta uppercase tracking-wider text-muted-foreground"
        >
          {children}
        </Text>
      </View>
      {hint ? (
        <Text className="mt-0.5 text-meta text-muted-foreground">{hint}</Text>
      ) : null}
    </View>
  );
}

/** A heading with its rows in a square bordered card under it. */
export function Section({
  title,
  hint,
  icon,
  children,
  bodyClassName = "px-3",
  className,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  /** Padding inside the card. Rows bring their own height, forms want more. */
  bodyClassName?: string;
  className?: string;
}) {
  return (
    <View className={className}>
      <SectionLabel hint={hint} icon={icon}>
        {title}
      </SectionLabel>
      <View className={`border border-border bg-card ${bodyClassName}`}>
        {children}
      </View>
    </View>
  );
}
