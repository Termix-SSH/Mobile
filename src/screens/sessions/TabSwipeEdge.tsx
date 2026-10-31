import { useMemo } from "react";
import { View } from "react-native";
import {
  Directions,
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";

// Thin enough to leave the terminal's own drags alone.
const EDGE = 16;

/** A swipe in from the screen edge goes to the tab on that side. */
export function TabSwipeEdge({
  side,
  onSwipe,
}: {
  side: "left" | "right";
  onSwipe: () => void;
}) {
  const fling = useMemo(
    () =>
      Gesture.Fling()
        .direction(side === "left" ? Directions.RIGHT : Directions.LEFT)
        .runOnJS(true)
        .onEnd((_e, success) => {
          if (success) onSwipe();
        }),
    [side, onSwipe],
  );
  return (
    <GestureDetector gesture={fling}>
      <View
        accessible={false}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: EDGE,
          [side]: 0,
          zIndex: 50,
        }}
      />
    </GestureDetector>
  );
}
