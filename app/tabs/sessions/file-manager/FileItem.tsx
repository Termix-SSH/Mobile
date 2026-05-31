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
            className={`h-6 w-6 items-center justify-center rounded border-2 ${
              isSelected
                ? "border-blue-600 bg-blue-500"
                : "border-border bg-background"
            }`}
          >
            {isSelected && (
              <Text className="text-xs font-bold text-foreground">✓</Text>
            )}
          </View>
        </View>
      )}

      <View className="mr-3">
        <IconComponent size={24} color={iconColor} />
      </View>

      <View className="flex-1">
        <Text className="font-medium text-foreground" numberOfLines={1}>
          {name}
        </Text>
        <View className="mt-0.5 flex-row items-center">
          {type === "directory" ? (
            <Text className="text-xs text-muted-foreground">Folder</Text>
          ) : (
            <>
              {size !== undefined && (
                <Text className="text-xs text-muted-foreground">
                  {formatFileSize(size)}
                </Text>
              )}
              {modified && (
                <>
                  {size !== undefined && (
                    <Text className="mx-1 text-xs text-muted-foreground">
                      •
                    </Text>
                  )}
                  <Text className="text-xs text-muted-foreground">
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
