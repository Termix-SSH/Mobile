/**
 * Power widget: wakes or shuts down one Wake-on-LAN device straight from the
 * home screen, without opening the app.
 *
 * The app publishes two things. The device list (names and last status, no
 * secrets) goes in the same shared storage as the other widgets. Each server's
 * base URL and request headers go in the Keychain (iOS) or a Keystore sealed
 * file (Android), so the widget can call the Power API itself.
 *
 * Mirrored by:
 *   - iOS      modules/termix-widgets/ios/widget/PowerWidget.swift
 *   - Android  modules/termix-widgets/android/.../PowerStore.kt
 */

import {
  clearPowerWidget,
  isWidgetSupported,
  setPowerAccessJson,
  setPowerSnapshotJson,
} from "@/modules/termix-widgets";
import { accounts, accountLabel, isServerAccount } from "@/core/accounts";
import type { AccountClient } from "@/core/api/AccountClient";
import { systemLogger } from "@/core/log/logger";
import { loadWidgetPreferences } from "./preferences";

/** Bump with the native decoders when the shape changes. */
export const POWER_SNAPSHOT_VERSION = 1;

export const POWER_PLUGIN_ID = "wake-on-lan";

export type PowerStatus =
  "unknown" | "online" | "offline" | "waking" | "stopping" | "failed";

export interface PowerDevice {
  /** `<accountId>:<hostId>`, what a placed widget remembers. */
  key: string;
  accountId: string;
  hostId: number;
  name: string;
  address: string;
  /** Server label, to tell two servers apart in the picker. */
  server: string;
  status: PowerStatus;
  canWake: boolean;
  canShutdown: boolean;
  /** The Power tab asks before a shutdown, so the widget wants a second tap. */
  confirmShutdown: boolean;
}

export interface PowerSnapshot {
  version: number;
  updatedAt: number;
  devices: PowerDevice[];
}

/** What the widget needs to reach one server. Kept out of the snapshot. */
export interface PowerAccess {
  base: string;
  headers: Record<string, string>;
}

const STATUSES: PowerStatus[] = [
  "unknown",
  "online",
  "offline",
  "waking",
  "stopping",
  "failed",
];

interface RawDevice {
  hostId?: unknown;
  name?: unknown;
  address?: unknown;
  status?: unknown;
  canWake?: unknown;
  canShutdown?: unknown;
  shutdownConfirm?: unknown;
}

/** Turns a /devices answer into widget rows. Pure, for tests. */
export function toPowerDevices(
  accountId: string,
  server: string,
  body: unknown,
): PowerDevice[] {
  const list = (body as { devices?: unknown })?.devices;
  if (!Array.isArray(list)) return [];
  const out: PowerDevice[] = [];
  for (const raw of list as RawDevice[]) {
    const hostId = Number(raw?.hostId);
    if (!Number.isInteger(hostId) || hostId <= 0) continue;
    const status = STATUSES.includes(raw.status as PowerStatus)
      ? (raw.status as PowerStatus)
      : "unknown";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const address = typeof raw.address === "string" ? raw.address : "";
    out.push({
      key: `${accountId}:${hostId}`,
      accountId,
      hostId,
      name: name || address || `Host ${hostId}`,
      address,
      server,
      status,
      canWake: raw.canWake === true,
      canShutdown: raw.canShutdown === true,
      confirmShutdown: raw.shutdownConfirm === true,
    });
  }
  return out;
}

/**
 * The widget sends plain requests, so a server that needs a pinned key or a
 * client certificate stays app only.
 */
export function widgetCanReach(client: AccountClient): boolean {
  return (
    client.isAuthenticated() &&
    client.isPluginEnabled(POWER_PLUGIN_ID) &&
    client.certPins().length === 0 &&
    !client.clientCert()
  );
}

export function powerAccessOf(client: AccountClient): PowerAccess {
  const headers = client.requestHeaders();
  delete headers["User-Agent"];
  return { base: client.rootBase(), headers };
}

let chain: Promise<void> = Promise.resolve();
let lastSnapshot = "";
/** Access last written per account, so an unchanged token isn't rewritten. */
const lastAccess = new Map<string, string>();

async function writeAccess(accountId: string, access: PowerAccess | null) {
  // "" marks an access already removed in this run of the app.
  const json = access ? JSON.stringify(access) : "";
  if (lastAccess.get(accountId) === json) return;
  await setPowerAccessJson(accountId, access ? json : null);
  lastAccess.set(accountId, json);
}

async function devicesOf(client: AccountClient): Promise<PowerDevice[]> {
  const account = accounts.find(client.accountId);
  const server = account ? accountLabel(account) : "";
  const res = await client.http.auth.get(
    `/plugin-api/${POWER_PLUGIN_ID}/devices`,
  );
  return toPowerDevices(client.accountId, server, res.data);
}

async function run(): Promise<void> {
  const prefs = await loadWidgetPreferences();
  if (!prefs.enabled) {
    await resetPowerWidget();
    return;
  }

  const devices: PowerDevice[] = [];
  const seen = new Set<string>();
  let failed = false;
  for (const account of accounts.list()) {
    if (!isServerAccount(account) || account.pending) continue;
    const client = accounts.client(account.id);
    if (!client) continue;
    seen.add(account.id);
    try {
      await client.load();
      if (!widgetCanReach(client)) {
        await writeAccess(account.id, null);
        continue;
      }
      devices.push(...(await devicesOf(client)));
      await writeAccess(account.id, powerAccessOf(client));
    } catch (error) {
      // Offline for now. Keep what the widget already has.
      failed = true;
      systemLogger.warn("[widgets] power devices failed", {
        operation: "widgets",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
  for (const id of [...lastAccess.keys()]) {
    if (!seen.has(id)) {
      await writeAccess(id, null);
      lastAccess.delete(id);
    }
  }
  if (failed) return;

  const snapshot: PowerSnapshot = {
    version: POWER_SNAPSHOT_VERSION,
    updatedAt: Date.now(),
    devices,
  };
  const comparable = JSON.stringify(snapshot.devices);
  if (comparable === lastSnapshot) return;
  await setPowerSnapshotJson(JSON.stringify(snapshot));
  lastSnapshot = comparable;
}

/** Refreshes the device list and server access. Never throws. */
export function publishPowerWidget(): Promise<void> {
  if (!isWidgetSupported) return Promise.resolve();
  chain = chain.then(run, run).catch(() => {});
  return chain;
}

/** Drops every device and saved access, on sign out or widgets off. */
export async function resetPowerWidget(): Promise<void> {
  if (!isWidgetSupported) return;
  lastSnapshot = "";
  lastAccess.clear();
  await clearPowerWidget().catch(() => {});
}
