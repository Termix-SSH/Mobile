import { PermissionsAndroid, Platform } from "react-native";
import Constants from "expo-constants";
import { accounts } from "@/core/accounts";
import { isServerAccount } from "@/core/accounts/types";
import type { AccountClient } from "@/core/api/AccountClient";
import { createLogger } from "@/core/log/logger";
import { deviceId, deviceName } from "@/core/sync/device";
import { notificationsModule, pushMode } from "./native";
import {
  dropPushPref,
  getPushPref,
  savePushPref,
  type PushPref,
} from "./prefs";

const log = createLogger("push");

/** What Settings shows for one server. */
export type PushState =
  "on" | "off" | "unavailable" | "outdated" | "denied" | "error";

/** The sync device id, so a server lists this phone once everywhere. */
export const installId = () => deviceId();

/** Asks for notification permission. True when granted. */
export async function askPermission(): Promise<boolean> {
  const mod = notificationsModule();
  if (mod) {
    const current = await mod.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await mod.requestPermissionsAsync()).granted;
  }
  if (Platform.OS === "android" && Number(Platform.Version) >= 33) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
  return pushMode() !== "none";
}

async function pushToken(): Promise<string | null> {
  const mod = notificationsModule();
  if (!mod) return null;
  const projectId = (
    Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
  )?.eas?.projectId;
  const token = await mod.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  return token.data;
}

/** The client for a server that can take phones, else null. */
async function alertsClient(accountId: string): Promise<AccountClient | null> {
  const client = accounts.client(accountId);
  if (!client) return null;
  await client.load().catch(() => {});
  if (!client.isAuthenticated() || client.apiGeneration !== "plugin") {
    return null;
  }
  return client.api.alerts.available() ? client : null;
}

/** Brings one server in line with this phone's setting for it. */
export async function syncPushAccount(accountId: string): Promise<PushState> {
  const pref = await getPushPref(accountId);
  const mode = pushMode();
  if (mode === "none") return "unavailable";
  const client = await alertsClient(accountId);
  if (!client) return pref.enabled ? "unavailable" : "off";
  const api = client.api.alerts;
  const id = await installId();
  try {
    if (mode === "poll") return pref.enabled ? "on" : "off";

    if (!pref.enabled) {
      if (pref.registered) {
        await api.removeDevice(id);
        await savePushPref(accountId, { registered: false });
      }
      return "off";
    }

    // Removed on the web: take that as turned off here too.
    if (pref.registered) {
      const linked = await api.devices();
      if (linked && !linked.some((d) => d.installId === id)) {
        await savePushPref(accountId, { enabled: false, registered: false });
        return "off";
      }
    }

    const mod = notificationsModule();
    if (!(await mod?.getPermissionsAsync())?.granted) return "denied";
    const token = await pushToken();
    if (!token) return "error";
    const result = await api.putDevice(id, {
      token,
      platform: Platform.OS === "ios" ? "ios" : "android",
      name: deviceName().slice(0, 100),
      accountKey: accountId,
      enabled: true,
      minSeverity: pref.minSeverity,
    });
    if (result === "outdated") return "outdated";
    if (!pref.registered) await savePushPref(accountId, { registered: true });
    return "on";
  } catch (error) {
    log.warn("Push sync failed", {
      operation: "push_sync",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return "error";
  }
}

/** Every linked server, on start and when the push token changes. */
export async function syncPushAll(): Promise<void> {
  for (const account of accounts.list().filter(isServerAccount)) {
    await syncPushAccount(account.id);
  }
}

/** Changes the setting for one server and tells it. */
export async function setPushPref(
  accountId: string,
  patch: Partial<Pick<PushPref, "enabled" | "minSeverity">>,
): Promise<PushState> {
  if (patch.enabled && !(await askPermission())) return "denied";
  await savePushPref(accountId, patch);
  return syncPushAccount(accountId);
}

/** Before signing out or unlinking: the server stops pushing to this phone. */
export async function forgetPushAccount(accountId: string): Promise<void> {
  const pref = await getPushPref(accountId);
  if (pref.registered) {
    try {
      const client = accounts.client(accountId);
      if (client?.isAuthenticated()) {
        await client.api.alerts.removeDevice(await installId());
      }
    } catch {
      // The server may be gone; the push service drops the token in time.
    }
  }
  await dropPushPref(accountId);
}
