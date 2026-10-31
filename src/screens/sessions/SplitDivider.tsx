import { useMemo, useRef, useState } from "react";
import { PanResponder, View, type ViewStyle } from "react-native";

/** Step for the screen reader increment and decrement actions. */
const A11Y_STEP = 40;

/**
 * Drag handle between two panes. Reports how far it moved since the drag
 * started. On a fold it fills the crease, otherwise it is a thin bar.
 */
export function SplitDivider({
  label,
  style,
  width,
  crease = false,
  onStart,
  onMove,
  onEnd,
}: {
  label: string;
  style?: ViewStyle;
  /** Width of the handle. A crease passes its own width. */
  width?: number;
  crease?: boolean;
  onStart: () => void;
  onMove: (dx: number) => void;
  onEnd: (dx: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const handlers = useRef({ onStart, onMove, onEnd });
  handlers.current = { onStart, onMove, onEnd };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // A terminal under the finger must not take the drag over.
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          setDragging(true);
          handlers.current.onStart();
        },
        onPanResponderMove: (_, g) => handlers.current.onMove(g.dx),
        onPanResponderRelease: (_, g) => {
          setDragging(false);
          handlers.current.onEnd(g.dx);
        },
        onPanResponderTerminate: (_, g) => {
          setDragging(false);
          handlers.current.onEnd(g.dx);
        },
      }),
    [],
  );
  const step = (dx: number) => {
    onStart();
    onMove(dx);
    onEnd(dx);
  };
  return (
    <View
      {...pan.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) =>
        step(e.nativeEvent.actionName === "increment" ? A11Y_STEP : -A11Y_STEP)
      }
      hitSlop={crease ? undefined : { left: 10, right: 10 }}
      className={`items-center justify-center ${dragging ? "bg-accent-brand/40" : crease ? "bg-background" : "bg-border"}`}
      style={[{ width: width ?? 6, zIndex: 2 }, style]}
    >
      <View
        className={`h-10 w-1 ${dragging ? "bg-accent-brand" : "bg-muted-foreground/50"}`}
      />
    </View>
  );
}
