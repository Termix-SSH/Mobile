import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";

export type UnifiedListItem =
  | {
      type: "header";
      id: string;
      title: string;
      subtitle?: string;
      onAddPress?: () => void;
      addButtonLabel?: string;
    }
  | {
      type: "draggable-key";
      id: string;
      data: any;
      section: string;
      rowId?: string;
      renderItem: (
        item: any,
        onRemove: () => void,
        drag: () => void,
        isActive: boolean,
      ) => React.ReactNode;
    }
  | {
      type: "draggable-row";
      id: string;
      data: any;
      renderItem: (
        item: any,
        drag: () => void,
        isActive: boolean,
      ) => React.ReactNode;
    }
  | {
      type: "row-keys-header";
      id: string;
      rowId: string;
      onAddPress?: () => void;
    }
  | {
      type: "button";
      id: string;
      label: string;
      onPress: () => void;
      variant?: "danger" | "normal";
    }
  | { type: "spacer"; id: string; height: number };

interface UnifiedDraggableListProps {
  data: UnifiedListItem[];
  onDragEnd: (data: UnifiedListItem[]) => void;
  onRemoveKey?: (itemId: string, section: string) => void;
}

export default function UnifiedDraggableList({
  data,
  onDragEnd,
  onRemoveKey,
}: UnifiedDraggableListProps) {
  const renderItem = ({
    item,
    drag,
    isActive,
    getIndex,
  }: RenderItemParams<UnifiedListItem>) => {
    if (item.type === "header") {
      return (
        <View className="mb-3">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-white text-lg font-semibold">
                {item.title}
              </Text>
              {item.subtitle && (
                <Text className="text-gray-400 text-xs mt-0.5">
                  {item.subtitle}
                </Text>
              )}
            </View>
            {item.onAddPress && (
              <TouchableOpacity
                onPress={item.onAddPress}
                className="bg-green-600 rounded-lg px-4 py-2"
              >
                <Text className="text-white text-sm font-semibold">
                  {item.addButtonLabel || "+ Add"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    if (item.type === "draggable-key") {
      const isRowKey = item.rowId !== undefined;

      return (
        <ScaleDecorator>
          <View style={{ opacity: isActive ? 0.5 : 1 }}>
            <View
              className={
                isRowKey
                  ? "bg-[#1a1a1a] px-4 border-l border-r border-[#303032]"
                  : ""
              }
            >
              {item.renderItem(
                item.data,
                () => onRemoveKey?.(item.id, item.section),
                drag,
                isActive,
              )}
            </View>
          </View>
        </ScaleDecorator>
      );
    }

    if (item.type === "draggable-row") {
      return (
        <ScaleDecorator>
          <View style={{ opacity: isActive ? 0.5 : 1 }}>
            {item.renderItem(item.data, drag, isActive)}
          </View>
        </ScaleDecorator>
      );
    }

    if (item.type === "row-keys-header") {
      return (
        <View className="px-4 pb-2 pt-4 border-t border-l border-r border-[#303032] bg-[#1a1a1a] -mt-px">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-white text-sm font-semibold">
              Keys in this row
            </Text>
            {item.onAddPress && (
              <TouchableOpacity
                onPress={item.onAddPress}
                className="bg-green-600 rounded px-3 py-1.5"
              >
                <Text className="text-white text-xs font-semibold">
                  + Add Key
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    if (item.type === "button") {
      const isDanger = item.variant === "danger";
      return (
        <TouchableOpacity
          onPress={item.onPress}
          className={`rounded-lg p-3 mb-3 ${
            isDanger
              ? "bg-red-900/20 border border-red-700"
              : "bg-[#27272a] border border-[#3f3f46]"
          }`}
        >
          <Text
            className={`text-center font-semibold ${
              isDanger ? "text-red-400" : "text-white"
            }`}
          >
            {item.label}
          </Text>
        </TouchableOpacity>
      );
    }

    if (item.type === "spacer") {
      const isRowClose = item.id.startsWith("row-close-");

      if (isRowClose) {
        return (
          <View
            className="bg-[#1a1a1a] border-l border-r border-b border-[#303032] rounded-b-lg mb-3"
            style={{ height: item.height }}
          />
        );
      }

      return <View style={{ height: item.height }} />;
    }

    return null;
  };

  return (
    <DraggableFlatList
      data={data}
      onDragEnd={({ data: newData }) => onDragEnd(newData)}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    />
  );
}
