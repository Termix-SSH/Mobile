import { useSyncExternalStore } from "react";
import { plainStore } from "@/core/storage/kv";
import { t } from "@/i18n";

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
    label: t("core.hostListPrefs.address"),
    description: t("core.hostListPrefs.theIpOrHostName"),
  },
  {
    key: "showUsername",
    label: t("core.hostListPrefs.username"),
    description: t("core.hostListPrefs.theUserBeforeTheAddress"),
    dependsOnAddress: true,
  },
  {
    key: "showPort",
    label: t("core.hostListPrefs.port"),
    description: t("core.hostListPrefs.thePortAfterTheAddress"),
    dependsOnAddress: true,
  },
  {
    key: "showIcon",
    label: t("core.hostListPrefs.hostIcon"),
    description: t("core.hostListPrefs.theIconSetOnThe"),
  },
  {
    key: "showPinIcon",
    label: t("core.hostListPrefs.pinIcon"),
    description: t("core.hostListPrefs.marksPinnedHosts"),
  },
  {
    key: "showSharedBadge",
    label: t("core.hostListPrefs.sharedBadge"),
    description: t("core.hostListPrefs.marksHostsSharedWithYou"),
  },
  {
    key: "showBadges",
    label: t("core.hostListPrefs.protocolBadges"),
    description: t("core.hostListPrefs.sshRdpDockerAndOther"),
  },
  {
    key: "showTags",
    label: t("core.hostListPrefs.tags"),
    description: t("core.hostListPrefs.theHostSTags"),
  },
  {
    key: "showMetrics",
    label: t("core.hostListPrefs.cpuAndRam"),
    description: t("core.hostListPrefs.liveUsageBarsOnOnline"),
  },
  {
    key: "statusColors",
    label: t("core.hostListPrefs.statusColors"),
    description: t("core.hostListPrefs.greenBarWhenOnlineRed"),
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
