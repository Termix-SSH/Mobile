import { FeatureRegistry } from "@/core/features/registry";
import { BUILT_IN_FEATURES, registerBuiltInFeatures } from "@/features";

function registry() {
  const r = new FeatureRegistry();
  registerBuiltInFeatures(r);
  return r;
}

const legacyServer = {
  account: { id: "s", kind: "server" } as any,
  client: {
    supports: (req: { pluginApiOnly?: boolean }) => !req.pluginApiOnly,
    isPluginApi: () => false,
  } as any,
};

test("built in features register without clashes", () => {
  const r = registry();
  expect(r.all()).toHaveLength(BUILT_IN_FEATURES.length);
  const ids = BUILT_IN_FEATURES.map((f) => f.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("AI settings are native and require the plugin API", () => {
  const r = registry();
  const ai = BUILT_IN_FEATURES.find((feature) => feature.id === "ai");
  expect(ai).toMatchObject({
    title: "AI Assistant",
    source: "native",
    requires: { plugin: "ai", pluginApiOnly: true },
  });
  expect(r.settingsLinks(legacyServer).some((link) => link.id === "ai")).toBe(
    false,
  );
  const links = r.settingsLinks({
    ...legacyServer,
    client: { supports: () => true } as any,
  });
  expect(links.find((link) => link.id === "ai")).toMatchObject({
    label: "AI Assistant",
    order: 15,
    href: "/(tabs)/ai",
  });
  expect(links.map((link) => link.order)).toEqual(
    links.map((link) => link.order).sort((a, b) => a - b),
  );
});

test("every session type is owned by exactly one feature", () => {
  const types = BUILT_IN_FEATURES.flatMap((f) =>
    (f.sessionTabs ?? []).map((t) => t.type),
  );
  expect(new Set(types).size).toBe(types.length);
  expect(types.sort()).toEqual(
    [
      "docker",
      "filemanager",
      "remoteDesktop",
      "stats",
      "terminal",
      "tunnel",
    ].sort(),
  );
});

test("the default session is the terminal", () => {
  expect(registry().defaultSessionType()).toBe("terminal");
});

test("server tab names round trip with the web app", () => {
  const r = registry();
  expect(r.sessionTabForServerType("files")?.tab.type).toBe("filemanager");
  expect(r.sessionTabForServerType("sftp")?.tab.type).toBe("filemanager");
  expect(r.sessionTabForServerType("host-metrics")?.tab.type).toBe("stats");
  expect(r.sessionTabForServerType("telnet")?.opts).toEqual({
    remoteProtocol: "telnet",
  });
  const metrics = r.sessionTab("stats")!;
  expect(metrics.toServerTabType({}, { isPluginApi: () => true } as any)).toBe(
    "host-metrics",
  );
  expect(metrics.toServerTabType({}, legacyServer.client)).toBe("stats");
});

test("host actions keep the old order", () => {
  const actions = registry().hostActions(legacyServer);
  const ids = (group: string) =>
    actions.filter((a) => a.group === group).map((a) => a.id);
  expect(ids("manage")).toEqual(["wake-on-lan.wake"]);
  expect(ids("connect")).toEqual([
    "terminal.open",
    "file-manager.open",
    "docker.open",
    "tunnels.open",
    "host-metrics.open",
    "remote-desktop.rdp.open",
    "remote-desktop.vnc.open",
    "remote-desktop.telnet.open",
  ]);
});

test("host editor switches and tabs keep the old order", () => {
  const toggles = registry().hostToggles(legacyServer);
  expect(
    toggles.filter((t) => t.group === "protocol").map((t) => t.key),
  ).toEqual(["enableRdp", "enableVnc", "enableTelnet"]);
  expect(
    toggles.filter((t) => t.group === "feature").map((t) => t.key),
  ).toEqual([
    "enableTerminal",
    "enableFileManager",
    "enableTunnel",
    "enableDocker",
  ]);
  const tabs = toggles
    .filter((t) => t.formTab)
    .map((t) => t.formTab!)
    .sort((a, b) => a.order - b.order)
    .map((t) => t.id);
  expect(tabs).toEqual(["terminal", "tunnels", "rdp", "vnc", "telnet"]);
});

test("Tailscale discovery is off on older servers", () => {
  expect(registry().hasCapability("hosts.discovery", legacyServer)).toBe(false);
});

test("This device gets the terminal and snippets, and no server features", () => {
  const ctx = {
    account: { id: "local", kind: "local" } as const,
    client: null,
  };
  const r = registry();
  expect(r.available(ctx).map((f) => f.id)).toEqual(["terminal", "snippets"]);
  expect(r.keyboardTabs(ctx).map((t) => t.id)).toEqual(["snippets", "history"]);
  expect(r.canOpen("terminal", {}, ctx)).toBe(true);
  expect(r.canOpen("docker", {}, ctx)).toBe(false);
});

test("terminal tabs get find, tmux, key rows, and a share link through the server", () => {
  const r = registry();
  const server = {
    account: { id: "s", kind: "server" } as any,
    client: { supports: () => true, isPluginApi: () => true } as any,
  };
  const ctx = (over: object) =>
    ({
      ...server,
      session: { type: "terminal", backendSessionId: "b" },
      handle: { keyTarget: () => ({}) },
      transport: "relay",
      ...over,
    }) as any;
  expect(r.sessionMenuItems(ctx({})).map((i) => i.id)).toEqual([
    "terminal.find",
    "terminal.tmuxWindows",
    "terminal.keyRows",
    "session-sharing.link",
  ]);
  expect(
    r
      .sessionMenuItems(ctx({ transport: "local", handle: null }))
      .map((i) => i.id),
  ).toEqual(["terminal.tmuxWindows", "terminal.keyRows"]);
});

test("the terminal tab brings its own key row and keys panel", () => {
  const chrome = registry().sessionTab("terminal")?.inputChrome;
  expect(chrome?.keyRow).toBeDefined();
  expect(chrome?.keyPanel).toBeDefined();
  expect(registry().sessionTab("docker")?.inputChrome).toBeUndefined();
});
