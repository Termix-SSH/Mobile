import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChevronLeft,
  RefreshCw,
  FolderPlus,
  FilePlus,
  Upload,
  MoreVertical,
} from "lucide-react-native";
import { breadcrumbsFromPath, getBreadcrumbLabel } from "./utils/fileUtils";
import {
  getResponsivePadding,
  getResponsiveFontSize,
} from "@/app/utils/responsive";
import {
  BORDERS,
  BORDER_COLORS,
  BACKGROUNDS,
  RADIUS,
} from "@/app/constants/designTokens";

interface FileManagerHeaderProps {
  currentPath: string;
  onNavigateToPath: (path: string) => void;
  onRefresh: () => void;
  onCreateFolder: () => void;
  onCreateFile: () => void;
  onUpload?: () => void;
  onMenuPress: () => void;
  isLoading: boolean;
  isLandscape: boolean;
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
  isLandscape,
}: FileManagerHeaderProps) {
  const insets = useSafeAreaInsets();
  const breadcrumbs = breadcrumbsFromPath(currentPath);
  const isRoot = currentPath === "/";
  const padding = getResponsivePadding(isLandscape);
  const iconSize = isLandscape ? 16 : 18;
  const chevronSize = isLandscape ? 18 : 20;
  const buttonPadding = isLandscape ? 6 : 8;

  return (
    <View
      style={{
        backgroundColor: BACKGROUNDS.HEADER,
        borderBottomWidth: BORDERS.MAJOR,
        borderBottomColor: BORDER_COLORS.PRIMARY,
        paddingHorizontal: Math.max(insets.left, insets.right, padding),
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{
          paddingVertical: isLandscape ? 8 : 12,
          borderBottomWidth: BORDERS.STANDARD,
          borderBottomColor: BORDER_COLORS.SECONDARY,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {!isRoot && (
            <TouchableOpacity
              onPress={() => {
                const parentPath = breadcrumbs[breadcrumbs.length - 2] || "/";
                onNavigateToPath(parentPath);
              }}
              style={{ marginRight: 8, padding: 4 }}
              activeOpacity={0.7}
            >
              <ChevronLeft size={chevronSize} color="#9CA3AF" />
            </TouchableOpacity>
          )}

          {breadcrumbs.map((path, index) => (
            <View
              key={path}
              style={{ flexDirection: "row", alignItems: "center" }}
            >
              {index > 0 && breadcrumbs[index - 1] !== "/" && (
                <Text
                  style={{
                    color: "#6B7280",
                    marginHorizontal: 6,
                    fontSize: isLandscape ? 12 : 14,
                  }}
                >
                  /
                </Text>
              )}
              <TouchableOpacity
                onPress={() => onNavigateToPath(path)}
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: RADIUS.SMALL,
                  backgroundColor:
                    index === breadcrumbs.length - 1
                      ? BACKGROUNDS.BUTTON_ALT
                      : "transparent",
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={{
                    color:
                      index === breadcrumbs.length - 1 ? "#ffffff" : "#9CA3AF",
                    fontWeight:
                      index === breadcrumbs.length - 1 ? "500" : "400",
                    fontSize: isLandscape ? 12 : 14,
                  }}
                >
                  {getBreadcrumbLabel(path)}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: isLandscape ? 6 : 8,
        }}
      >
        <TouchableOpacity
          onPress={onRefresh}
          style={{
            marginRight: 8,
            padding: buttonPadding,
            backgroundColor: BACKGROUNDS.BUTTON_ALT,
            borderRadius: RADIUS.SMALL,
            borderWidth: BORDERS.STANDARD,
            borderColor: BORDER_COLORS.BUTTON,
          }}
          activeOpacity={0.7}
          disabled={isLoading}
        >
          <RefreshCw
            size={iconSize}
            color={isLoading ? "#6B7280" : "#9CA3AF"}
            style={{
              transform: [{ rotate: isLoading ? "45deg" : "0deg" }],
            }}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onCreateFolder}
          style={{
            marginRight: 8,
            padding: buttonPadding,
            backgroundColor: BACKGROUNDS.BUTTON_ALT,
            borderRadius: RADIUS.SMALL,
            borderWidth: BORDERS.STANDARD,
            borderColor: BORDER_COLORS.BUTTON,
          }}
          activeOpacity={0.7}
        >
          <FolderPlus size={iconSize} color="#3B82F6" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onCreateFile}
          style={{
            marginRight: 8,
            padding: buttonPadding,
            backgroundColor: BACKGROUNDS.BUTTON_ALT,
            borderRadius: RADIUS.SMALL,
            borderWidth: BORDERS.STANDARD,
            borderColor: BORDER_COLORS.BUTTON,
          }}
          activeOpacity={0.7}
        >
          <FilePlus size={iconSize} color="#10B981" />
        </TouchableOpacity>

        {onUpload && (
          <TouchableOpacity
            onPress={onUpload}
            style={{
              marginRight: 8,
              padding: buttonPadding,
              backgroundColor: BACKGROUNDS.BUTTON_ALT,
              borderRadius: RADIUS.SMALL,
              borderWidth: BORDERS.STANDARD,
              borderColor: BORDER_COLORS.BUTTON,
            }}
            activeOpacity={0.7}
          >
            <Upload size={iconSize} color="#F59E0B" />
          </TouchableOpacity>
        )}

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          onPress={onMenuPress}
          style={{
            padding: buttonPadding,
            backgroundColor: BACKGROUNDS.BUTTON_ALT,
            borderRadius: RADIUS.SMALL,
            borderWidth: BORDERS.STANDARD,
            borderColor: BORDER_COLORS.BUTTON,
          }}
          activeOpacity={0.7}
        >
          <MoreVertical size={iconSize} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
