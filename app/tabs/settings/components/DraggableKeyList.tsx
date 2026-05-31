import React from "react";
import { View, Pressable } from "react-native";
import { KeyConfig } from "@/types/keyboard";
import { GripVertical, X } from "lucide-react-native";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";

interface RenderKeyItemProps {
  item: KeyConfig;
  onRemove: () => void;
  drag: () => void;
  isActive: boolean;
}

export function renderKeyItem({
  item,
  onRemove,
  drag,
  isActive,
}: RenderKeyItemProps) {
  return (
    <KeyItem item={item} onRemove={onRemove} drag={drag} isActive={isActive} />
  );
}

function KeyItem({ item, onRemove, drag, isActive }: RenderKeyItemProps) {
  const color = useThemeColor();

  return (
    <View className="mb-1.5 flex-row items-center border border-border bg-card">
      <Pressable
        onLongPress={drag}
        delayLongPress={200}
        disabled={isActive}
        className="h-10 w-10 shrink-0 items-center justify-center"
      >
        <GripVertical size={16} color={color("muted-foreground")} />
      </Pressable>

      <View className="min-w-0 flex-1 py-2 pr-2">
        <View className="flex-row items-center gap-2">
          <View className="shrink-0 border border-border bg-muted px-2 py-1">
            <Text weight="medium" className="text-xs text-foreground">
              {item.label}
            </Text>
          </View>
          <Text className="text-[10px] text-muted-foreground">
            {item.category}
          </Text>
        </View>
        {item.description ? (
          <Text
            className="mt-0.5 text-[10px] text-muted-foreground"
            numberOfLines={1}
          >
            {item.description}
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={onRemove}
        hitSlop={8}
        className="mr-1 h-8 w-8 shrink-0 items-center justify-center border border-destructive/40 active:opacity-70"
      >
        <X size={13} color={color("destructive")} />
      </Pressable>
    </View>
  );
}
