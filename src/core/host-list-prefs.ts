import { useSyncExternalStore } from "react";
import { plainStore } from "@/core/storage/kv";

/** What a host row shows. Same idea as the web sidebar's row details. */
export interface HostListPrefs {
  showAddress: boolean;
  showUsername: boolean;
  showPort: boolean;
  showIcon: boolean;
  showPinIcon: boolean;
  showSharedBadge: boolean;
  /** Protocol and feature chips next to the name. */
  showBadges: boolean;
  showTags: boolean;
  showMetrics: boolean;
  /** Green and red bar instead of the accent color. */
  statusColors: boolean;
}

export const HOST_LIST_FIELDS: {
  key: keyof HostListPrefs;
  label: string;
  description: string;
  dependsOnAddress?: boolean;
}[] = [
  {
    key: "showAddress",
    label: "Address",
    description: "The IP or host name under the name",
  },
  {
    key: "showUsername",
    label: "Username",
    description: "The user before the address",
    dependsOnAddress: true,
  },
  {
    key: "showPort",
    label: "Port",
    description: "The port after the address",
    dependsOnAddress: true,
  },
  {
    key: "showIcon",
    label: "Host icon",
    description: "The icon set on the host",
  },
  { key: "showPinIcon", label: "Pin icon", description: "Marks pinned hosts" },
  {
    key: "showSharedBadge",
    label: "Shared badge",
    description: "Marks hosts shared with you",
  },
  {
    key: "showBadges",
    label: "Protocol badges",
    description: "SSH, RDP, Docker and other chips",
  },
  { key: "showTags", label: "Tags", description: "The host's tags" },
  {
    key: "showMetrics",
    label: "CPU and RAM",
    description: "Live usage bars on online hosts",
  },
  {
    key: "statusColors",
    label: "Status colors",
    description: "Green bar when online, red when offline",
  },
];

const KEY = "hosts.listPrefs";
export const DEFAULT_HOST_LIST_PREFS: HostListPrefs = {
  showAddress: true,
  showUsername: true,
  showPort: true,
  showIcon: true,
  showPinIcon: true,
  showSharedBadge: true,
  showBadges: true,
  showTags: true,
  showMetrics: true,
  statusColors: false,
};

let current: HostListPrefs = DEFAULT_HOST_LIST_PREFS;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function getHostListPrefs(): HostListPrefs {
  return current;
}

export async function loadHostListPrefs(): Promise<void> {
  const saved = await plainStore.getJson<Record<string, unknown>>(KEY);
  const next = { ...DEFAULT_HOST_LIST_PREFS };
  for (const key of Object.keys(next) as (keyof HostListPrefs)[]) {
    if (typeof saved?.[key] === "boolean") next[key] = saved[key] as boolean;
  }
  current = next;
  emit();
}

export async function setHostListPrefs(
  patch: Partial<HostListPrefs>,
): Promise<void> {
  current = { ...current, ...patch };
  emit();
  await plainStore.setJson(KEY, current);
}

/** For tests. */
export function resetHostListPrefs(): void {
  current = DEFAULT_HOST_LIST_PREFS;
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useHostListPrefs(): HostListPrefs {
  return useSyncExternalStore(subscribe, getHostListPrefs, getHostListPrefs);
}
