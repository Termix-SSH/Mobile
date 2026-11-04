import { useSyncExternalStore } from "react";
import { I18nManager } from "react-native";
import {
  addVerticalBarListener,
  getVerticalBar,
  type VerticalBarInfo,
} from "@/modules/termix-fold";

/** The window side where iPhone Duo stacks the status bar and app bars, if it does. */
export type VerticalBarSide = "left" | "right";

/** Turns the system's leading or trailing edge into a window side. */
export function verticalBarSide(
  edge: VerticalBarInfo["edge"] | undefined,
  rtl = I18nManager.isRTL,
): VerticalBarSide | null {
  if (edge === "leading") return rtl ? "right" : "left";
  if (edge === "trailing") return rtl ? "left" : "right";
  return null;
}

let current: VerticalBarSide | null | undefined;
const listeners = new Set<() => void>();
let native: { remove(): void } | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!native) {
    native = addVerticalBarListener((bar) => {
      const next = verticalBarSide(bar.edge);
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
  if (current === undefined) current = verticalBarSide(getVerticalBar()?.edge);
  return current;
}

/**
 * The side where the system puts its vertical bar right now, following turns
 * and folds. Null off a Duo and wherever bars stay horizontal.
 */
export function useVerticalBarSide(): VerticalBarSide | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
