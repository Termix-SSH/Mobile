import React from "react";
import { View } from "react-native";
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import { Text, Button, Label } from "@/app/components/ui";

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
  }: RenderItemParams<UnifiedListItem>) => {
    if (item.type === "header") {
      return (
        <View className="mb-3 flex-row items-center justify-between">
          <View className="min-w-0 flex-1">
            <Label>{item.title}</Label>
            {item.subtitle ? (
              <Text className="mt-0.5 text-[10px] text-muted-foreground">
                {item.subtitle}
              </Text>
            ) : null}
          </View>
          {item.onAddPress ? (
            <Button variant="accent" size="sm" onPress={item.onAddPress}>
              {item.addButtonLabel ?? "+ Add"}
            </Button>
          ) : null}
        </View>
      );
    }

    if (item.type === "draggable-key") {
      const isRowKey = item.rowId !== undefined;
      return (
        <ScaleDecorator>
          <View
            style={{ opacity: isActive ? 0.5 : 1 }}
            className={isRowKey ? "border-x border-border bg-card" : ""}
          >
            {item.renderItem(
              item.data,
              () => onRemoveKey?.(item.id, item.section),
              drag,
              isActive,
            )}
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
        <View className="-mt-px border-x border-t border-border bg-card px-3 pb-2 pt-3">
          <View className="flex-row items-center justify-between">
            <Text weight="medium" className="text-xs text-foreground">
              Keys in this row
            </Text>
            {item.onAddPress ? (
              <Button variant="accent" size="sm" onPress={item.onAddPress}>
                + Add Key
              </Button>
            ) : null}
          </View>
        </View>
      );
    }

    if (item.type === "button") {
      return (
        <Button
          variant={item.variant === "danger" ? "destructive" : "outline"}
          onPress={item.onPress}
          className="mb-3"
        >
          {item.label}
        </Button>
      );
    }

    if (item.type === "spacer") {
      const isRowClose = item.id.startsWith("row-close-");
      if (isRowClose) {
        return (
          <View
            className="mb-3 border-x border-b border-border bg-card"
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
