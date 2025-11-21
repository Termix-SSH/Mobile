import { View, Text, TouchableOpacity } from "react-native";
import { Copy, Scissors, Clipboard, Trash2, X } from "lucide-react-native";

interface FileManagerToolbarProps {
  selectionMode: boolean;
  selectedCount: number;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onCancelSelection: () => void;
  clipboardCount?: number;
  clipboardOperation?: "copy" | "cut" | null;
}

export function FileManagerToolbar({
  selectionMode,
  selectedCount,
  onCopy,
  onCut,
  onPaste,
  onDelete,
  onCancelSelection,
  clipboardCount = 0,
  clipboardOperation = null,
}: FileManagerToolbarProps) {
  if (!selectionMode && clipboardCount === 0) {
    return null;
  }

  return (
    <View className="absolute bottom-0 left-0 right-0 bg-dark-bg-button border-t-2 border-dark-border px-4 py-3">
      {selectionMode ? (
        <View className="flex-row items-center">
          {/* Selection count */}
          <Text className="text-white font-medium mr-4">
            {selectedCount} selected
          </Text>

          <View className="flex-1 flex-row items-center justify-end gap-2">
            {/* Copy */}
            <TouchableOpacity
              onPress={onCopy}
              className="p-2 bg-dark-bg-darker rounded border border-dark-border"
              activeOpacity={0.7}
              disabled={selectedCount === 0}
            >
              <Copy
                size={20}
                color={selectedCount === 0 ? "#4B5563" : "#3B82F6"}
              />
            </TouchableOpacity>

            {/* Cut */}
            <TouchableOpacity
              onPress={onCut}
              className="p-2 bg-dark-bg-darker rounded border border-dark-border"
              activeOpacity={0.7}
              disabled={selectedCount === 0}
            >
              <Scissors
                size={20}
                color={selectedCount === 0 ? "#4B5563" : "#F59E0B"}
              />
            </TouchableOpacity>

            {/* Delete */}
            <TouchableOpacity
              onPress={onDelete}
              className="p-2 bg-dark-bg-darker rounded border border-dark-border"
              activeOpacity={0.7}
              disabled={selectedCount === 0}
            >
              <Trash2
                size={20}
                color={selectedCount === 0 ? "#4B5563" : "#EF4444"}
              />
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity
              onPress={onCancelSelection}
              className="ml-2 p-2 bg-dark-bg-darker rounded border border-dark-border"
              activeOpacity={0.7}
            >
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View className="flex-row items-center">
          {/* Clipboard info */}
          <View className="flex-1 flex-row items-center">
            {clipboardOperation === "copy" ? (
              <Copy size={18} color="#3B82F6" />
            ) : (
              <Scissors size={18} color="#F59E0B" />
            )}
            <Text className="text-white ml-2">
              {clipboardCount} item{clipboardCount !== 1 ? "s" : ""}{" "}
              {clipboardOperation === "copy" ? "copied" : "cut"}
            </Text>
          </View>

          {/* Paste button */}
          <TouchableOpacity
            onPress={onPaste}
            className="flex-row items-center px-4 py-2 bg-blue-500 rounded border border-blue-600"
            activeOpacity={0.7}
          >
            <Clipboard size={18} color="white" />
            <Text className="text-white font-medium ml-2">Paste</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
