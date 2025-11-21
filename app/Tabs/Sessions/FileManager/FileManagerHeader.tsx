import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import {
  ChevronLeft,
  RefreshCw,
  FolderPlus,
  FilePlus,
  Upload,
  MoreVertical,
} from "lucide-react-native";
import { breadcrumbsFromPath, getBreadcrumbLabel } from "./utils/fileUtils";

interface FileManagerHeaderProps {
  currentPath: string;
  onNavigateToPath: (path: string) => void;
  onRefresh: () => void;
  onCreateFolder: () => void;
  onCreateFile: () => void;
  onUpload?: () => void;
  onMenuPress: () => void;
  isLoading: boolean;
}

export function FileManagerHeader({
  currentPath,
  onNavigateToPath,
  onRefresh,
  onCreateFolder,
  onCreateFile,
  onUpload,
  onMenuPress,
  isLoading,
}: FileManagerHeaderProps) {
  const breadcrumbs = breadcrumbsFromPath(currentPath);
  const isRoot = currentPath === "/";

  return (
    <View className="bg-dark-bg-header border-b-2 border-dark-border">
      {/* Path breadcrumbs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="px-4 py-3 border-b border-dark-border-medium"
      >
        <View className="flex-row items-center">
          {!isRoot && (
            <TouchableOpacity
              onPress={() => {
                const parentPath = breadcrumbs[breadcrumbs.length - 2] || "/";
                onNavigateToPath(parentPath);
              }}
              className="mr-2 p-1"
              activeOpacity={0.7}
            >
              <ChevronLeft size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}

          {breadcrumbs.map((path, index) => (
            <View key={path} className="flex-row items-center">
              {index > 0 && (
                <Text className="text-gray-500 mx-1">/</Text>
              )}
              <TouchableOpacity
                onPress={() => onNavigateToPath(path)}
                className={`px-2 py-1 rounded ${
                  index === breadcrumbs.length - 1
                    ? "bg-dark-bg-button"
                    : ""
                }`}
                activeOpacity={0.7}
              >
                <Text
                  className={
                    index === breadcrumbs.length - 1
                      ? "text-white font-medium"
                      : "text-gray-400"
                  }
                >
                  {getBreadcrumbLabel(path)}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Action buttons */}
      <View className="flex-row items-center px-4 py-2">
        <TouchableOpacity
          onPress={onRefresh}
          className="mr-3 p-2 bg-dark-bg-button rounded border border-dark-border"
          activeOpacity={0.7}
          disabled={isLoading}
        >
          <RefreshCw
            size={18}
            color={isLoading ? "#6B7280" : "#9CA3AF"}
            style={{
              transform: [{ rotate: isLoading ? "45deg" : "0deg" }],
            }}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onCreateFolder}
          className="mr-3 p-2 bg-dark-bg-button rounded border border-dark-border"
          activeOpacity={0.7}
        >
          <FolderPlus size={18} color="#3B82F6" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onCreateFile}
          className="mr-3 p-2 bg-dark-bg-button rounded border border-dark-border"
          activeOpacity={0.7}
        >
          <FilePlus size={18} color="#10B981" />
        </TouchableOpacity>

        {onUpload && (
          <TouchableOpacity
            onPress={onUpload}
            className="mr-3 p-2 bg-dark-bg-button rounded border border-dark-border"
            activeOpacity={0.7}
          >
            <Upload size={18} color="#F59E0B" />
          </TouchableOpacity>
        )}

        <View className="flex-1" />

        <TouchableOpacity
          onPress={onMenuPress}
          className="p-2 bg-dark-bg-button rounded border border-dark-border"
          activeOpacity={0.7}
        >
          <MoreVertical size={18} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
