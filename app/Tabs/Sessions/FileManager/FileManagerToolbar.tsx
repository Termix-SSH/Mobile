import { View, Text, TouchableOpacity } from "react-native";
import { Copy, Scissors, Clipboard, Trash2, X } from "lucide-react-native";
import { getResponsivePadding } from "@/app/utils/responsive";
import { BORDERS, BORDER_COLORS, BACKGROUNDS, RADIUS } from "@/app/constants/designTokens";

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
  isLandscape: boolean;
  bottomInset: number;
  tabBarHeight: number;
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
  isLandscape,
  bottomInset,
  tabBarHeight,
}: FileManagerToolbarProps) {
  if (!selectionMode && clipboardCount === 0) {
    return null;
  }

  const padding = getResponsivePadding(isLandscape);
  const iconSize = isLandscape ? 18 : 20;
  const buttonPadding = isLandscape ? 6 : 8;

  return (
    <View
      style={{
        position: "absolute",
        bottom: 23,
        left: 0,
        right: 0,
        backgroundColor: BACKGROUNDS.HEADER,
        borderTopWidth: BORDERS.MAJOR,
        borderTopColor: BORDER_COLORS.PRIMARY,
        paddingHorizontal: padding,
        paddingVertical: isLandscape ? 8 : 12,
        zIndex: 1000,
      }}
    >
      {selectionMode ? (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {/* Selection count */}
          <Text style={{ color: "#ffffff", fontWeight: "500", marginRight: 16, fontSize: isLandscape ? 12 : 14 }}>
            {selectedCount} selected
          </Text>

          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
            {/* Copy */}
            <TouchableOpacity
              onPress={onCopy}
              style={{
                padding: buttonPadding,
                backgroundColor: BACKGROUNDS.BUTTON_ALT,
                borderRadius: RADIUS.SMALL,
                borderWidth: BORDERS.STANDARD,
                borderColor: BORDER_COLORS.BUTTON,
              }}
              activeOpacity={0.7}
              disabled={selectedCount === 0}
            >
              <Copy
                size={iconSize}
                color={selectedCount === 0 ? "#4B5563" : "#3B82F6"}
              />
            </TouchableOpacity>

            {/* Cut */}
            <TouchableOpacity
              onPress={onCut}
              style={{
                padding: buttonPadding,
                backgroundColor: BACKGROUNDS.BUTTON_ALT,
                borderRadius: RADIUS.SMALL,
                borderWidth: BORDERS.STANDARD,
                borderColor: BORDER_COLORS.BUTTON,
              }}
              activeOpacity={0.7}
              disabled={selectedCount === 0}
            >
              <Scissors
                size={iconSize}
                color={selectedCount === 0 ? "#4B5563" : "#F59E0B"}
              />
            </TouchableOpacity>

            {/* Delete */}
            <TouchableOpacity
              onPress={onDelete}
              style={{
                padding: buttonPadding,
                backgroundColor: BACKGROUNDS.BUTTON_ALT,
                borderRadius: RADIUS.SMALL,
                borderWidth: BORDERS.STANDARD,
                borderColor: BORDER_COLORS.BUTTON,
              }}
              activeOpacity={0.7}
              disabled={selectedCount === 0}
            >
              <Trash2
                size={iconSize}
                color={selectedCount === 0 ? "#4B5563" : "#EF4444"}
              />
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity
              onPress={onCancelSelection}
              style={{
                marginLeft: 8,
                padding: buttonPadding,
                backgroundColor: BACKGROUNDS.BUTTON_ALT,
                borderRadius: RADIUS.SMALL,
                borderWidth: BORDERS.STANDARD,
                borderColor: BORDER_COLORS.BUTTON,
              }}
              activeOpacity={0.7}
            >
              <X size={iconSize} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {/* Clipboard info */}
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
            {clipboardOperation === "copy" ? (
              <Copy size={iconSize} color="#3B82F6" />
            ) : (
              <Scissors size={iconSize} color="#F59E0B" />
            )}
            <Text style={{ color: "#ffffff", marginLeft: 8, fontSize: isLandscape ? 12 : 14 }}>
              {clipboardCount} item{clipboardCount !== 1 ? "s" : ""}{" "}
              {clipboardOperation === "copy" ? "copied" : "cut"}
            </Text>
          </View>

          {/* Paste button */}
          <TouchableOpacity
            onPress={onPaste}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: isLandscape ? 12 : 16,
              paddingVertical: isLandscape ? 6 : 8,
              backgroundColor: "#3B82F6",
              borderRadius: RADIUS.SMALL,
              borderWidth: BORDERS.STANDARD,
              borderColor: "#2563EB",
            }}
            activeOpacity={0.7}
          >
            <Clipboard size={iconSize} color="white" />
            <Text style={{ color: "#ffffff", fontWeight: "500", marginLeft: 8, fontSize: isLandscape ? 12 : 14 }}>Paste</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
