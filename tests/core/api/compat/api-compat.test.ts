import {
  flattenPluginSettings,
  isVersionAtLeast,
  pluginTunnelName,
  toPluginRequest,
} from "@/core/api/compat/api-compat";

test("old routes map onto 2.9 plugin routes", () => {
  const cases: [string, string, string][] = [
    [
      "GET",
      "/ssh/file_manager/ssh/listFiles?sessionId=a",
      "/plugin-api/file-manager/listFiles?sessionId=a",
    ],
    [
      "POST",
      "/ssh/file_manager/ssh/connect-warpgate",
      "/plugin-api/file-manager/connect-browser-sign-in",
    ],
    [
      "POST",
      "/ssh/file_manager/sudo-password",
      "/plugin-api/file-manager/sudo-password",
    ],
    [
      "GET",
      "/host/file_manager/recent?hostId=1",
      "/plugin-api/file-manager/recent?hostId=1",
    ],
    ["GET", "/ssh/tunnel/status", "/plugin-api/tunnels/status"],
    ["GET", "/status", "/host/status"],
    ["GET", "/status/4", "/host/status/4"],
    ["POST", "/refresh", "/host/status/refresh"],
    ["GET", "/metrics/4", "/plugin-api/host-metrics/metrics/4"],
    ["POST", "/docker/ssh/connect", "/plugin-api/docker/ssh/connect"],
    [
      "POST",
      "/docker/ssh/connect-warpgate",
      "/plugin-api/docker/ssh/connect-browser-sign-in",
    ],
    [
      "DELETE",
      "/docker/containers/s1/c1",
      "/plugin-api/docker/containers/s1/c1/remove?force=true",
    ],
    [
      "POST",
      "/docker/containers/s1/c1/stop",
      "/plugin-api/docker/containers/s1/c1/stop",
    ],
    ["GET", "/snippets", "/plugin-api/snippets"],
    ["PUT", "/snippets/folders/rename", "/plugin-api/snippets/folders/rename"],
    [
      "GET",
      "/terminal/command_history/3",
      "/plugin-api/ssh-terminal/command-history/3",
    ],
    [
      "POST",
      "/terminal/command_history/delete",
      "/plugin-api/ssh-terminal/command-history/delete",
    ],
    [
      "POST",
      "/guacamole/connect-host/9",
      "/plugin-api/remote-desktop/connect-host/9",
    ],
    ["POST", "/host/db/host/9/wake", "/plugin-api/wake-on-lan/host/9/wake"],
    ["GET", "/uptime", "/dashboard/uptime"],
    ["GET", "/activity/recent?limit=5", "/dashboard/activity/recent?limit=5"],
    ["POST", "/users/totp/setup", "/plugin-api/totp/setup"],
    ["GET", "/users/oidc-config", "/plugin-api/sso/config"],
  ];
  for (const [method, from, to] of cases) {
    expect([method, from, toPluginRequest(method, from)]).toEqual([
      method,
      from,
      to,
    ]);
  }
});

test("routes 2.9 kept in core are left alone", () => {
  for (const p of [
    "/host/db/host",
    "/host/db/host/3",
    "/host/folders",
    "/credentials",
    "/users/login",
    "/users/totp/verify-login",
    "/users/oidc/authorize",
    "/open-tabs",
    "/version",
    "/host/status",
  ]) {
    expect(toPluginRequest("GET", p)).toBe(p);
  }
});

test("pluginSettings fill the flat host fields", () => {
  const host: any = flattenPluginSettings({
    id: 1,
    statsConfig: { metricsEnabled: true },
    pluginSettings: {
      "ssh-terminal": { enableTerminal: true, connectFrom: "server" },
      "file-manager": { enableFileManager: false, defaultPath: "/srv" },
      docker: { enableDocker: true },
      "service-manager": { enableServices: true, useSudo: true },
      tunnels: {
        enableTunnel: true,
        tunnelConnections: '[{"sourcePort":1,"endpointPort":2}]',
      },
      "remote-desktop": { enableRdp: true, rdpPort: 3390 },
      "wake-on-lan": { macAddress: "aa:bb" },
    },
  });
  expect(host.enableTerminal).toBe(true);
  expect(host.connectFrom).toBe("server");
  expect(host.enableFileManager).toBe(false);
  expect(host.defaultPath).toBe("/srv");
  expect(host.showFilesPanel).toBe(true);
  expect(host.enableDocker).toBe(true);
  expect(host.enableServices).toBe(true);
  expect(host.enableTunnel).toBe(true);
  expect(host.tunnelConnections).toHaveLength(1);
  expect(host.enableRdp).toBe(true);
  expect(host.rdpPort).toBe(3390);
  expect(host.enableVnc).toBe(false);
  expect(host.macAddress).toBe("aa:bb");
  expect(typeof host.statsConfig).toBe("string");
});

