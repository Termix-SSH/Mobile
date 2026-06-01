import { useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { Text } from "./Text";
import { useThemeColor } from "@/app/contexts/ThemeContext";

/**
 * AccordionSection — bordered card with a header that expands/collapses,
 * matching the web user-profile accordion (uppercase header + chevron).
 */
export function AccordionSection({
  label,
  icon,
  defaultOpen = false,
  open: controlledOpen,
  onToggle,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const muted = useThemeColor()("muted-foreground");

  return (
    <View className="overflow-hidden border border-border bg-card">
      <Pressable
        onPress={() => {
          if (isControlled) onToggle?.();
          else setInternalOpen((o) => !o);
        }}
        className="flex-row items-center gap-2 px-3 py-3 active:bg-muted/40"
      >
        {icon ? <View className="shrink-0">{icon}</View> : null}
        <Text
          weight="bold"
          className="flex-1 text-[11px] uppercase tracking-[2px] text-foreground"
        >
          {label}
        </Text>
        <View
          style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
          className="shrink-0"
        >
          <ChevronDown size={14} color={muted} />
        </View>
      </Pressable>
      {open ? (
        <View className="border-t border-border px-3 pb-3">{children}</View>
      ) : null}
    </View>
  );
}
