import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { accounts } from "@/core/accounts";
import { isServerAccount } from "@/core/accounts/types";
import { createLogger } from "@/core/log/logger";
import { sync } from "./manager";

const log = createLogger("sync");

export const BACKGROUND_SYNC_TASK = "termix-background-sync";

/** The system asks for at least 15 minutes; iOS picks its own times. */
const INTERVAL_MINUTES = 15;
/** Stay well inside the time a background run gets. */
const BUDGET_MS = 25_000;

/** One pass per linked server. Exported for tests. */
export async function backgroundSync(): Promise<BackgroundTask.BackgroundTaskResult> {
  try {
    await accounts.init();
    await Promise.all(
      accounts
        .list()
        .filter(isServerAccount)
        .map((a) => accounts.client(a.id)?.load()),
    );
    const done = await sync.runInBackground(BUDGET_MS);
    log.info(`Background sync ran for ${done} servers`, {
      operation: "sync_background",
    });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    log.warn("Background sync failed", {
      operation: "sync_background",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
}

// Must be defined when the app loads, so the system can wake it later.
if (!TaskManager.isTaskDefined(BACKGROUND_SYNC_TASK)) {
  TaskManager.defineTask(BACKGROUND_SYNC_TASK, backgroundSync);
}

/** Registers the task while at least one server syncs, else removes it. */
export async function updateBackgroundSync(): Promise<boolean> {
  const wanted = accounts
    .list()
    .some((a) => isServerAccount(a) && a.options.sync === true);
  try {
    const registered =
      await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (wanted && !registered) {
      const status = await BackgroundTask.getStatusAsync();
      if (status !== BackgroundTask.BackgroundTaskStatus.Available)
        return false;
      await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
        minimumInterval: INTERVAL_MINUTES,
      });
    } else if (!wanted && registered) {
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
    }
    return wanted;
  } catch {
    // Not available here (web, Expo Go).
    return false;
  }
}
