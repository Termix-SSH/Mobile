import { Platform } from "react-native";

/**
 * App shortcuts on hardware keyboards. The native terminal reports these ids
 * and keeps the keys from the shell; everything else still reaches it.
 */
export type ShortcutId =
  | "newTab"
  | "closeTab"
  | "nextTab"
  | "prevTab"
  | "find"
  | "fontBigger"
  | "fontSmaller"
  | "fontReset"
  | `tab${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

/** Shortcuts the tab handles itself; the rest go to the sessions screen. */
export const TERMINAL_SHORTCUTS = new Set<string>([
  "find",
  "fontBigger",
  "fontSmaller",
  "fontReset",
]);

/** For the help list, per platform. */
export function shortcutHelp(
  os: string = Platform.OS,
): { keys: string; label: string }[] {
  if (os === "ios") {
    return [
      { keys: "Cmd T", label: "New tab on this host" },
      { keys: "Cmd W", label: "Close tab" },
      { keys: "Cmd Shift ] | Ctrl Tab", label: "Next tab" },
      { keys: "Cmd Shift [ | Ctrl Shift Tab", label: "Previous tab" },
      { keys: "Cmd 1 to 9", label: "Go to tab" },
      { keys: "Cmd F", label: "Find" },
      { keys: "Cmd + | Cmd - | Cmd 0", label: "Font size" },
      { keys: "Cmd V", label: "Paste" },
      { keys: "Cmd .", label: "Escape" },
    ];
  }
  return [
    { keys: "Ctrl Shift T", label: "New tab on this host" },
    { keys: "Ctrl Shift W", label: "Close tab" },
    { keys: "Ctrl Tab | Ctrl PgDn", label: "Next tab" },
    { keys: "Ctrl Shift Tab | Ctrl PgUp", label: "Previous tab" },
    { keys: "Ctrl Shift 1 to 9", label: "Go to tab" },
    { keys: "Ctrl Shift F", label: "Find" },
    { keys: "Ctrl = | Ctrl - | Ctrl 0", label: "Font size" },
    { keys: "Ctrl Shift C | Ctrl Shift V", label: "Copy and paste" },
  ];
}

/** The base font size after a font shortcut, kept in the allowed range. */
export function nextFontSize(
  current: number,
  id: string,
  range: { min: number; max: number; reset: number },
): number {
  const size =
    id === "fontBigger"
      ? current + 1
      : id === "fontSmaller"
        ? current - 1
        : range.reset;
  return Math.min(range.max, Math.max(range.min, size));
}
