import { useCallback, useState } from "react";
import { Modal, Pressable, View, useWindowDimensions } from "react-native";
import { Text } from "./Text";
import { useUiColors } from "@/contexts/ThemeContext";

export type ContextMenuItem = {
  id: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

export const MENU_WIDTH = 220;
const ITEM_HEIGHT = 40;
const MARGIN = 8;

type PointerLike = {
  button?: number;
  buttons?: number;
  pointerType?: string;
  pageX?: number;
  pageY?: number;
  clientX?: number;
  clientY?: number;
};

/** A right click, or a trackpad two finger tap. Touch never counts. */
export function isSecondaryClick(e: PointerLike): boolean {
  if (e.pointerType === "touch") return false;
  return e.button === 2 || (e.buttons !== undefined && (e.buttons & 2) !== 0);
}

/** Keeps the menu inside the window, flipping up or left near an edge. */
export function menuPosition(
  at: { x: number; y: number },
  size: { width: number; height: number },
  win: { width: number; height: number },
): { left: number; top: number } {
  const left =
    at.x + size.width + MARGIN > win.width
      ? Math.max(MARGIN, at.x - size.width)
      : at.x;
  const top =
    at.y + size.height + MARGIN > win.height
      ? Math.max(MARGIN, at.y - size.height)
      : at.y;
  return { left, top };
}

export function menuHeight(count: number): number {
  return count * ITEM_HEIGHT + 2;
}

/**
 * A small menu at the pointer. Spread `triggerProps` on a view, then render
 * `menu` once next to it. Right click opens it.
 */
export function useContextMenu(items: ContextMenuItem[]) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const close = useCallback(() => setAt(null), []);

  const triggerProps = {
    onPointerDown: (e: {
      nativeEvent: PointerLike;
      preventDefault?: () => void;
    }) => {
      const n = e.nativeEvent;
      if (!isSecondaryClick(n)) return;
      setAt({ x: n.pageX ?? n.clientX ?? 0, y: n.pageY ?? n.clientY ?? 0 });
    },
  };

  // Only mounted while open, so a long list doesn't hold a Modal per row.
  const menu =
    items.length > 0 && at ? (
      <ContextMenu at={at} items={items} onClose={close} />
    ) : null;
  return { triggerProps, menu };
}

export function ContextMenu({
  at,
  items,
  onClose,
}: {
  at: { x: number; y: number } | null;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ui = useUiColors();
  const win = useWindowDimensions();
  const pos = at
    ? menuPosition(
        at,
        { width: MENU_WIDTH, height: menuHeight(items.length) },
        win,
      )
    : { left: 0, top: 0 };

  return (
    <Modal
      visible={at !== null}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={{ flex: 1 }}
        onPress={onClose}
        accessibilityLabel="Close menu"
      >
        <View
          accessibilityRole="menu"
          style={{
            position: "absolute",
            left: pos.left,
            top: pos.top,
            width: MENU_WIDTH,
            borderWidth: 1,
            borderColor: ui.border,
            backgroundColor: ui.card,
          }}
        >
          {items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="menuitem"
              onPress={() => {
                onClose();
                item.onPress();
              }}
              className="justify-center px-3 hover:bg-muted/50 active:bg-muted/50"
              style={{ height: ITEM_HEIGHT }}
            >
              <Text
                className={`text-sm ${item.destructive ? "text-destructive-text" : "text-foreground"}`}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}
