import { createContext, useContext } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** True inside tab screens that sit above the bottom bar. */
export const BottomBarShown = createContext(false);

/** The bottom safe area a view still has to pad. The bottom bar pads its own. */
export function useBottomInset(): number {
  const insets = useSafeAreaInsets();
  return useContext(BottomBarShown) ? 0 : insets.bottom;
}
