import { useEffect } from "react";
import { router } from "expo-router";
import { useActiveClient } from "@/core/accounts";
import type { AccountClient } from "@/core/api/AccountClient";
import { features, type FeatureRegistry } from "@/core/features";
import type { FeatureDef, SessionTabProps } from "@/core/features/types";
import {
  framePlugins,
  hostAllows,
  viewLabel,
  type FramePlugin,
  type FrameView,
} from "@/core/plugins/webview";
import { PluginSessionTab } from "./PluginSessionTab";
import { pluginIcon } from "./PluginIcon";
import { frameTabType } from "./shell";
import { currentWindowSize, windowInfo } from "@/utils/window-class";

function device(): "phone" | "tablet" {
  const { width, height } = currentWindowSize();
  return windowInfo(width, height).canSplit ? "tablet" : "phone";
}

function sessionTab(plugin: FramePlugin, view: FrameView) {
  const label = viewLabel(plugin, view);
  function Tab(props: SessionTabProps) {
    return <PluginSessionTab {...props} plugin={plugin} view={view.view} />;
  }
  Tab.displayName = `PluginTab(${plugin.id}:${view.view})`;
  return {
    type: frameTabType(plugin.id, view.view),
    icon: pluginIcon(view.icon ?? plugin.icon),
    titleSuffix: () => label,
    shortLabel: () => label,
    serverTabTypes: [view.view],
    toServerTabType: () => view.view,
    needs: ["server" as const],
    component: Tab,
  };
}

/** A server plugin's views as an app feature: host views as tabs, the rest as screens. */
export function frameFeature(plugin: FramePlugin): FeatureDef {
  const hostViews = plugin.views.filter((v) => v.host);
  const screens = plugin.views.filter((v) => !v.host);
  return {
    id: `webview:${plugin.id}`,
    title: plugin.name,
    source: "webview",
    pluginId: plugin.id,
    plugins: [plugin.id],
    requires: { plugin: plugin.id, pluginApiOnly: true },
    availableOn: ["server"],
    sessionTabs: hostViews.map((view) => sessionTab(plugin, view)),
    hostActions: hostViews.map((view, index) => ({
      id: `webview:${plugin.id}:${view.view}`,
      label: viewLabel(plugin, view),
      icon: pluginIcon(view.icon ?? plugin.icon),
      group: "manage" as const,
      order: 200 + index,
      isAvailable: (host, ctx) =>
        ctx.account.kind === "server" && hostAllows(plugin.id, view, host),
      run: (_host, ctx) => ctx.openSession(frameTabType(plugin.id, view.view)),
    })),
    quickActions: screens.map((view, index) => ({
      id: `webview:${plugin.id}:${view.view}`,
      label: viewLabel(plugin, view),
      icon: pluginIcon(view.icon ?? plugin.icon),
      order: 200 + index,
      run: (ctx) =>
        router.push({
          pathname: "/tabs/plugins/[pluginId]",
          params: {
            pluginId: plugin.id,
            view: view.view,
            account: ctx.account.id,
          },
        }),
    })),
  };
}

function signature(plugin: FramePlugin): string {
  return JSON.stringify([
    plugin.name,
    plugin.icon,
    plugin.entry,
    plugin.frame.assetVersion,
    plugin.views,
    plugin.fit,
  ]);
}

const registered = new Map<string, { signature: string; remove: () => void }>();

/** Registers the plugins that should be web views and drops the rest. */
export function syncFrameFeatures(
  plugins: FramePlugin[],
  registry: FeatureRegistry = features,
): void {
  const wanted = new Map(plugins.map((p) => [p.id, p]));
  for (const [id, entry] of registered) {
    const next = wanted.get(id);
    if (!next || signature(next) !== entry.signature) {
      entry.remove();
      registered.delete(id);
    }
  }
  for (const plugin of plugins) {
    if (registered.has(plugin.id)) continue;
    registered.set(plugin.id, {
      signature: signature(plugin),
      remove: registry.register(frameFeature(plugin)),
    });
  }
}

function sync(client: AccountClient | null) {
  syncFrameFeatures(
    client ? framePlugins(client.serverPlugins, features, device()) : [],
  );
}

/** Keeps web view features in step with the active server's plugin list. */
export function usePluginFrameFeatures(): void {
  const client = useActiveClient();
  useEffect(() => {
    sync(client);
    if (!client) return;
    return client.subscribe(() => sync(client));
  }, [client]);
}
