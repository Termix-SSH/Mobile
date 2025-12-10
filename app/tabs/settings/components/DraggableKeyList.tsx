import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { KeyConfig } from "@/types/keyboard";
import { GripVertical } from "lucide-react-native";

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
    <View className="flex-row items-center bg-[#1a1a1a] border border-[#303032] rounded-lg p-3 mb-2">
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
        <GripVertical color={"#D3D3D3"} />
      </TouchableOpacity>

      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <View className="bg-[#27272a] border border-[#3f3f46] rounded px-3 py-1.5">
            <Text className="text-white text-sm font-mono">{item.label}</Text>
          </View>
          <Text className="text-gray-500 text-xs">{item.category}</Text>
        </View>
        {item.description && (
          <Text className="text-gray-400 text-xs mt-1" numberOfLines={1}>
            {item.description}
          </Text>
        )}
      </View>

      <TouchableOpacity
        onPress={onRemove}
        className="bg-red-900/30 border border-red-700 rounded-full ml-2"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.6}
        style={{
          width: 32,
          height: 32,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text
          className="text-red-400 font-bold"
          style={{ fontSize: 18, lineHeight: 18 }}
        >
          ×
        </Text>
      </TouchableOpacity>
    </View>
  );
}
