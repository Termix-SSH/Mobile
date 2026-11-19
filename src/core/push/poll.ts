import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { accounts } from "@/core/accounts";
import { isServerAccount } from "@/core/accounts/types";
import { createLogger } from "@/core/log/logger";
import { showAlertNotification } from "@/modules/termix-session-service";
import { t } from "@/i18n";
import { alertLink } from "./links";
import { pushMode } from "./native";
import { getPushPref, meetsSeverity, savePushPref } from "./prefs";

const log = createLogger("push");

export const ALERT_CHECK_TASK = "termix-alert-check";
const INTERVAL_MINUTES = 15;
const MAX_SHOWN = 5;

/**
 * The F-Droid build has no push service. This looks for new unread alerts on
 * each server with notifications on and shows them. The first run only
 * remembers where the inbox is, so old alerts don't all pop up at once.
 */
export async function checkAlerts(): Promise<number> {
  let shown = 0;
  for (const account of accounts.list().filter(isServerAccount)) {
    const pref = await getPushPref(account.id);
    if (!pref.enabled) continue;
    const client = accounts.client(account.id);
    if (!client) continue;
    await client.load().catch(() => {});
    if (!client.isAuthenticated() || !client.api.alerts.available()) continue;
    try {
      const page = await client.api.alerts.list({ unread: true, limit: 20 });
      const fresh = page.items
        .map((item) => ({ ...item, num: Number(item.id) }))
        .filter((item) => Number.isFinite(item.num));
      const newest = Math.max(pref.lastSeenId ?? 0, ...fresh.map((i) => i.num));
      if (pref.lastSeenId !== undefined) {
        const show = fresh
          .filter((item) => item.num > (pref.lastSeenId ?? 0))
          .filter((item) => meetsSeverity(item.severity, pref.minSeverity))
          .sort((a, b) => a.num - b.num)
          .slice(-MAX_SHOWN);
        for (const item of show) {
          const ok = showAlertNotification({
            id: hashId(account.id, item.num),
            title: item.title || "Termix",
            body: item.message,
            url: alertLink(account.id),
            critical: item.severity === "critical",
            channelName: t("push.channels.alerts"),
            criticalChannelName: t("push.channels.critical"),
          });
          if (ok) shown++;
        }
      }
      if (newest !== pref.lastSeenId) {
        await savePushPref(account.id, { lastSeenId: newest });
      }
    } catch (error) {
      log.warn("Alert check failed", {
        operation: "push_poll",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return shown;
}

/** A notification id per server and alert, so each one shows once. */
export function hashId(accountId: string, itemId: number): number {
  let hash = itemId | 0;
  for (let i = 0; i < accountId.length; i++) {
    hash = (hash * 31 + accountId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2_000_000_000;
}

async function runTask(): Promise<BackgroundTask.BackgroundTaskResult> {
  try {
    await accounts.init();
    await checkAlerts();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
}

if (!TaskManager.isTaskDefined(ALERT_CHECK_TASK)) {
  TaskManager.defineTask(ALERT_CHECK_TASK, runTask);
}

/** Registers the check while a server has notifications on, in the F-Droid build. */
export async function updateAlertCheck(): Promise<void> {
  try {
    let wanted = false;
    if (pushMode() === "poll") {
      for (const account of accounts.list().filter(isServerAccount)) {
        if ((await getPushPref(account.id)).enabled) wanted = true;
      }
    }
    const registered =
      await TaskManager.isTaskRegisteredAsync(ALERT_CHECK_TASK);
    if (wanted && !registered) {
      const status = await BackgroundTask.getStatusAsync();
      if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
      await BackgroundTask.registerTaskAsync(ALERT_CHECK_TASK, {
        minimumInterval: INTERVAL_MINUTES,
      });
    } else if (!wanted && registered) {
      await BackgroundTask.unregisterTaskAsync(ALERT_CHECK_TASK);
    }
  } catch {
    // Not available here (web, Expo Go).
  }
}
