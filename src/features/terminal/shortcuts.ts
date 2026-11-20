import { Platform } from "react-native";
import { t } from "@/i18n";

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
      { keys: "Cmd T", label: t("terminal.shortcuts.newTabOnThisHost") },
      { keys: "Cmd W", label: t("terminal.shortcuts.closeTab") },
      {
        keys: "Cmd Shift ] | Ctrl Tab",
        label: t("terminal.shortcuts.nextTab"),
      },
      {
        keys: "Cmd Shift [ | Ctrl Shift Tab",
        label: t("terminal.shortcuts.previousTab"),
      },
      { keys: "Cmd 1 to 9", label: t("terminal.shortcuts.goToTab") },
      { keys: "Cmd F", label: t("terminal.shortcuts.find") },
      {
        keys: "Cmd + | Cmd - | Cmd 0",
        label: t("terminal.shortcuts.fontSize"),
      },
      { keys: "Cmd V", label: t("terminal.shortcuts.paste") },
      { keys: "Cmd .", label: t("terminal.shortcuts.escape") },
    ];
  }
  return [
    { keys: "Ctrl Shift T", label: t("terminal.shortcuts.newTabOnThisHost") },
    { keys: "Ctrl Shift W", label: t("terminal.shortcuts.closeTab") },
    { keys: "Ctrl Tab | Ctrl PgDn", label: t("terminal.shortcuts.nextTab") },
    {
      keys: "Ctrl Shift Tab | Ctrl PgUp",
      label: t("terminal.shortcuts.previousTab"),
    },
    { keys: "Ctrl Shift 1 to 9", label: t("terminal.shortcuts.goToTab") },
    { keys: "Ctrl Shift F", label: t("terminal.shortcuts.find") },
    {
      keys: "Ctrl = | Ctrl - | Ctrl 0",
      label: t("terminal.shortcuts.fontSize"),
    },
    {
      keys: "Ctrl Shift C | Ctrl Shift V",
      label: t("terminal.shortcuts.copyAndPaste"),
    },
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
