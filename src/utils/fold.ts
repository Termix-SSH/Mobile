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

/**
 * How long the fold has to hold still before layouts follow it. As the hinge
 * passes the point where it counts as bent, it can report bent, flat and bent
 * again within a moment, and each report would start panes moving.
 */
export const FOLD_SETTLE_MS = 150;

let current: FoldRegion[] | null = null;
const listeners = new Set<() => void>();
let native: { remove(): void } | null = null;
let settle: ReturnType<typeof setTimeout> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!native) {
    native = addFoldListener((folds) => {
      if (settle) clearTimeout(settle);
      settle = setTimeout(() => {
        settle = null;
        current = folds;
        listeners.forEach((l) => l());
      }, FOLD_SETTLE_MS);
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && native) {
      native.remove();
      native = null;
      current = null;
      if (settle) clearTimeout(settle);
      settle = null;
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

/** A part of the window, in window points. */
export type Area = { x: number; y: number; width: number; height: number };

/** The two sides of a bent fold, before it and after it. Null while the screen is flat. */
export function foldHalves(
  fold: Fold | null,
  width: number,
  height: number,
): [Area, Area] | null {
  if (!fold?.active) return null;
  if (fold.axis === "vertical") {
    return [
      { x: 0, y: 0, width: fold.start, height },
      { x: fold.end, y: 0, width: width - fold.end, height },
    ];
  }
  return [
    { x: 0, y: 0, width, height: fold.start },
    { x: 0, y: fold.end, width, height: height - fold.end },
  ];
}

/**
 * Where a sheet or alert sits. While bent it takes the right side of a book
 * fold or the bottom of a laptop fold, like Apple's own alerts, so it never
 * lies across the crease. Flat, it gets the whole window.
 */
export function panelArea(
  fold: Fold | null,
  width: number,
  height: number,
): Area {
  return foldHalves(fold, width, height)?.[1] ?? { x: 0, y: 0, width, height };
}

/** The side of a bent fold a point is on, for menus that open where they were asked for. */
export function areaAt(
  fold: Fold | null,
  point: { x: number; y: number },
  width: number,
  height: number,
): Area {
  const halves = foldHalves(fold, width, height);
  if (!halves || !fold) return { x: 0, y: 0, width, height };
  const along = fold.axis === "vertical" ? point.x : point.y;
  return along < (fold.start + fold.end) / 2 ? halves[0] : halves[1];
}
