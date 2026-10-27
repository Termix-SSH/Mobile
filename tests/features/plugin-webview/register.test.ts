import { router } from "expo-router";
import { FeatureRegistry } from "@/core/features/registry";
import type { FeatureContext } from "@/core/features/types";
import type { FramePlugin } from "@/core/plugins/webview";
import {
  frameFeature,
  syncFrameFeatures,
} from "@/features/plugin-webview/register";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

function plugin(extra: Partial<FramePlugin> = {}): FramePlugin {
  return {
    id: "proxmox",
    name: "Proxmox",
    icon: "Server",
    entry: "frontend.js",
    frame: { css: false, assetVersion: "v1", locales: ["en"], contributes: {} },
    views: [
      { view: "proxmox-stats", icon: "HardDrive", host: true },
      { view: "nodes", host: false },
    ],
    fit: "ok",
    ...extra,
  };
}

const serverCtx = {
  account: { id: "s1", kind: "server" },
  client: null,
} as unknown as FeatureContext;

test("host views become tabs and host actions, the rest Home actions", () => {
  const def = frameFeature(plugin());
  expect(def).toMatchObject({
    id: "webview:proxmox",
    source: "webview",
    pluginId: "proxmox",
    plugins: ["proxmox"],
    availableOn: ["server"],
  });
  expect(def.sessionTabs).toHaveLength(1);
  const tab = def.sessionTabs![0];
  expect(tab.type).toBe("plugin:proxmox:proxmox-stats");
  expect(tab.needs).toEqual(["server"]);
  expect(tab.toServerTabType({}, null)).toBe("proxmox-stats");
  expect(tab.titleSuffix({})).toBe("Proxmox stats");

  const action = def.hostActions![0];
  expect(action.group).toBe("manage");
  expect(action.isAvailable({} as never, serverCtx)).toBe(true);

  const gated = frameFeature(
    plugin({
      views: [
        {
          view: "proxmox-stats",
          host: true,
          gate: { setting: "enableProxmoxStats" },
        },
      ],
    }),
  ).hostActions![0];
  expect(gated.isAvailable({} as never, serverCtx)).toBe(false);
  expect(
    gated.isAvailable(
      { pluginSettings: { proxmox: { enableProxmoxStats: true } } } as never,
      serverCtx,
    ),
  ).toBe(true);
  const openSession = jest.fn();
  action.run({} as never, { ...serverCtx, openSession, close: jest.fn() });
  expect(openSession).toHaveBeenCalledWith("plugin:proxmox:proxmox-stats");

  const quick = def.quickActions![0];
  expect(quick.label).toBe("Nodes");
  quick.run(serverCtx);
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/tabs/plugins/[pluginId]",
    params: { pluginId: "proxmox", view: "nodes", account: "s1" },
  });
});

test("sync registers new plugins, keeps unchanged ones and drops the rest", () => {
  const registry = new FeatureRegistry();
  syncFrameFeatures([plugin()], registry);
  expect(registry.forPlugin("proxmox")).toHaveLength(1);
  const first = registry.forPlugin("proxmox")[0];

  syncFrameFeatures([plugin()], registry);
  expect(registry.forPlugin("proxmox")[0]).toBe(first);

  // A new bundle version re-registers so open tabs get the new views.
  syncFrameFeatures(
    [plugin({ frame: { ...plugin().frame, assetVersion: "v2" } })],
    registry,
  );
  expect(registry.forPlugin("proxmox")[0]).not.toBe(first);

  syncFrameFeatures([], registry);
  expect(registry.forPlugin("proxmox")).toHaveLength(0);
});
