import { createContext, useContext } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** True inside tab screens that sit above the bottom bar. */
export const BottomBarShown = createContext(false);

/** True inside tab screens that sit beside the side rail. */
export const SideBarShown = createContext(false);

/** True inside views already below the status bar and clear of the notch, like session tabs. */
export const SafeAreaPadded = createContext(false);

/** The top safe area a full screen view still has to pad. */
export function useTopInset(): number {
  const insets = useSafeAreaInsets();
  return useContext(SafeAreaPadded) ? 0 : insets.top;
}

/** Left and right safe areas a full screen view still has to pad, like a notch held sideways. */
export function useSideInsets(): { left: number; right: number } {
  const insets = useSafeAreaInsets();
  const padded = useContext(SafeAreaPadded);
  const rail = useContext(SideBarShown);
  return {
    left: padded || rail ? 0 : insets.left,
    right: padded ? 0 : insets.right,
  };
}

/** The bottom safe area a view still has to pad. The bottom bar pads its own. */
export function useBottomInset(): number {
  const insets = useSafeAreaInsets();
  return useContext(BottomBarShown) ? 0 : insets.bottom;
}
