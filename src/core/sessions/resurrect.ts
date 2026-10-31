import type { ConnectionOrigin, TransportKind } from "@/core/transport";
import { plainStore, type JsonKV } from "@/core/storage/kv";
import type { SSHHost } from "@/types";

const KEY = "sessions.openTabs";
const VERSION = 1;

/**
 * An open tab as saved for the next launch. No secrets: the host is looked
 * up again by id from its account's store.
 */
export interface SavedTab {
  id: string;
  type: string;
  accountId: string;
  /** The host id in the account's own store. */
  hostId: number;
  /** The tab used the server's copy of the host (server only features). */
  serverHost: boolean;
  title: string;
  instanceId: string;
  backendSessionId: string | null;
  remoteProtocol?: string;
  origin?: ConnectionOrigin;
  transport?: TransportKind;
  listed?: boolean;
  customTitle?: string | null;
  resumeData?: Record<string, string> | null;
  active: boolean;
  createdAt: number;
}

/** The part of an open tab that gets saved. */
export interface TabLike {
  id: string;
  type: string;
  accountId: string;
  host: SSHHost & { localId?: number };
  title: string;
  isActive: boolean;
  createdAt: Date;
  instanceId: string;
  backendSessionId?: string | null;
  remoteProtocol?: string;
  origin?: ConnectionOrigin;
  transport?: TransportKind;
  listed?: boolean;
  customTitle?: string | null;
  resumeData?: Record<string, string> | null;
}

export function toSavedTab(tab: TabLike): SavedTab {
  const localId = tab.host.localId;
  return {
    id: tab.id,
    type: tab.type,
    accountId: tab.accountId,
    hostId: typeof localId === "number" ? localId : tab.host.id,
    serverHost: typeof localId === "number",
    title: tab.title,
    instanceId: tab.instanceId,
    backendSessionId: tab.backendSessionId ?? null,
    remoteProtocol: tab.remoteProtocol,
    origin: tab.origin,
    transport: tab.transport,
    listed: tab.listed,
    customTitle: tab.customTitle ?? null,
    resumeData: tab.resumeData ?? null,
    active: tab.isActive,
    createdAt: tab.createdAt.getTime(),
  };
}

function isSavedTab(v: unknown): v is SavedTab {
  const t = v as SavedTab;
  return (
    !!t &&
    typeof t.id === "string" &&
    typeof t.type === "string" &&
    typeof t.accountId === "string" &&
    typeof t.hostId === "number" &&
    typeof t.instanceId === "string"
  );
}

export async function loadSavedTabs(
  store: JsonKV = plainStore,
): Promise<SavedTab[]> {
  const raw = await store
    .getJson<{ v: number; tabs: unknown[] }>(KEY)
    .catch(() => null);
  if (!raw || raw.v !== VERSION || !Array.isArray(raw.tabs)) return [];
  return raw.tabs.filter(isSavedTab);
}

export async function saveTabs(
  tabs: SavedTab[],
  store: JsonKV = plainStore,
): Promise<void> {
  if (!tabs.length) {
    await store.remove(KEY).catch(() => {});
    return;
  }
  await store.setJson(KEY, { v: VERSION, tabs }).catch(() => {});
}

export interface RestoreResult {
  restored: { saved: SavedTab; host: SSHHost }[];
  /** Hosts that are gone, so their tabs were dropped. */
  missing: SavedTab[];
  /** Could not look these up yet (signed out, offline); try again later. */
  later: SavedTab[];
}

/**
 * Finds each saved tab's host again. `findHost` resolves null when the host
 * is gone for sure, and throws when it can't tell yet.
 */
export async function restoreTabs(
  saved: SavedTab[],
  deps: {
    accountExists: (id: string) => boolean;
    findHost: (tab: SavedTab) => Promise<SSHHost | null>;
  },
): Promise<RestoreResult> {
  const result: RestoreResult = { restored: [], missing: [], later: [] };
  for (const tab of saved) {
    if (!deps.accountExists(tab.accountId)) {
      result.missing.push(tab);
      continue;
    }
    try {
      const host = await deps.findHost(tab);
      if (host) result.restored.push({ saved: tab, host });
      else result.missing.push(tab);
    } catch {
      result.later.push(tab);
    }
  }
  return result;
}
