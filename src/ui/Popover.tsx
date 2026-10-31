import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { useUiColors } from "@/contexts/ThemeContext";
import { useWindowInfo } from "@/utils/window-class";

export interface PopoverAnchor {
  /** Window coordinates, from measureInWindow. */
  x: number;
  y: number;
  width: number;
}

/**
 * A small square panel just above a control, like key variants on a long
 * press. Tapping anywhere else closes it. It sits in its own layer so a
 * scrolling row can't clip it.
 */
export function Popover({
  anchor,
  onClose,
  height = 44,
  children,
}: {
  anchor: PopoverAnchor | null;
  onClose: () => void;
  /** Height of the panel, to sit it just above the anchor. */
  height?: number;
  children: React.ReactNode;
}) {
  const ui = useUiColors();
  const win = useWindowInfo();
  const [panelWidth, setPanelWidth] = useState(0);
  // Keeps a panel near the right edge inside the window.
  const left = anchor
    ? Math.max(4, Math.min(anchor.x - 4, win.width - panelWidth - 4))
    : 0;
  return (
    <Modal
      visible={anchor !== null}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={{ flex: 1 }}
        onPress={onClose}
        accessibilityLabel="Close"
      >
        {anchor ? (
          <View
            onLayout={(e) => setPanelWidth(e.nativeEvent.layout.width)}
            style={{
              position: "absolute",
              left,
              top: Math.max(4, anchor.y - height - 8),
              flexDirection: "row",
              borderWidth: 1,
              borderColor: ui.brand,
              backgroundColor: ui.card,
            }}
          >
            {children}
          </View>
        ) : null}
      </Pressable>
    </Modal>
  );
}
