import { useEffect } from "react";
import { Platform } from "react-native";
import {
  addAppShortcutListener,
  setAppShortcuts,
} from "@/modules/hardware-keyboard";
import { palette } from "@/screens/palette/store";
import {
  nativeShortcuts,
  shortcutSheet,
  SHORTCUT_ROUTES,
  type AppShortcutId,
} from "./index";
import { openTab } from "@/screens/shell/navigate";

/** Runs an app shortcut. Returns false for ids it does not know. */
export function runShortcut(
  id: string,
  navigate: (href: string) => void,
): boolean {
  if (id === "palette") palette.open();
  else if (id === "shortcuts") shortcutSheet.open();
  else {
    const href = SHORTCUT_ROUTES[id as AppShortcutId];
    if (!href) return false;
    navigate(href);
  }
  return true;
}

/** Hooks the hardware keyboard shortcuts up to the app. Mount once at the root. */
export function useAppShortcuts() {
  useEffect(() => {
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;
    setAppShortcuts(nativeShortcuts());
    const sub = addAppShortcutListener((id) => {
      runShortcut(id, openTab);
    });
    return () => sub?.remove();
  }, []);
}
