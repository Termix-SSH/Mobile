import { currentWindowSize, windowInfo } from "@/utils/window-class";

/**
 * What plugins are told they run on: "tablet" when the window has room for
 * two panes (the same canSplit rule native screens use), else "phone".
 */
export function frameDevice(
  size: { width: number; height: number } = currentWindowSize(),
): "phone" | "tablet" {
  return windowInfo(size.width, size.height).canSplit ? "tablet" : "phone";
}
