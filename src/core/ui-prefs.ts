import { useSyncExternalStore } from "react";
import { plainStore } from "@/core/storage/kv";

/** Device wide look settings that are not themes: text size and row density. */
export type TextSize = "small" | "default" | "large";
export type Density = "comfortable" | "compact";

export interface UiPrefs {
  textSize: TextSize;
  density: Density;
}

export const TEXT_SIZES: { id: TextSize; label: string; scale: number }[] = [
  { id: "small", label: "Small", scale: 0.9 },
  { id: "default", label: "Default", scale: 1 },
  { id: "large", label: "Large", scale: 1.15 },
];

export const DENSITIES: { id: Density; label: string }[] = [
  { id: "comfortable", label: "Comfortable" },
  { id: "compact", label: "Compact" },
];

const KEY = "ui.prefs";
const DEFAULTS: UiPrefs = { textSize: "default", density: "comfortable" };

let current: UiPrefs = DEFAULTS;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function textScale(size: TextSize): number {
  return TEXT_SIZES.find((s) => s.id === size)?.scale ?? 1;
}

export function getUiPrefs(): UiPrefs {
  return current;
}

export async function loadUiPrefs(): Promise<void> {
  const saved = await plainStore.getJson<Partial<UiPrefs>>(KEY);
  const next: UiPrefs = {
    textSize: TEXT_SIZES.some((s) => s.id === saved?.textSize)
      ? (saved!.textSize as TextSize)
      : DEFAULTS.textSize,
    density: DENSITIES.some((d) => d.id === saved?.density)
      ? (saved!.density as Density)
      : DEFAULTS.density,
  };
  current = next;
  emit();
}

export async function setUiPrefs(patch: Partial<UiPrefs>): Promise<void> {
  current = { ...current, ...patch };
  emit();
  await plainStore.setJson(KEY, current);
}

/** For tests. */
export function resetUiPrefs(): void {
  current = DEFAULTS;
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useUiPrefs(): UiPrefs {
  return useSyncExternalStore(subscribe, getUiPrefs, getUiPrefs);
}
