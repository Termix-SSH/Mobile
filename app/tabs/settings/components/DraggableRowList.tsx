import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { KeyboardRow, KeyConfig } from "@/types/keyboard";
import { GripVertical, ChevronRight } from "lucide-react-native";
import { Text, FakeSwitch } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";

interface RenderRowItemProps {
  item: KeyboardRow;
  drag: () => void;
  isActive: boolean;
  onToggleVisibility: (rowId: string) => void;
  onRemoveKey: (rowId: string, keyId: string) => void;
  onReorderKeys: (rowId: string, keys: KeyConfig[]) => void;
  onAddKeyToRow?: (rowId: string) => void;
  expandedRowId: string | null;
  onToggleExpand: (rowId: string) => void;
}

export function renderRowItem(props: RenderRowItemProps) {
  return <RowItem {...props} />;
}

function RowItem({
  item,
  drag,
  isActive,
  onToggleVisibility,
  expandedRowId,
  onToggleExpand,
}: RenderRowItemProps) {
  const color = useThemeColor();
  const isExpanded = expandedRowId === item.id;

  return (
    <View
      className={`bg-card border border-border ${isExpanded ? "mb-0" : "mb-1.5"}`}
    >
      <View className="flex-row items-center">
        <Pressable
          onLongPress={drag}
          delayLongPress={200}
          disabled={isActive}
          className="w-10 h-10 items-center justify-center shrink-0"
        >
          <GripVertical size={16} color={color("muted-foreground")} />
        </Pressable>

        <Pressable
          onPress={() => onToggleExpand(item.id)}
          disabled={isActive}
          className="flex-1 flex-row items-center py-2.5 active:opacity-70"
        >
          <View className="flex-1 min-w-0">
            <Text weight="medium" className="text-sm text-foreground">
              {item.label}
            </Text>
            <Text className="text-[10px] text-muted-foreground mt-0.5">
              {item.keys.length} keys · {item.category}
            </Text>
          </View>
          <View
            style={{
              transform: [{ rotate: isExpanded ? "90deg" : "0deg" }],
            }}
            className="mx-2 shrink-0"
          >
            <ChevronRight size={14} color={color("muted-foreground")} />
          </View>
        </Pressable>

        <View className="shrink-0 mr-2">
          <FakeSwitch
            checked={item.visible}
            onChange={() => onToggleVisibility(item.id)}
          />
        </View>
      </View>
    </View>
  );
}

export function useRowExpansion() {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const toggleExpand = (rowId: string) => {
    setExpandedRowId(expandedRowId === rowId ? null : rowId);
  };

  return { expandedRowId, toggleExpand };
}
