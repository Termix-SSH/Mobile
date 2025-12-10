import { View, Text, TouchableOpacity } from "react-native";
import { Copy, Scissors, Clipboard, Trash2, X } from "lucide-react-native";
import { getResponsivePadding } from "@/app/utils/responsive";
import {
  BORDERS,
  BORDER_COLORS,
  BACKGROUNDS,
  RADIUS,
} from "@/app/constants/designTokens";

interface FileManagerToolbarProps {
  selectionMode: boolean;
  selectedCount: number;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onCancelSelection: () => void;
  onCancelClipboard?: () => void;
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
  onCancelClipboard,
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
  const bottomPosition = isLandscape ? bottomInset - 20 : 0;

  return (
    <View
      style={{
        position: "absolute",
        bottom: bottomPosition,
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
          <Text
            style={{
              color: "#ffffff",
              fontWeight: "500",
              marginRight: 16,
              fontSize: isLandscape ? 12 : 14,
            }}
          >
            {selectedCount} selected
          </Text>

          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
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
                color={selectedCount === 0 ? "#4B5563" : "white"}
              />
            </TouchableOpacity>

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
                color={selectedCount === 0 ? "#4B5563" : "white"}
              />
            </TouchableOpacity>

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
                color={selectedCount === 0 ? "#4B5563" : "white"}
              />
            </TouchableOpacity>

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
              <X size={iconSize} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text
            style={{
              color: "#ffffff",
              fontWeight: "500",
              marginRight: 16,
              fontSize: isLandscape ? 12 : 14,
            }}
          >
            {clipboardCount} item{clipboardCount !== 1 ? "s" : ""}{" "}
            {clipboardOperation === "copy" ? "copied" : "cut"}
          </Text>

          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <TouchableOpacity
              onPress={onPaste}
              style={{
                padding: buttonPadding,
                backgroundColor: BACKGROUNDS.BUTTON_ALT,
                borderRadius: RADIUS.SMALL,
                borderWidth: BORDERS.STANDARD,
                borderColor: BORDER_COLORS.BUTTON,
              }}
              activeOpacity={0.7}
            >
              <Clipboard size={iconSize} color="white" />
            </TouchableOpacity>

            {onCancelClipboard && (
              <TouchableOpacity
                onPress={onCancelClipboard}
                style={{
                  padding: buttonPadding,
                  backgroundColor: BACKGROUNDS.BUTTON_ALT,
                  borderRadius: RADIUS.SMALL,
                  borderWidth: BORDERS.STANDARD,
                  borderColor: BORDER_COLORS.BUTTON,
                }}
                activeOpacity={0.7}
              >
                <X size={iconSize} color="white" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
