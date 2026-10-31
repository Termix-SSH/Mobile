import type { ServerPlugin } from "@/core/api/compat/server-features";
import { FeatureRegistry } from "@/core/features/registry";
import type { FeatureDef } from "@/core/features/types";
import {
  describeSupport,
  isNoise,
  modeLabel,
  pluginState,
  serverRows,
  stateLabel,
  supportRows,
  unavailableText,
} from "@/core/plugins/support";

function registry(...defs: FeatureDef[]) {
  const r = new FeatureRegistry();
  for (const def of defs) r.register(def);
  return r;
}

function feature(id: string, extra: Partial<FeatureDef> = {}): FeatureDef {
  return { id, title: id, source: "native", ...extra };
}

const docker = feature("docker", {
  plugins: ["docker"],
  availableOn: ["local", "server"],
});
const totp = feature("totp", {
  plugins: ["totp"],
  requires: { plugin: "totp" },
});
const defaults = feature("host-defaults", {
  title: "Host defaults",
  availableOn: ["local", "server"],
});

const plugin = (id: string, extra: Partial<ServerPlugin> = {}) => ({
  id,
  active: true,
  ...extra,
});

function row(rows: ReturnType<typeof supportRows>, id: string) {
  const found = rows.find((r) => r.id === id);
  if (!found) throw new Error(`no row ${id}`);
  return found;
}

test("This device: phone features work, the rest needs a server", () => {
  const rows = supportRows({
    registry: registry(docker, totp, defaults),
    local: true,
    plugins: null,
  });
  expect(row(rows, "docker")).toMatchObject({
    mode: "native",
    onDevice: true,
    server: "none",
    section: "phone",
    status: "Works on this phone",
  });
  expect(row(rows, "totp")).toMatchObject({
    onDevice: false,
    section: "server",
    status: "Link a server to use it",
  });
  expect(row(rows, "sso")).toMatchObject({ mode: "server", section: "server" });
  expect(row(rows, "host-status")).toMatchObject({
    mode: "app",
    onDevice: true,
  });
  expect(row(rows, "classic-themes")).toMatchObject({
    mode: "look",
    section: "absent",
    status: "The app has its own look",
  });
  expect(row(rows, "host-defaults")).toMatchObject({
    name: "Host defaults",
    section: "phone",
  });
  // Sorted by name.
  const names = rows.map((r) => r.name);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
});

test("a server account shows each plugin's state there", () => {
  const rows = supportRows({
    registry: registry(docker, totp),
    local: false,
    plugins: [
      plugin("docker", { active: false }),
      plugin("totp"),
      plugin("sso"),
    ],
  });
  expect(row(rows, "docker").status).toBe("Phone only | off on this server");
  expect(row(rows, "totp").status).toBe("Through the server");
  expect(row(rows, "sso").status).toBe("Runs on the server");
  expect(row(rows, "ldap").status).toBe("Not on this server");
});

test("a server that has not said keeps everything reachable", () => {
  const rows = supportRows({
    registry: registry(docker, totp),
    local: false,
    plugins: null,
  });
  expect(row(rows, "docker").status).toBe("Phone and server");
  expect(row(rows, "totp").status).toBe("Through the server");
});

test("a plugin's own mobile info fills in what the app has no screen for", () => {
  const rows = supportRows({
    registry: registry(docker),
    local: false,
    plugins: [
      plugin("databases", {
        name: "DB Browser",
        mobile: { mode: "webview", note: "Best on a tablet" },
      }),
      plugin("docker", { mobile: { mode: "none" } }),
      plugin("community-thing", { mobile: { mode: "native" } }),
      plugin("quiet-thing"),
      plugin("off-thing", { active: false }),
      plugin("labelled", { mobile: { mode: "webview", note: "mobile.note" } }),
    ],
  });
  expect(row(rows, "databases")).toMatchObject({
    name: "DB Browser",
    mode: "webview",
    section: "server",
    note: "Best on a tablet",
  });
  // The app's own screens win over the manifest.
  expect(row(rows, "docker").mode).toBe("native");
  expect(row(rows, "community-thing")).toMatchObject({
    needsNewerApp: true,
    status: "Needs a newer version of the app",
  });
  expect(row(rows, "quiet-thing").status).toBe(
    "Not in the app yet | on this server",
  );
  // Off plugins the app cannot show are left out of the full list only.
  expect(isNoise(row(rows, "off-thing"))).toBe(true);
  expect(isNoise(row(rows, "quiet-thing"))).toBe(false);
  // A locale key needs the plugin's strings, so it is not shown.
  expect(row(rows, "labelled").note).toBeUndefined();
});

