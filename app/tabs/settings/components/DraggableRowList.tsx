import React, { useState } from "react";
import { View, Text, TouchableOpacity, Switch } from "react-native";
import { KeyboardRow, KeyConfig } from "@/types/keyboard";
import { renderKeyItem } from "./DraggableKeyList";
import { GripVertical } from "lucide-react-native";

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

export function renderRowItem({
  item,
  drag,
  isActive,
  onToggleVisibility,
  onRemoveKey,
  onReorderKeys,
  onAddKeyToRow,
  expandedRowId,
  onToggleExpand,
}: RenderRowItemProps) {
  const isExpanded = expandedRowId === item.id;

  return (
    <View
      className={`bg-[#1a1a1a] border border-[#303032] rounded-lg ${isExpanded ? "mb-0 rounded-b-none" : "mb-3"}`}
    >
      <View className="flex-row items-center p-3">
        <TouchableOpacity
          onLongPress={drag}
          delayLongPress={200}
          disabled={isActive}
          activeOpacity={0.7}
          className="mr-2"
          style={{
            width: 40,
            height: 40,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 20,
              color: "#9CA3AF",
              lineHeight: 20,
            }}
          >
            <GripVertical color={"#D3D3D3"} />
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onToggleExpand(item.id)}
          disabled={isActive}
          className="flex-1 flex-row items-center"
          activeOpacity={0.6}
        >
          <View className="flex-1">
            <Text className="text-white text-base font-semibold">
              {item.label}
            </Text>
            <Text className="text-gray-400 text-xs mt-0.5">
              {item.keys.length} keys • {item.category}
            </Text>
          </View>

          <Text className="text-gray-400 text-base ml-3">
            {isExpanded ? "▼" : "▶"}
          </Text>
        </TouchableOpacity>

        <View className="ml-3" style={{ justifyContent: "center" }}>
          <Switch
            value={item.visible}
            onValueChange={() => onToggleVisibility(item.id)}
            trackColor={{ false: "#3f3f46", true: "#22C55E" }}
            thumbColor={item.visible ? "#ffffff" : "#9ca3af"}
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
