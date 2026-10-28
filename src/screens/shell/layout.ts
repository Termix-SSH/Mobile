import type { WindowInfo } from "@/utils/window-class";

export const SIDEBAR_WIDTH = 84;
/** Narrowest host list that still reads well. */
export const HOSTS_PANE_MIN_WIDTH = 220;
/** Narrowest terminal worth putting beside the host list. */
const SESSION_MIN_WIDTH = 300;
/** Each half of a phone folded like a laptop must be at least this tall. */
const LAPTOP_MIN_HALF = 220;

/** Where navigation goes and whether the host list sits beside sessions. */
export function shellLayout(
  win: Pick<
    WindowInfo,
    "windowClass" | "canSplit" | "width" | "height" | "fold"
  >,
  open: number,
) {
  const nav =
    win.windowClass === "compact" ? ("bottom" as const) : ("side" as const);
  const fold = win.fold;
  // A crease from top to bottom: host list on the left half, sessions on the right.
  const foldSplit =
    fold?.axis === "vertical" &&
    fold.start - (nav === "side" ? SIDEBAR_WIDTH : 0) >= HOSTS_PANE_MIN_WIDTH &&
    win.width - fold.end >= SESSION_MIN_WIDTH;
  // Bent with the crease across: terminal on the top half, keys on the bottom.
  const laptop =
    fold?.axis === "horizontal" &&
    fold.active &&
    fold.start >= LAPTOP_MIN_HALF &&
    win.height - fold.end >= LAPTOP_MIN_HALF;
  return {
    nav,
    // A phone held sideways is wide but too short for a second pane.
    hostsPane:
      open > 0 &&
      (foldSplit || (win.windowClass === "expanded" && win.canSplit)),
    // Phones give open sessions the whole window, sideways too.
    fullScreenSessions: !win.canSplit,
    foldSplit,
    laptop,
  };
}