test("describeSupport covers the plain cases", () => {
  const base = { mode: "native" as const, onDevice: true, fit: "ok" as const };
  expect(describeSupport({ ...base, server: "missing" })).toBe(
    "Phone only | not on this server",
  );
  expect(
    describeSupport({
      mode: "webview",
      onDevice: false,
      server: "missing",
      fit: "ok",
    }),
  ).toBe("Not on this server");
  expect(
    describeSupport({
      mode: "none",
      onDevice: false,
      server: "none",
      fit: "ok",
    }),
  ).toBe("Not in the app yet");
});

test("plugins that open in a web view say so, and their own feature stays a web view", () => {
  const rows = supportRows({
    registry: registry(
      feature("webview:alerts", {
        source: "webview",
        pluginId: "alerts",
        plugins: ["alerts"],
      }),
    ),
    local: false,
    plugins: [plugin("alerts"), plugin("homepage", { active: false })],
  });
  expect(row(rows, "alerts")).toMatchObject({
    mode: "webview",
    section: "server",
    status: "Opens in the app from the server",
  });
  expect(row(rows, "homepage").status).toBe("Off on this server");
  expect(row(rows, "proxmox").status).toBe("Not on this server");
});

test("plugins that are on but not running, and API mismatches, say so", () => {
  const rows = supportRows({
    registry: registry(docker),
    local: false,
    plugins: [
      plugin("docker", { engine: { api: "^2.0" } }),
      plugin("alerts", { engine: { api: "^1.99" }, version: "3.0.0" }),
      plugin("homepage", { engine: { api: "^0.9" } }),
      plugin("sso", { engine: { api: "^9.0" } }),
      plugin("kubernetes", { active: false, enabled: true, state: "failed" }),
      plugin("fleets", { active: false, enabled: true, state: "safe-mode" }),
    ],
  });
  expect(row(rows, "docker")).toMatchObject({
    fit: "update-app",
    status: "Needs a newer version of the app",
  });
  expect(row(rows, "alerts")).toMatchObject({
    fit: "update-app",
    version: "3.0.0",
    engineApi: "^1.99",
  });
  expect(row(rows, "homepage")).toMatchObject({
    fit: "update-plugin",
    status: "Update the plugin on the server",
  });
  // The app never talks to server only plugins, so their API is not checked.
  expect(row(rows, "sso").fit).toBe("ok");
  expect(row(rows, "kubernetes")).toMatchObject({
    server: "failed",
    status: "Not running on this server",
  });
  expect(stateLabel(row(rows, "kubernetes"))).toBe("Not running");
  expect(stateLabel(row(rows, "fleets"))).toBe("Safe mode");
});

test("serverRows keeps only what the server lists", () => {
  const plugins = [plugin("docker"), plugin("community-thing")];
  const rows = supportRows({
    registry: registry(docker),
    local: false,
    plugins,
  });
  expect(serverRows(rows, plugins).map((r) => r.id)).toEqual([
    "community-thing",
    "docker",
  ]);
  expect(serverRows(rows, null)).toEqual([]);
});

test("labels and the plugin state word", () => {
  expect(modeLabel("webview")).toBe("Web view");
  expect(modeLabel("native")).toBe("In the app");
  expect(modeLabel("look")).toBe("App look");
  expect(pluginState(plugin("a"))).toBe("on");
  expect(pluginState(plugin("a", { active: false }))).toBe("off");
  expect(
    pluginState(
      plugin("a", { active: false, enabled: true, state: "disabled" }),
    ),
  ).toBe("off");
  expect(
    pluginState(plugin("a", { active: false, enabled: true, state: "failed" })),
  ).toBe("failed");
});

test("unavailableText says why a plugin can't open", () => {
  expect(unavailableText(null).title).toBe("Not on this server");
  expect(unavailableText(plugin("a", { active: false })).title).toBe(
    "Turned off on the server",
  );
  expect(
    unavailableText(
      plugin("a", { active: false, enabled: true, state: "safe-mode" }),
    ).hint,
  ).toMatch(/safe mode/);
  expect(unavailableText(plugin("a")).title).toBe(
    "This plugin is not available",
  );
});