test("a plugin missing from pluginSettings reads as off", () => {
  const host: any = flattenPluginSettings({ id: 1, pluginSettings: {} });
  expect(host.enableDocker).toBe(false);
  expect(host.enableServices).toBe(false);
  expect(host.enableTerminal).toBe(false);
  expect(host.connectFrom).toBeUndefined();
  expect(JSON.parse(host.statsConfig).metricsEnabled).toBe(false);
});

test("pre 2.9 hosts pass through untouched", () => {
  const legacy = { id: 1, enableDocker: true, statsConfig: "{}" };
  expect(flattenPluginSettings(legacy)).toEqual(legacy);
});

test("2.9 tunnel names match the server format", () => {
  expect(
    pluginTunnelName({ id: 4, name: "", username: "root", ip: "10.0.0.1" }, 0, {
      sourcePort: 8080,
      endpointHost: " db ",
      endpointPort: 5432,
    }),
  ).toBe("4::0::root@10.0.0.1::8080::db::5432");
});

test("version compare", () => {
  expect(isVersionAtLeast("2.9.0", "2.9.0")).toBe(true);
  expect(isVersionAtLeast("v2.10.1", "2.9.0")).toBe(true);
  expect(isVersionAtLeast("2.8.4", "2.9.0")).toBe(false);
  expect(isVersionAtLeast(undefined, "2.9.0")).toBe(false);
});

test("the file manager's showPanel host setting turns the files panel off", () => {
  const host: any = flattenPluginSettings({
    id: 1,
    pluginSettings: {
      "file-manager": { enableFileManager: true, showPanel: false },
    },
  });
  expect(host.showFilesPanel).toBe(false);
});

describe("saved tunnels", () => {
  const {
    hasSavedTunnels,
    toSavedTunnel,
    buildPluginHostSettings,
  } = require("@/core/api/compat/api-compat");

  test("needs plugin 1.2.0 or newer, unknown version counts as yes", () => {
    expect(hasSavedTunnels(undefined)).toBe(false);
    expect(hasSavedTunnels({})).toBe(true);
    expect(hasSavedTunnels({ version: "1.1.9" })).toBe(false);
    expect(hasSavedTunnels({ version: "1.2.1" })).toBe(true);
  });

  test("drops fields the plugin does not take", () => {
    expect(
      toSavedTunnel({
        sourcePort: 1,
        scope: "c2s",
        endpointPassword: "x",
        sourceHostName: "h",
      }),
    ).toEqual({ sourcePort: 1 });
  });

  test("host settings skip the list when saved routes exist", () => {
    const data = { enableTunnel: true, tunnelConnections: [{ sourcePort: 1 }] };
    expect(
      buildPluginHostSettings({ enableServices: true })["service-manager"],
    ).toEqual({ enableServices: true });
    expect(buildPluginHostSettings(data).tunnels).toEqual({
      enableTunnel: true,
      tunnelConnections: [{ sourcePort: 1 }],
    });
    expect(
      buildPluginHostSettings(data, { savedTunnels: true }).tunnels,
    ).toEqual({ enableTunnel: true });
  });
});

test("a picked Vault profile is saved, and left alone when not picked", () => {
  const { buildPluginHostSettings } = require("@/core/api/compat/api-compat");
  expect(buildPluginHostSettings({ vaultProfileId: 5 }).vault).toEqual({
    profileId: 5,
  });
  expect(buildPluginHostSettings({ vaultProfileId: null }).vault).toEqual({
    profileId: null,
  });
  expect(buildPluginHostSettings({}).vault).toBeUndefined();
});

test("plugin fields the editor changed are merged into that plugin", () => {
  const { buildPluginHostSettings } = require("@/core/api/compat/api-compat");
  const out = buildPluginHostSettings({
    enableDocker: true,
    pluginSettingsPatch: {
      docker: { containerRuntime: "podman" },
      databases: { enableDatabases: true },
    },
  });
  expect(out.docker).toEqual({
    enableDocker: true,
    containerRuntime: "podman",
  });
  expect(out.databases).toEqual({ enableDatabases: true });
});
