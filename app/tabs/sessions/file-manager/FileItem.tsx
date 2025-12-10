import { View, Text, TouchableOpacity } from "react-native";
import { File, Folder, Link } from "lucide-react-native";
import {
  formatFileSize,
  formatDate,
  getFileIconColor,
} from "./utils/fileUtils";

interface FileItemProps {
  name: string;
  type: "file" | "directory" | "link";
  size?: number;
  modified?: string;
  isSelected?: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onSelectToggle?: () => void;
  selectionMode?: boolean;
  columnCount?: number;
  useGrid?: boolean;
}

export function FileItem({
  name,
  type,
  size,
  modified,
  isSelected = false,
  onPress,
  onLongPress,
  onSelectToggle,
  selectionMode = false,
  columnCount = 1,
  useGrid = false,
}: FileItemProps) {
  const iconColor = getFileIconColor(name, type);
  const IconComponent =
    type === "directory" ? Folder : type === "link" ? Link : File;

  return (
    <TouchableOpacity
      style={{
        width: "100%",
        backgroundColor: isSelected ? "#27272a" : "#18181b",
        borderBottomWidth: 1,
        borderBottomColor: "#303032",
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
      }}
      onPress={selectionMode && onSelectToggle ? onSelectToggle : onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      {selectionMode && (
        <View className="mr-3">
          <View
            className={`w-6 h-6 rounded border-2 items-center justify-center ${
              isSelected
                ? "bg-blue-500 border-blue-600"
                : "bg-dark-bg border-dark-border-light"
            }`}
          >
            {isSelected && (
              <Text className="text-white text-xs font-bold">✓</Text>
            )}
          </View>
        </View>
      )}

      <View className="mr-3">
        <IconComponent size={24} color={iconColor} />
      </View>

      <View className="flex-1">
        <Text className="text-white font-medium" numberOfLines={1}>
          {name}
        </Text>
        <View className="flex-row items-center mt-0.5">
          {type === "directory" ? (
            <Text className="text-gray-400 text-xs">Folder</Text>
          ) : (
            <>
              {size !== undefined && (
                <Text className="text-gray-400 text-xs">
                  {formatFileSize(size)}
                </Text>
              )}
              {modified && (
                <>
                  {size !== undefined && (
                    <Text className="text-gray-500 text-xs mx-1">•</Text>
                  )}
                  <Text className="text-gray-400 text-xs">
                    {formatDate(modified)}
                  </Text>
                </>
              )}
            </>
          )}
        </View>
      </View>

      {type === "link" && !selectionMode && (
        <View className="ml-2">
          <Link size={16} color="#8B5CF6" />
        </View>
      )}
    </TouchableOpacity>
  );
}
