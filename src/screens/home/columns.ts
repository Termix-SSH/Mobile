import { I18nManager } from "react-native";
import type { Fold } from "@/utils/fold";

/** Space between the two card columns on a flat screen. */
export const COLUMN_GAP = 12;
/** Narrowest card column worth putting on one side of a fold. */
export const FOLD_COLUMN_MIN = 200;

/** Where the card row sits in the window, in window points. */
export type Row = { x: number; width: number };

export type HomeColumns = {
  /** Cards go in two columns. */
  two: boolean;
  /**
   * Bent like a book across the row: the first column ends at the crease and
   * the second starts past it, so no card lies on it. `first` is the first
   * column's width, `gap` the crease's. Null when the columns just share the
   * row evenly.
   */
  fold: { first: number; gap: number } | null;
};

/**
 * How Home lays its cards out. A fold bent like a book gives each half its
 * own column, even on a phone too small for two columns flat.
 */
export function homeColumns(
  canSplit: boolean,
  row: Row | null,
  fold: Fold | null,
  /** Right to left, the first column is the one on the right. */
  rtl: boolean = I18nManager.isRTL,
): HomeColumns {
  if (row && fold?.axis === "vertical" && fold.active) {
    const start = fold.start - row.x;
    const end = fold.end - row.x;
    if (start >= FOLD_COLUMN_MIN && row.width - end >= FOLD_COLUMN_MIN) {
      const first = rtl ? row.width - end : start;
      return { two: true, fold: { first, gap: end - start } };
    }
  }
  return { two: canSplit, fold: null };
}
