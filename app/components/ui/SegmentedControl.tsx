import { Pressable, View } from "react-native";
import { Text } from "./Text";

/**
 * SegmentedControl — a row of equal-width options where the selected one is
 * highlighted with the accent (matches the web font-size / theme pickers).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <View className={`flex-row gap-1 ${className ?? ""}`}>
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            className={`flex-1 items-center border py-2 ${active ? "border-accent-brand/40 bg-accent-brand/10" : "border-border active:bg-muted/40"}`}
          >
            <Text
              weight="bold"
              className={`text-[10px] uppercase tracking-wider ${active ? "text-accent-brand" : "text-muted-foreground"}`}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
