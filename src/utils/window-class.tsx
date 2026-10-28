import { createContext, useContext, useState } from "react";
import {
  Dimensions,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import type { FoldRegion } from "@/modules/termix-fold";
import { foldFrom, useFoldRegions, type Fold } from "@/utils/fold";

export type WindowClass = "compact" | "medium" | "expanded";

/** Width where tablet layouts start (sidebar, split view, companions). */
export const MEDIUM_MIN_WIDTH = 600;
export const EXPANDED_MIN_WIDTH = 840;
/** Smallest screen side that gets split view. */
export const SPLIT_MIN_SIDE = 600;

export type WindowInfo = {
  width: number;
  height: number;
  windowClass: WindowClass;
  isLandscape: boolean;
  isPortrait: boolean;
  /** Wide enough for the sidebar and master/detail layouts. */
  isWide: boolean;
  /** Both sides big enough for two panes. */
  canSplit: boolean;
  /** Short window, like a phone in landscape. */
  isShort: boolean;
  /** Where a foldable screen bends, if it splits this window. */
  fold: Fold | null;
};

export function windowClassFor(width: number): WindowClass {
  if (width >= EXPANDED_MIN_WIDTH) return "expanded";
  if (width >= MEDIUM_MIN_WIDTH) return "medium";
  return "compact";
}

export function windowInfo(
  width: number,
  height: number,
  folds: FoldRegion[] = [],
): WindowInfo {
  const windowClass = windowClassFor(width);
  const isLandscape = width > height;
  return {
    width,
    height,
    windowClass,
    isLandscape,
    isPortrait: !isLandscape,
    isWide: windowClass !== "compact",
    canSplit: Math.min(width, height) >= SPLIT_MIN_SIDE,
    isShort: height < 500,
    fold: foldFrom(folds, width, height),
  };
}

type Size = { width: number; height: number };

const RootSize = createContext<Size | null>(null);
let measured: Size | null = null;

/**
 * Fills the screen and measures itself. React Native's window size can lag behind a
 * turn on iOS, so the size the root view really has wins.
 */
export function WindowSizeRoot({ children }: { children?: React.ReactNode }) {
  const [size, setSize] = useState<Size | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    if (size && size.width === width && size.height === height) return;
    measured = { width, height };
    setSize(measured);
  };
  return (
    <View style={{ flex: 1 }} collapsable={false} onLayout={onLayout}>
      <RootSize.Provider value={size}>{children}</RootSize.Provider>
    </View>
  );
}

/** Window size outside of React, for one time choices. */
export function currentWindowSize(): Size {
  if (measured) return measured;
  const { width, height } = Dimensions.get("window");
  return { width, height };
}

/** The one source of truth for layout breakpoints. Follows turns, folds and window resizes. */
export function useWindowInfo(): WindowInfo {
  const dims = useWindowDimensions();
  const root = useContext(RootSize);
  const folds = useFoldRegions();
  const { width, height } = root ?? dims;
  return windowInfo(width, height, folds);
}
