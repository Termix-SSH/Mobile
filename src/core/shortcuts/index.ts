import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import type { AppShortcutDef } from "@/modules/hardware-keyboard";
import { shortcutHelp } from "@/features/terminal/shortcuts";

export type AppShortcutId =
  | "palette"
  | "shortcuts"
  | "newHost"
  | "goHome"
  | "goHosts"
  | "goSessions"
  | "goTools"
  | "goSettings";

type Combo = {
  input: string;
  modifiers: AppShortcutDef["modifiers"];
  /** Shown in the shortcut sheet. */
  keys: string;
};

type Def = {
  id: AppShortcutId;
  label: string;
  section: "Go to" | "App";
  ios: Combo;
  android: Combo;
};

const cmd = (input: string, keys: string): Combo => ({
  input,
  modifiers: ["cmd"],
  keys,
});
const cmdOpt = (input: string, keys: string): Combo => ({
  input,
  modifiers: ["cmd", "alt"],
  keys,
});
const ctrlShift = (input: string, keys: string): Combo => ({
  input,
  modifiers: ["ctrl", "shift"],
  keys,
});
const ctrlAlt = (input: string, keys: string): Combo => ({
  input,
  modifiers: ["ctrl", "alt"],
  keys,
});

// Android keeps off the keys the terminal sends to the shell, so every
// combo there has Shift or Alt next to Ctrl.
export const APP_SHORTCUTS: Def[] = [
  {
    id: "palette",
    label: "Search and commands",
    section: "App",
    ios: cmd("k", "Cmd K"),
    android: ctrlShift("k", "Ctrl Shift K"),
  },
  {
    id: "newHost",
    label: "Add host",
    section: "App",
    ios: cmd("n", "Cmd N"),
    android: ctrlShift("n", "Ctrl Shift N"),
  },
  {
    id: "shortcuts",
    label: "Keyboard shortcuts",
    section: "App",
    ios: cmd("/", "Cmd /"),
    android: ctrlShift("/", "Ctrl Shift /"),
  },
  {
    id: "goHome",
    label: "Home",
    section: "Go to",
    ios: cmdOpt("1", "Cmd Opt 1"),
    android: ctrlAlt("1", "Ctrl Alt 1"),
  },
  {
    id: "goHosts",
    label: "Hosts",
    section: "Go to",
    ios: cmdOpt("2", "Cmd Opt 2"),
    android: ctrlAlt("2", "Ctrl Alt 2"),
  },
  {
    id: "goSessions",
    label: "Sessions",
    section: "Go to",
    ios: cmdOpt("3", "Cmd Opt 3"),
    android: ctrlAlt("3", "Ctrl Alt 3"),
  },
  {
    id: "goTools",
    label: "Tools",
    section: "Go to",
    ios: cmdOpt("4", "Cmd Opt 4"),
    android: ctrlAlt("4", "Ctrl Alt 4"),
  },
  {
    id: "goSettings",
    label: "Settings",
    section: "Go to",
    ios: cmd(",", "Cmd ,"),
    android: ctrlShift(",", "Ctrl Shift ,"),
  },
];

/** The combo for a platform, or null where app shortcuts are not captured. */
export function comboFor(def: Def, os: string): Combo | null {
  if (os === "ios") return def.ios;
  if (os === "android") return def.android;
  return null;
}

/** The route each shortcut opens. */
export const SHORTCUT_ROUTES: Partial<Record<AppShortcutId, string>> = {
  goHome: "/(tabs)/home",
  goHosts: "/(tabs)/hosts",
  goSessions: "/(tabs)/sessions",
  goTools: "/(tabs)/tools",
  goSettings: "/(tabs)/settings",
  newHost: "/(tabs)/hosts?action=new",
};

/** What the native side registers. */
export function nativeShortcuts(os: string = Platform.OS): AppShortcutDef[] {
  return APP_SHORTCUTS.flatMap((s) => {
    const combo = comboFor(s, os);
    return combo
      ? [
          {
            id: s.id,
            input: combo.input,
            modifiers: combo.modifiers,
            title: s.label,
          },
        ]
      : [];
  });
}

export type ShortcutSection = {
  title: string;
  rows: { keys: string; label: string }[];
};

/** Everything the sheet lists for a platform. */
export function shortcutSections(os: string = Platform.OS): ShortcutSection[] {
  const sections: ShortcutSection[] = [];
  for (const title of ["App", "Go to"] as const) {
    const rows = APP_SHORTCUTS.filter((s) => s.section === title).flatMap(
      (s) => {
        const combo = comboFor(s, os);
        return combo ? [{ keys: combo.keys, label: s.label }] : [];
      },
    );
    if (rows.length > 0) sections.push({ title, rows });
  }
  sections.push({ title: "Terminal", rows: shortcutHelp(os) });
  return sections;
}

let open = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (open === next) return;
  open = next;
  listeners.forEach((l) => l());
}

export const shortcutSheet = {
  open: () => set(true),
  close: () => set(false),
  isOpen: () => open,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useShortcutSheetOpen(): boolean {
  return useSyncExternalStore(
    shortcutSheet.subscribe,
    shortcutSheet.isOpen,
    shortcutSheet.isOpen,
  );
}
