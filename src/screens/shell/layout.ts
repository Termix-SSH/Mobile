import type { WindowInfo } from "@/utils/window-class";

/** Where navigation goes and whether the host list sits beside sessions. */
export function shellLayout(
  win: Pick<WindowInfo, "windowClass" | "canSplit">,
  open: number,
) {
  return {
    nav:
      win.windowClass === "compact" ? ("bottom" as const) : ("side" as const),
    // A phone held sideways is wide but too short for a second pane.
    hostsPane: win.windowClass === "expanded" && win.canSplit && open > 0,
    // Phones give open sessions the whole window, sideways too.
    fullScreenSessions: !win.canSplit,
  };
}
