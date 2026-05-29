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
  return <KeyItem item={item} onRemove={onRemove} drag={drag} isActive={isActive} />;
}

function KeyItem({ item, onRemove, drag, isActive }: RenderKeyItemProps) {
  const color = useThemeColor();

  return (
    <View className="flex-row items-center bg-card border border-border mb-1.5">
      <Pressable
        onLongPress={drag}
        delayLongPress={200}
        disabled={isActive}
        className="w-10 h-10 items-center justify-center shrink-0"
      >
        <GripVertical size={16} color={color("muted-foreground")} />
      </Pressable>

      <View className="flex-1 min-w-0 py-2 pr-2">
        <View className="flex-row items-center gap-2">
          <View className="bg-muted border border-border px-2 py-1 shrink-0">
            <Text weight="medium" className="text-xs text-foreground">
              {item.label}
            </Text>
          </View>
          <Text className="text-[10px] text-muted-foreground">{item.category}</Text>
        </View>
        {item.description ? (
          <Text
            className="text-[10px] text-muted-foreground mt-0.5"
            numberOfLines={1}
          >
            {item.description}
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={onRemove}
        hitSlop={8}
        className="w-8 h-8 items-center justify-center shrink-0 mr-1 border border-destructive/40 active:opacity-70"
      >
        <X size={13} color={color("destructive")} />
      </Pressable>
    </View>
  );
}
