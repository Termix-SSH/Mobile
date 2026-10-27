import type { ServerPlugin } from "@/core/api/compat/server-features";
import { FeatureRegistry } from "@/core/features/registry";
import type { FeatureDef } from "@/core/features/types";
import {
  framePlugin,
  framePlugins,
  hostAllows,
  translate,
  viewLabel,
} from "@/core/plugins/webview";

function plugin(id: string, extra: Partial<ServerPlugin> = {}): ServerPlugin {
  return {
    id,
    active: true,
    frame: {
      css: true,
      assetVersion: "v1",
      locales: ["en"],
      icon: "Bell",
      contributes: {
        tabs: [{ id, titleKey: "nav.main", icon: "Bell", openFrom: ["rail"] }],
      },
    },
    ...extra,
  };
}

const native = (id: string): FeatureDef => ({
  id,
  title: id,
  source: "native",
  plugins: [id],
});

test("official plugins the catalog marks webview open in the app", () => {
  const out = framePlugin(plugin("alerts"), new FeatureRegistry(), "phone");
  expect(out).toMatchObject({
    id: "alerts",
    name: "Alerts",
    entry: "frontend.js",
    icon: "Bell",
    views: [{ view: "alerts", host: false, titleKey: "nav.main" }],
  });
});

test("a tab opened from the host menu is a host view", () => {
  const proxmox = plugin("proxmox", {
    frame: {
      css: false,
      assetVersion: null,
      locales: ["en"],
      contributes: {
        tabs: [
          {
            id: "proxmox-stats",
            titleKey: "nav.proxmoxStats",
            icon: "HardDrive",
            openFrom: ["host-context-menu", "palette"],
          },
        ],
      },
    },
  });
  expect(framePlugin(proxmox, new FeatureRegistry(), "phone")?.views).toEqual([
    {
      view: "proxmox-stats",
      titleKey: "nav.proxmoxStats",
      icon: "HardDrive",
      host: true,
      gate: { setting: "enableProxmoxStats" },
    },
  ]);
});

test("a gated host view shows only where its host setting is on", () => {
  const stats = {
    view: "proxmox-stats",
    host: true,
    gate: { setting: "enableProxmoxStats" },
  };
  expect(
    hostAllows("proxmox", stats, {
      pluginSettings: { proxmox: { enableProxmoxStats: true } },
    }),
  ).toBe(true);
  expect(hostAllows("proxmox", stats, {})).toBe(false);
  expect(
    hostAllows("proxmox", stats, {
      pluginSettings: { proxmox: { enableProxmox: true } },
    }),
  ).toBe(false);

  const samba = {
    view: "samba",
    host: true,
    gate: { setting: "enableSamba", ssh: true },
  };
  const on = { pluginSettings: { samba: { enableSamba: true } } };
  expect(hostAllows("samba", samba, on)).toBe(true);
  expect(hostAllows("samba", samba, { ...on, enableSsh: false })).toBe(false);
  expect(hostAllows("samba", { view: "x", host: true }, {})).toBe(true);
});

test("the app's own screens, off plugins and plugins with no frontend stay out", () => {
  const registry = new FeatureRegistry();
  registry.register(native("docker"));
  expect(framePlugin(plugin("docker"), registry, "phone")).toBeNull();
  expect(
    framePlugin(plugin("alerts", { active: false }), registry, "phone"),
  ).toBeNull();
  expect(
    framePlugin(plugin("alerts", { frame: undefined }), registry, "phone"),
  ).toBeNull();
  // Server side plugins and looks are not web views.
  expect(framePlugin(plugin("sso"), registry, "phone")).toBeNull();
  expect(framePlugin(plugin("classic-layout"), registry, "phone")).toBeNull();
});

test("community plugins need mode webview, and its options apply", () => {
  const registry = new FeatureRegistry();
  expect(framePlugin(plugin("hello-world"), registry, "phone")).toBeNull();
  const declared = plugin("hello-world", {
    name: "Hello World",
    mobile: {
      mode: "webview",
      entry: "dist/mobile.js",
      sizes: ["tablet"],
    },
  });
  expect(framePlugin(declared, registry, "phone")).toBeNull();
  expect(framePlugin(declared, registry, "tablet")).toMatchObject({
    name: "Hello World",
    entry: "dist/mobile.js",
  });
  expect(
    framePlugin(
      plugin("alerts", { mobile: { mode: "none" } }),
      registry,
      "phone",
    ),
  ).toBeNull();
});

test("views from the manifest can pick panels and drop tabs", () => {
  const p = plugin("gizmo", {
    mobile: { mode: "webview", views: ["gizmo-panel"] },
    frame: {
      css: false,
      assetVersion: null,
      locales: [],
      contributes: {
        tabs: [{ id: "gizmo", titleKey: "a", icon: "Box", openFrom: ["rail"] }],
        panels: [{ id: "gizmo-panel", titleKey: "b" }],
      },
    },
  });
  expect(
    framePlugin(p, new FeatureRegistry(), "phone")?.views.map((v) => v.view),
  ).toEqual(["gizmo-panel"]);
  // Nothing left to show means no web view at all.
  expect(
    framePlugin(
      { ...p, mobile: { mode: "webview", views: ["missing"] } },
      new FeatureRegistry(),
      "phone",
    ),
  ).toBeNull();
});

test("a webview feature already registered does not hide its own plugin", () => {
  const registry = new FeatureRegistry();
  registry.register({
    id: "webview:alerts",
    title: "Alerts",
    source: "webview",
    pluginId: "alerts",
    plugins: ["alerts"],
  });
  expect(framePlugin(plugin("alerts"), registry, "phone")).not.toBeNull();
});

test("framePlugins sorts by name and skips the rest", () => {
  const list = framePlugins(
    [plugin("proxmox"), plugin("sso"), plugin("alerts")],
    new FeatureRegistry(),
    "phone",
  );
  expect(list.map((p) => p.name)).toEqual(["Alerts", "Proxmox"]);
  expect(framePlugins(null, new FeatureRegistry(), "phone")).toEqual([]);
});

test("labels and strings", () => {
  const one = framePlugin(plugin("alerts"), new FeatureRegistry(), "phone")!;
  expect(viewLabel(one, one.views[0])).toBe("Alerts");
  const two = {
    ...one,
    views: [
      { view: "proxmox-stats", host: true },
      { view: "nodes", host: false },
    ],
  };
  expect(viewLabel(two, two.views[0])).toBe("Proxmox stats");
  expect(translate({ nav: { main: "Inbox" } }, "nav.main")).toBe("Inbox");
  expect(translate({ nav: {} }, "nav.main")).toBeNull();
  expect(translate(undefined, "nav.main")).toBeNull();
});

test("a web view plugin carries its engine.api check", () => {
  const registry = new FeatureRegistry();
  expect(framePlugin(plugin("alerts"), registry, "phone")?.fit).toBe("ok");
  expect(
    framePlugin(
      plugin("alerts", { engine: { api: "^99.0" } }),
      registry,
      "phone",
    )?.fit,
  ).toBe("update-app");
});
