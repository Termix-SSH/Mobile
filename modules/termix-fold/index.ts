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

interface FoldNative {
  getFolds(): FoldRegion[];
  addListener(
    eventName: "onFoldChange",
    listener: (event: { folds: FoldRegion[] }) => void,
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
