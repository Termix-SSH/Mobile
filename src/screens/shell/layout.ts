import type { WindowInfo } from "@/utils/window-class";

export const SIDEBAR_WIDTH = 84;
/** Narrowest host list that still reads well. */
export const HOSTS_PANE_MIN_WIDTH = 220;
/** Narrowest terminal worth putting beside the host list. */
export const SESSION_MIN_WIDTH = 300;
/** Each half of a phone folded like a laptop must be at least this tall. */
const LAPTOP_MIN_HALF = 220;

/** Where navigation goes and whether the host list sits beside sessions. */
export function shellLayout(
  win: Pick<
    WindowInfo,
    "windowClass" | "canSplit" | "width" | "height" | "fold"
  > &
    Partial<Pick<WindowInfo, "verticalBar">>,
  open: number,
) {
  // iPhone Duo keeps a column down one side for the status bar and app bars,
  // so the tabs go there, at any width, instead of along the bottom.
  const barSide = win.verticalBar ?? null;
  const nav =
    barSide || win.windowClass !== "compact"
      ? ("side" as const)
      : ("bottom" as const);
  const railSide = barSide ?? ("left" as const);
  const fold = win.fold;
  const railLeft = nav === "side" && railSide === "left" ? SIDEBAR_WIDTH : 0;
  // A crease from top to bottom: host list on the left half, sessions on the right.
  const foldSplit =
    fold?.axis === "vertical" &&
    fold.start - railLeft >= HOSTS_PANE_MIN_WIDTH &&
    win.width - fold.end >= SESSION_MIN_WIDTH;
  // Bent with the crease across: terminal on the top half, keys on the bottom.
  const laptop =
    fold?.axis === "horizontal" &&
    fold.active &&
    fold.start >= LAPTOP_MIN_HALF &&
    win.height - fold.end >= LAPTOP_MIN_HALF;
  return {
    nav,
    /** Which side the rail is on. */
    railSide,
    /** The rail sits inside the system's bar column, as wide as its safe area. */
    railInBar: barSide !== null,
    // A phone held sideways is wide but too short for a second pane.
    // On a fold the list stays even with nothing open, so the left half is never empty.
    hostsPane:
      foldSplit || (open > 0 && win.windowClass === "expanded" && win.canSplit),
    // Phones give open sessions the whole window, sideways too. The tabs stay
    // in a bar column though, since that space is the system's either way.
    fullScreenSessions: !win.canSplit,
    tabsInSessions: win.canSplit || barSide !== null,
    foldSplit,
    laptop,
  };
}
