import { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  type HostInstance,
  type LayoutChangeEvent,
} from "react-native";
import { useWindowInfo } from "@/utils/window-class";

/**
 * Extra space a header keeps from a rounded top corner. iPhone Duo's inner
 * screen has round corners where its outer screen is square, so titles and
 * buttons that sit right in a corner get clipped there.
 */
export const CORNER_PAD = 20;

/** How far down the window a header can start and still reach into a corner. */
const CORNER_ZONE = 80;

type Frame = { x: number; y: number; width: number };

/** The extra side padding for a header at this window position. */
export function cornerPad(
  frame: Frame | null,
  windowWidth: number,
  rounded: boolean,
): { left: number; right: number } {
  if (!rounded || !frame || frame.y >= CORNER_ZONE)
    return { left: 0, right: 0 };
  return {
    left: frame.x < 1 ? CORNER_PAD : 0,
    right: frame.x + frame.width > windowWidth - 1 ? CORNER_PAD : 0,
  };
}

/**
 * Side padding that keeps a header row out of the rounded top corners of
 * iPhone Duo's inner screen. Give the row the onLayout. Everywhere else, and
 * lower down the screen, it adds nothing.
 */
export function useCornerPad() {
  const row = useRef<HostInstance | null>(null);
  const win = useWindowInfo();
  // Only the inner screen has a fold, and only it has round corners.
  const rounded = Platform.OS === "ios" && win.fold !== null;
  const [frame, setFrame] = useState<Frame | null>(null);
  const measure = useCallback(() => {
    if (!rounded) return;
    row.current?.measureInWindow((x, y, width) =>
      setFrame((prev) =>
        prev && prev.x === x && prev.y === y && prev.width === width
          ? prev
          : { x, y, width },
      ),
    );
  }, [rounded]);
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      if (typeof e.currentTarget !== "number") row.current = e.currentTarget;
      measure();
    },
    [measure],
  );
  // A turn, or the bar column changing sides, can move the row without changing its size.
  useEffect(measure, [measure, win.width, win.height, win.verticalBar]);
  return { onLayout, pad: cornerPad(frame, win.width, rounded) };
}
