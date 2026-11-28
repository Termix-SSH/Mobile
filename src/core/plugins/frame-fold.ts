import type { Fold } from "@/utils/fold";
import type { FrameFold } from "./frame-protocol";

/** A web view's place in the window, as measureInWindow gives it. */
export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The window's fold in the web view's own coordinates, or null when the
 * crease does not cross the web view.
 */
export function frameFold(
  fold: Fold | null,
  rect: FrameRect | null,
): FrameFold | null {
  if (!fold || !rect || rect.width <= 0 || rect.height <= 0) return null;
  const vertical = fold.axis === "vertical";
  const offset = vertical ? rect.x : rect.y;
  const size = vertical ? rect.width : rect.height;
  const start = fold.start - offset;
  const end = fold.end - offset;
  const center = (start + end) / 2;
  if (center <= 0 || center >= size) return null;
  return {
    axis: fold.axis,
    start: Math.round(Math.max(0, start)),
    end: Math.round(Math.min(size, end)),
    active: fold.active,
  };
}

export function sameFold(a: FrameFold | null, b: FrameFold | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.axis === b.axis &&
    a.start === b.start &&
    a.end === b.end &&
    a.active === b.active
  );
}
