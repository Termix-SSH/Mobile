import { useSyncExternalStore } from "react";
import {
  addFoldListener,
  getFolds,
  type FoldRegion,
} from "@/modules/termix-fold";

/** Space kept clear around a fold, so nothing sits on the crease. */
export const FOLD_GUTTER = 24;

export type Fold = {
  /** vertical: the crease runs top to bottom and splits left from right. */
  axis: "vertical" | "horizontal";
  /** Window position where the clear area starts and ends, along the split axis. */
  start: number;
  end: number;
  /** Bent right now. A flat fold still holds its place in the layout. */
  active: boolean;
};

/** The fold that splits this window in two, if any. */
export function foldFrom(
  regions: FoldRegion[],
  width: number,
  height: number,
): Fold | null {
  for (const r of regions) {
    const vertical = r.height >= r.width;
    // Only a fold across the whole window splits it.
    const length = vertical ? r.height : r.width;
    if (length < (vertical ? height : width) * 0.9) continue;
    const size = vertical ? width : height;
    const from = vertical ? r.x : r.y;
    const thick = vertical ? r.width : r.height;
    const center = from + thick / 2;
    if (center <= 0 || center >= size) continue;
    return {
      axis: vertical ? "vertical" : "horizontal",
      start: Math.max(0, Math.min(from, center - FOLD_GUTTER / 2)),
      end: Math.min(size, Math.max(from + thick, center + FOLD_GUTTER / 2)),
      active: r.active,
    };
  }
  return null;
}

let current: FoldRegion[] | null = null;
const listeners = new Set<() => void>();
let native: { remove(): void } | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!native) {
    native = addFoldListener((folds) => {
      current = folds;
      listeners.forEach((l) => l());
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && native) {
      native.remove();
      native = null;
      current = null;
    }
  };
}

function snapshot(): FoldRegion[] {
  if (current === null) current = getFolds();
  return current;
}

/** Folds on this screen, following the phone as it opens and closes. */
export function useFoldRegions(): FoldRegion[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
