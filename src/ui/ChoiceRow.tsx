import { useState } from "react";
import { Pressable } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { SettingRow } from "./SettingRow";
import { Sheet, SheetRow } from "./Sheet";
import { Text } from "./Text";
import { useThemeColor } from "@/contexts/ThemeContext";

/** A setting row that shows the current choice and opens a sheet to pick another. */
export function ChoiceRow<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
  last,
}: {
  label: string;
  description?: string;
  value: T;
  options: readonly { value: T; label: string; description?: string }[];
  onChange: (value: T) => void;
  last?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const color = useThemeColor();
  const current = options.find((o) => o.value === value);
  return (
    <>
      <SettingRow label={label} description={description} last={last}>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${current?.label ?? value}`}
          className="min-h-11 flex-row items-center gap-1"
        >
          <Text className="text-row text-muted-foreground" numberOfLines={1}>
            {current?.label ?? value}
          </Text>
          <ChevronRight size={14} color={color("muted-foreground")} />
        </Pressable>
      </SettingRow>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label} scroll>
        {options.map((o) => (
          <SheetRow
            key={o.value}
            label={o.label}
            description={o.description}
            selected={o.value === value}
            onPress={() => {
              setOpen(false);
              onChange(o.value);
            }}
          />
        ))}
      </Sheet>
    </>
  );
}
