import { useSyncExternalStore } from "react";
import { I18nManager } from "react-native";
import {
  addVerticalBarListener,
  getVerticalBar,
  type VerticalBarInfo,
} from "@/modules/termix-fold";

/** The window side where iPhone Duo stacks the status bar and app bars, if it does. */
export type VerticalBarSide = "left" | "right";

/**
 * The narrowest safe area that counts as the bar column. The system reports its
 * preferred edge even while bars stay horizontal, and then that side has no
 * column for the tabs to sit in.
 */
export const BAR_COLUMN_MIN = 24;

/** Turns the system's leading or trailing edge into a window side. */
export function verticalBarSide(
  edge: VerticalBarInfo["edge"] | undefined,
  rtl = I18nManager.isRTL,
): VerticalBarSide | null {
  if (edge === "leading") return rtl ? "right" : "left";
  if (edge === "trailing") return rtl ? "left" : "right";
  return null;
}

/** The side of the bar column, only while the safe area actually keeps one there. */
export function barColumnSide(
  bar: Partial<VerticalBarInfo> | null,
  rtl = I18nManager.isRTL,
): VerticalBarSide | null {
  const side = verticalBarSide(bar?.edge, rtl);
  if (!side) return null;
  const inset = side === "left" ? bar?.insetLeft : bar?.insetRight;
  return (inset ?? 0) >= BAR_COLUMN_MIN ? side : null;
}

let current: VerticalBarSide | null | undefined;
const listeners = new Set<() => void>();
let native: { remove(): void } | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!native) {
    native = addVerticalBarListener((bar) => {
      const next = barColumnSide(bar);
      if (next === current) return;
      current = next;
      listeners.forEach((l) => l());
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && native) {
      native.remove();
      native = null;
      current = undefined;
    }
  };
}

function snapshot(): VerticalBarSide | null {
  if (current === undefined) current = barColumnSide(getVerticalBar());
  return current;
}

/**
 * The side where the system puts its vertical bar right now, following turns
 * and folds. Null off a Duo and wherever bars stay horizontal.
 */
export function useVerticalBarSide(): VerticalBarSide | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
