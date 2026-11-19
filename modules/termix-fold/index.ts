import { requireOptionalNativeModule } from "expo-modules-core";
import type { EventSubscription } from "expo-modules-core";

/** A fold in window points. Inactive means the screen is flat there. */
export interface FoldRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
}

/**
 * Where iPhone Duo stacks the status bar and app bars down one side, in window
 * points. The edge is leading or trailing, or none when bars stay horizontal.
 */
export interface VerticalBarInfo {
  edge: "leading" | "trailing" | "none";
  statusX: number;
  statusY: number;
  statusWidth: number;
  statusHeight: number;
  insetLeft: number;
  insetRight: number;
  insetTop: number;
  insetBottom: number;
}

interface FoldNative {
  getFolds(): FoldRegion[];
  getVerticalBar?(): Partial<VerticalBarInfo>;
  addListener(
    eventName: "onFoldChange",
    listener: (event: { folds: FoldRegion[] }) => void,
  ): EventSubscription;
  addListener(
    eventName: "onVerticalBarChange",
    listener: (event: Partial<VerticalBarInfo>) => void,
  ): EventSubscription;
}

const Fold = requireOptionalNativeModule<FoldNative>("TermixFold");

/** Folds right now. Empty on screens that don't fold. */
export function getFolds(): FoldRegion[] {
  return Fold?.getFolds() ?? [];
}

export function addFoldListener(
  listener: (folds: FoldRegion[]) => void,
): EventSubscription | null {
  if (!Fold) return null;
  return Fold.addListener("onFoldChange", (e) => listener(e.folds ?? []));
}

/** The vertical bar right now, or null where the native side doesn't report one. */
export function getVerticalBar(): Partial<VerticalBarInfo> | null {
  return Fold?.getVerticalBar?.() ?? null;
}

export function addVerticalBarListener(
  listener: (bar: Partial<VerticalBarInfo>) => void,
): EventSubscription | null {
  if (!Fold) return null;
  return Fold.addListener("onVerticalBarChange", listener);
}
