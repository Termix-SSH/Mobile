import type { KeySize } from "./KeyPrefsContext";

/** One size down in a short window, like a phone held sideways. */
export function compactKeySize(size: KeySize, isShort: boolean): KeySize {
  if (!isShort) return size;
  if (size === "large") return "medium";
  return "small";
}

/** Height of the key row, tighter in a short window. */
export function keyBarHeight(isLandscape: boolean, isShort: boolean): number {
  if (isShort) return 40;
  return isLandscape ? 48 : 52;
}
