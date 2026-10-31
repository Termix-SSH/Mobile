import { useSyncExternalStore } from "react";
import { plainStore } from "@/core/storage/kv";
import type { SortBy } from "./utils/fileUtils";

/** Phone settings for the file manager. Defaults follow Plugin-File-Manager. */
export interface FileSettings {
  confirmBeforeTrash: boolean;
  /** Transfers at once, 1 to 4. */
  transferConcurrency: number;
  showHidden: boolean;
  sortBy: SortBy;
  sortOrder: "asc" | "desc";
  editorFontSize: number;
  editorWrap: boolean;
  /** Open the files panel with new terminals on a tablet. */
  companionAutoOpen: boolean;
  companionSide: "left" | "right";
  /** Panel width on a tablet, in points. */
  companionSize: number;
  companionFollowTerminal: boolean;
  /** Seconds between folder checks while following. */
  companionSyncInterval: number;
  companionHistorySize: number;
}

export const DEFAULT_FILE_SETTINGS: FileSettings = {
  confirmBeforeTrash: true,
  transferConcurrency: 2,
  showHidden: true,
  sortBy: "name",
  sortOrder: "asc",
  editorFontSize: 13,
  editorWrap: false,
  companionAutoOpen: false,
  companionSide: "right",
  companionSize: 380,
  companionFollowTerminal: true,
  companionSyncInterval: 3,
  companionHistorySize: 20,
};

const KEY = "files.settings";

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
  const v = Number(n);
  return Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.round(v)))
    : fallback;
};

/** Fills in defaults and keeps numbers in range, so old or odd values are safe. */
export function normalizeFileSettings(raw: unknown): FileSettings {
  const d = DEFAULT_FILE_SETTINGS;
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<
    Record<keyof FileSettings, unknown>
  >;
  const bool = (key: keyof FileSettings) =>
    typeof r[key] === "boolean" ? (r[key] as boolean) : (d[key] as boolean);
  return {
    confirmBeforeTrash: bool("confirmBeforeTrash"),
    transferConcurrency: clamp(
      r.transferConcurrency,
      1,
      4,
      d.transferConcurrency,
    ),
    showHidden: bool("showHidden"),
    sortBy: ["name", "size", "modified"].includes(r.sortBy as string)
      ? (r.sortBy as SortBy)
      : d.sortBy,
    sortOrder: r.sortOrder === "desc" ? "desc" : "asc",
    editorFontSize: clamp(r.editorFontSize, 8, 32, d.editorFontSize),
    editorWrap: bool("editorWrap"),
    companionAutoOpen: bool("companionAutoOpen"),
    companionSide: r.companionSide === "left" ? "left" : "right",
    companionSize: clamp(r.companionSize, 240, 900, d.companionSize),
    companionFollowTerminal: bool("companionFollowTerminal"),
    companionSyncInterval: clamp(
      r.companionSyncInterval,
      1,
      30,
      d.companionSyncInterval,
    ),
    companionHistorySize: clamp(
      r.companionHistorySize,
      5,
      100,
      d.companionHistorySize,
    ),
  };
}

let current = DEFAULT_FILE_SETTINGS;
let loaded = false;
const listeners = new Set<() => void>();

async function load() {
  if (loaded) return;
  loaded = true;
  current = normalizeFileSettings(await plainStore.getJson(KEY));
  listeners.forEach((l) => l());
}

export function getFileSettings(): FileSettings {
  void load();
  return current;
}

export async function updateFileSettings(patch: Partial<FileSettings>) {
  await load();
  current = normalizeFileSettings({ ...current, ...patch });
  listeners.forEach((l) => l());
  await plainStore.setJson(KEY, current);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void load();
  return () => listeners.delete(listener);
}

export function useFileSettings(): FileSettings {
  return useSyncExternalStore(subscribe, getFileSettings, getFileSettings);
}

/** Test helper: forget what was loaded. */
export function resetFileSettingsForTests() {
  current = DEFAULT_FILE_SETTINGS;
  loaded = false;
}
