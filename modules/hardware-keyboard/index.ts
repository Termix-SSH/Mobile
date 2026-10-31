import { requireOptionalNativeModule } from "expo-modules-core";
import type { EventSubscription } from "expo-modules-core";

interface KeyCommandEvent {
  input: string;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

export interface AppShortcutDef {
  id: string;
  input: string;
  modifiers: ("cmd" | "shift" | "alt" | "ctrl")[];
  title: string;
}

interface HardwareKeyboardModule {
  addListener(
    eventName: "onKeyCommand",
    listener: (event: KeyCommandEvent) => void,
  ): EventSubscription;
  addListener(
    eventName: "onAppShortcut",
    listener: (event: { id: string }) => void,
  ): EventSubscription;
  setAppShortcuts?(items: AppShortcutDef[]): void;
  setEnabled?(enabled: boolean): void;
}

const HardwareKeyboard =
  requireOptionalNativeModule<HardwareKeyboardModule>("HardwareKeyboard");

export function addKeyCommandListener(
  listener: (event: KeyCommandEvent) => void,
): EventSubscription | null {
  if (!HardwareKeyboard) return null;
  return HardwareKeyboard.addListener("onKeyCommand", listener);
}

/**
 * Takes Tab, arrows and Ctrl keys from the whole app for the xterm fallback.
 * The native terminal reads the keyboard itself, so it stays off there.
 */
export function setHardwareKeyboardEnabled(enabled: boolean): void {
  HardwareKeyboard?.setEnabled?.(enabled);
}

/** Registers app wide shortcuts. iPadOS lists them when Cmd is held. */
export function setAppShortcuts(items: AppShortcutDef[]): void {
  HardwareKeyboard?.setAppShortcuts?.(items);
}

export function addAppShortcutListener(
  listener: (id: string) => void,
): EventSubscription | null {
  if (!HardwareKeyboard) return null;
  return HardwareKeyboard.addListener("onAppShortcut", (e) => listener(e.id));
}
