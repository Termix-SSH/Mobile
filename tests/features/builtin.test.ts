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
  // Plus the plugin host fields feature, which needs the registry.
  expect(r.all()).toHaveLength(BUILT_IN_FEATURES.length + 1);
  const ids = BUILT_IN_FEATURES.map((f) => f.id);
  expect(new Set(ids).size).toBe(ids.length);
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
      "services",
      "stats",
      "telnet",
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
  expect(ids("manage")).toEqual(["wake-on-lan.wake", "share-host"]);
  expect(ids("connect")).toEqual([
    "terminal.open",
    "file-manager.open",
    "docker.open",
    "services.open",
    "tunnels.open",
    "host-metrics.open",
    "remote-desktop.rdp.open",
    "remote-desktop.vnc.open",
    "remote-desktop.telnet.open",
  ]);
});

test("host editor switches keep the old order and features add sections", () => {
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
    "enableServices",
  ]);
  const sections = registry()
    .hostEditorSections(legacyServer)
    .map((s) => `${s.group}:${s.id}:${s.toggle ?? ""}`);
  expect(sections).toEqual(
    expect.arrayContaining([
      "ssh:terminal:enableTerminal",
      "ssh:tunnels:enableTunnel",
      "ssh:files:enableFileManager",
      "protocol:rdp:enableRdp",
      "protocol:vnc:enableVnc",
      "protocol:telnet:enableTelnet",
      "host:wake-on-lan:",
    ]),
  );
});

test("Tailscale discovery is off on older servers", () => {
  expect(registry().hasCapability("hosts.discovery", legacyServer)).toBe(false);
});

test("This device gets the features that run on the phone, and no server only ones", () => {
  const ctx = {
    account: { id: "local", kind: "local" } as const,
    client: null,
  };
  const r = registry();
  expect(r.available(ctx).map((f) => f.id)).toEqual([
    "terminal",
    "file-manager",
    "docker",
    "service-manager",
    "tunnels",
    "host-metrics",
    "remote-desktop",
    "remote-desktop.rdp",
    "remote-desktop.vnc",
    "remote-desktop.telnet",
    "wake-on-lan",
    "snippets",
    "host-defaults",
    "host-transfer",
  ]);
  expect(r.keyboardTabs(ctx).map((t) => t.id)).toEqual(["snippets", "history"]);
  expect(r.canOpen("terminal", {}, ctx)).toBe(true);
  expect(r.canOpen("filemanager", {}, ctx)).toBe(true);
  expect(r.canOpen("docker", {}, ctx)).toBe(true);
  // The phone dials RDP, VNC and Telnet itself.
  expect(r.canOpen("remoteDesktop", { remoteProtocol: "rdp" }, ctx)).toBe(true);
  expect(r.canOpen("telnet", {}, ctx)).toBe(true);
});

test("telnet runs on the phone and is never a server only tab", () => {
  const r = registry();
  expect(r.sessionNeeds("telnet")).toEqual([["tcp"]]);
  expect(r.serverOnly("telnet")).toBe(false);
  expect(r.sessionTab("telnet")?.dialsDirectly).toBe(true);
  // Server tab records named telnet still reopen in the server's view.
  expect(r.sessionTabForServerType("telnet")?.tab.type).toBe("remoteDesktop");
});

test("files work over SFTP or the server, and sit beside terminals", () => {
  const r = registry();
  expect(r.sessionNeeds("filemanager")).toEqual([["sftp"], ["server"]]);
  expect(r.serverOnly("filemanager")).toBe(false);
  expect(r.sessionTab("filemanager")?.relayRequires).toEqual({
    plugin: "file-manager",
  });
  const local = {
    account: { id: "local", kind: "local" } as const,
    client: null,
  };
  const host = (over: object) =>
    ({ enableFileManager: true, enableSsh: true, ...over }) as any;
  expect(r.companionsFor("terminal", host({}), local).map((c) => c.id)).toEqual(
    ["files"],
  );
  expect(
    r.companionsFor("terminal", host({ showFilesPanel: false }), local),
  ).toEqual([]);
  expect(
    r.companionsFor("terminal", host({ enableFileManager: false }), local),
  ).toEqual([]);
  expect(r.companionsFor("terminal", host({}), local)[0].phoneTabType).toBe(
    "filemanager",
  );
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
    "terminal.connectionLog",
    "terminal.keyRows",
    "session-sharing.link",
  ]);
  expect(
    r
      .sessionMenuItems(ctx({ transport: "local", handle: null }))
      .map((i) => i.id),
  ).toEqual([
    "terminal.tmuxWindows",
    "terminal.connectionLog",
    "terminal.keyRows",
  ]);
});

test("the terminal tab brings its own key row and keys panel", () => {
  const chrome = registry().sessionTab("terminal")?.inputChrome;
  expect(chrome?.keyRow).toBeDefined();
  expect(chrome?.keyPanel).toBeDefined();
  expect(registry().sessionTab("docker")?.inputChrome).toBeUndefined();
});

test("tunnels run from the phone or the server", () => {
  expect(registry().sessionNeeds("tunnel")).toEqual([["forward"], ["server"]]);
});
