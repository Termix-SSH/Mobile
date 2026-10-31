import { router } from "expo-router";
import type { AccountClient } from "@/core/api/AccountClient";
import { accounts } from "@/core/accounts";
import { repositoriesFor } from "@/core/data/repositories";
import type { FrameViewTarget, ShellCall } from "@/core/plugins/frame-protocol";
import type { FramePlugin } from "@/core/plugins/webview";
import { features } from "@/core/features";
import type { SSHHost } from "@/types";
import { toast } from "@/utils/toast";
import { openTab as openAppTab } from "@/screens/shell/navigate";

export interface FrameShellDeps {
  client: AccountClient;
  plugin: FramePlugin;
  navigateToSessions: (host?: SSHHost, type?: string) => Promise<unknown>;
  /** Shows another view of the same plugin in place. */
  showView: (view: FrameViewTarget) => void;
  close: () => void;
}

export function frameTabType(pluginId: string, view: string): string {
  return `plugin:${pluginId}:${view}`;
}

/** The phone's copy of a server host, by the server's id. */
async function findHost(
  client: AccountClient,
  hostId: unknown,
): Promise<SSHHost | null> {
  if (hostId === null || hostId === undefined) return null;
  const want = String(hostId);
  const account = accounts.find(client.accountId);
  if (!account) return null;
  const hosts = await repositoriesFor(account, client).hosts.list();
  return (
    hosts.find((h) => h.serverId != null && String(h.serverId) === want) ??
    hosts.find((h) => String(h.id) === want) ??
    null
  );
}

function openPluginScreen(
  accountId: string,
  pluginId: string,
  view: string,
): void {
  router.push({
    pathname: "/tabs/plugins/[pluginId]",
    params: { pluginId, view, account: accountId },
  });
}

/**
 * What the plugin's shell calls do on the phone. Hosts arrive by the server's
 * id; tab types are matched to this plugin's views, then to app tabs that
 * stand for the same server tab.
 */
export function handleShellCall(
  deps: FrameShellDeps,
  call: ShellCall,
  args: unknown[],
): void {
  const { client, plugin } = deps;
  const ownView = (type: unknown) =>
    typeof type === "string"
      ? plugin.views.find((v) => v.view === type)
      : undefined;

  const openTab = async (hostId: unknown, type: unknown, options?: unknown) => {
    const data =
      options && typeof options === "object"
        ? ((options as { data?: Record<string, unknown> }).data ?? undefined)
        : undefined;
    const own = ownView(type);
    const host = await findHost(client, hostId);
    if (own) {
      if (own.host) {
        if (!host) {
          toast.error("That host is not on this phone yet.");
          return;
        }
        await deps.navigateToSessions(host, frameTabType(plugin.id, own.view));
        return;
      }
      deps.showView({ view: own.view, data });
      return;
    }
    if (typeof type !== "string") return;
    const appType = features.sessionTabForServerType(type)?.tab.type;
    if (appType && host) {
      await deps.navigateToSessions(host, appType);
      return;
    }
    toast.error("The app can't open that from here.");
  };

  switch (call) {
    case "openTab":
      void openTab(args[0], args[1], args[2]);
      break;
    case "openSingletonTab":
      if (ownView(args[0])?.host === false) {
        openPluginScreen(client.accountId, plugin.id, String(args[0]));
      } else {
        void openTab(null, args[0], args[1]);
      }
      break;
    case "connectHost":
      void findHost(client, args[0]).then((host) => {
        if (!host) {
          toast.error("That host is not on this phone yet.");
          return;
        }
        const appType =
          typeof args[1] === "string"
            ? features.sessionTabForServerType(args[1])?.tab.type
            : undefined;
        void deps.navigateToSessions(host, appType);
      });
      break;
    case "closeTab":
      deps.close();
      break;
    case "openHostEditor":
      openAppTab("/(tabs)/hosts");
      break;
    case "renameTab":
      // Phone tabs keep their own names.
      break;
  }
}
