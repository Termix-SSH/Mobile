const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const compat = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(path.join(__dirname, "../lib/api-compat.ts"), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports: compat },
);

test("old routes map onto 2.9 plugin routes", () => {
  const cases = [
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
    assert.equal(compat.toPluginRequest(method, from), to, `${method} ${from}`);
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
    assert.equal(compat.toPluginRequest("GET", p), p);
  }
});

test("pluginSettings fill the flat host fields", () => {
  const host = compat.flattenPluginSettings({
    id: 1,
    statsConfig: { metricsEnabled: true },
    pluginSettings: {
      "ssh-terminal": { enableTerminal: true },
      "file-manager": { enableFileManager: false, defaultPath: "/srv" },
      docker: { enableDocker: true },
      tunnels: {
        enableTunnel: true,
        tunnelConnections: '[{"sourcePort":1,"endpointPort":2}]',
      },
      "remote-desktop": { enableRdp: true, rdpPort: 3390 },
      "wake-on-lan": { macAddress: "aa:bb" },
    },
  });
  assert.equal(host.enableTerminal, true);
  assert.equal(host.enableFileManager, false);
  assert.equal(host.defaultPath, "/srv");
  assert.equal(host.enableDocker, true);
  assert.equal(host.enableTunnel, true);
  assert.equal(host.tunnelConnections.length, 1);
  assert.equal(host.enableRdp, true);
  assert.equal(host.rdpPort, 3390);
  assert.equal(host.enableVnc, false);
  assert.equal(host.macAddress, "aa:bb");
  assert.equal(typeof host.statsConfig, "string");
});

test("a plugin missing from pluginSettings reads as off", () => {
  const host = compat.flattenPluginSettings({ id: 1, pluginSettings: {} });
  assert.equal(host.enableDocker, false);
  assert.equal(host.enableTerminal, false);
  assert.equal(JSON.parse(host.statsConfig).metricsEnabled, false);
});

test("pre 2.9 hosts pass through untouched", () => {
  const legacy = { id: 1, enableDocker: true, statsConfig: "{}" };
  assert.deepEqual(compat.flattenPluginSettings(legacy), legacy);
});

test("2.9 tunnel names match the server format", () => {
  assert.equal(
    compat.pluginTunnelName(
      { id: 4, name: "", username: "root", ip: "10.0.0.1" },
      0,
      {
        sourcePort: 8080,
        endpointHost: " db ",
        endpointPort: 5432,
      },
    ),
    "4::0::root@10.0.0.1::8080::db::5432",
  );
});

test("version compare", () => {
  assert.equal(compat.isVersionAtLeast("2.9.0", "2.9.0"), true);
  assert.equal(compat.isVersionAtLeast("v2.10.1", "2.9.0"), true);
  assert.equal(compat.isVersionAtLeast("2.8.4", "2.9.0"), false);
  assert.equal(compat.isVersionAtLeast(undefined, "2.9.0"), false);
});
