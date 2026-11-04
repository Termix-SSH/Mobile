/** The keys panel never shrinks below this to make room for the tab bar. */
export const LAPTOP_KEYS_MIN = 140;

/**
 * Distances from the bottom of the sessions screen to each side of a laptop
 * fold's crease: `above` reaches its top edge, `below` its bottom edge.
 */
export type LaptopFold = { above: number; below: number };

/**
 * Height of the keys panel on the bottom half of a laptop fold. It leaves room
 * for its own tab row and, when the half is tall enough, the session tab bar
 * too, so the terminal gets the whole top half.
 */
export function laptopKeysHeight(
  laptop: LaptopFold,
  keysBar: number,
  tabBar: number,
): number {
  const withTabs = laptop.below - keysBar - tabBar;
  if (withTabs >= LAPTOP_KEYS_MIN) return withTabs;
  return Math.max(LAPTOP_KEYS_MIN, laptop.below - keysBar);
}

/**
 * Where the session tab bar sits, and how much room the stage leaves under the
 * terminal, both from the bottom of the screen. `keysTop` is the top of the
 * keyboard or keys and their bars. On a laptop fold the tab bar goes on the
 * bottom half, just above the keys, when it fits there under the crease.
 * Otherwise it sits above the keys, and above the crease too.
 */
export function sessionBarPlacement(
  keysTop: number,
  tabBar: number,
  laptop: LaptopFold | null,
): { bottom: number; margin: number } {
  if (laptop && keysTop + tabBar <= laptop.below) {
    return { bottom: keysTop, margin: laptop.above };
  }
  const bottom = Math.max(keysTop, laptop?.above ?? 0);
  return { bottom, margin: bottom + tabBar };
}
