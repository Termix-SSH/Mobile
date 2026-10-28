import { windowInfo } from "@/utils/window-class";

const MIN_RATIO = 0.3;
const MAX_RATIO = 0.7;

export function canSplit(width: number, height: number): boolean {
  return windowInfo(width, height).canSplit;
}

/** The tab shown beside the active one, or null when it is gone or the same. */
export function splitPartner(
  ids: string[],
  activeId: string | null,
  splitWith: string | null,
): string | null {
  if (!splitWith || !activeId || splitWith === activeId) return null;
  return ids.includes(splitWith) && ids.includes(activeId) ? splitWith : null;
}

/** Split partner after a tab becomes active: tapping the partner swaps the two. */
export function partnerAfterActivate(
  activeId: string | null,
  splitWith: string | null,
  nextId: string,
): string | null {
  if (!splitWith) return null;
  if (nextId === splitWith) return activeId;
  return splitWith;
}

export function clampRatio(ratio: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

/** Narrowest tab worth putting on one side of a fold. */
export const SPLIT_MIN_PANE = 240;

/**
 * Where the left tab ends and the right one starts. A fold across the stage
 * (in stage coordinates) wins over the dragged ratio, so no tab sits on the crease.
 */
export function splitEdges(
  stageWidth: number,
  ratio: number,
  fold: { start: number; end: number } | null,
): { start: number; end: number; onFold: boolean } {
  if (
    fold &&
    fold.start >= SPLIT_MIN_PANE &&
    stageWidth - fold.end >= SPLIT_MIN_PANE
  ) {
    return { start: fold.start, end: fold.end, onFold: true };
  }
  const left = Math.round(stageWidth * ratio);
  return { start: left - 3, end: left + 3, onFold: false };
}
