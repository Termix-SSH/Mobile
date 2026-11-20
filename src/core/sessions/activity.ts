import { accounts, clientFor } from "@/core/accounts";
import { repositoriesFor } from "@/core/data/repositories";
import { features } from "@/core/features";
import { asServerHost, isSynced } from "@/core/sync";
import type { SSHHost } from "@/types";

/**
 * Records a tab the user opened in recent activity, like the web app does.
 * Tabs without an activity type (the terminal logs once it connects) are
 * skipped. Servers without the activity feed just say no.
 */
export async function logTabOpened(
  accountId: string,
  host: SSHHost,
  type: string,
  remoteProtocol?: string,
): Promise<void> {
  const kind = features.sessionTab(type)?.activityType?.({ remoteProtocol });
  if (!kind) return;
  try {
    const client = clientFor(accountId);
    if (client) {
      // The server knows hosts by its own ids.
      const target = isSynced(accountId)
        ? await asServerHost(accountId, host)
        : host;
      await client.api.homepage.logActivity(kind, target.id, host.name);
      return;
    }
    const account = accounts.find(accountId);
    if (!account) return;
    await repositoriesFor(account, null).recentActivity.add({
      kind,
      title: host.name,
    });
  } catch {
    // Activity is a nice to have; opening the tab already worked.
  }
}
