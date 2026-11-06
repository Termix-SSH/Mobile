import { createContext, useContext } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** True inside tab screens that sit above the bottom bar. */
export const BottomBarShown = createContext(false);

/**
 * The side of the rail, inside tab screens that sit beside it. The rail pads
 * that side's safe area itself, like a notch or the iPhone Duo bar column.
 */
export const SideBarShown = createContext<"left" | "right" | null>(null);

/** True inside views already below the status bar and clear of the notch, like session tabs. */
export const SafeAreaPadded = createContext(false);

/**
 * True inside panes whose parent already keeps clear of the left and right safe
 * areas, like the host list beside sessions. Its top still pads.
 */
export const SideInsetsPadded = createContext(false);

/** The top safe area a full screen view still has to pad. */
export function useTopInset(): number {
  const insets = useSafeAreaInsets();
  return useContext(SafeAreaPadded) ? 0 : insets.top;
}

/** Left and right safe areas a full screen view still has to pad, like a notch held sideways. */
export function useSideInsets(): { left: number; right: number } {
  const insets = useSafeAreaInsets();
  const areaPadded = useContext(SafeAreaPadded);
  const sidesPadded = useContext(SideInsetsPadded);
  const padded = areaPadded || sidesPadded;
  const rail = useContext(SideBarShown);
  return {
    left: padded || rail === "left" ? 0 : insets.left,
    right: padded || rail === "right" ? 0 : insets.right,
  };
}

/** The bottom safe area a view still has to pad. The bottom bar pads its own. */
export function useBottomInset(): number {
  const insets = useSafeAreaInsets();
  return useContext(BottomBarShown) ? 0 : insets.bottom;
}
