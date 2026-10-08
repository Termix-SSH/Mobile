const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const features = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(path.join(__dirname, "../lib/server-features.ts"), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports: features },
);

const ALL = [
  "terminal",
  "commandHistory",
  "fileManager",
  "tunnels",
  "metrics",
  "docker",
  "rdp",
  "vnc",
  "telnet",
  "snippets",
  "wakeOnLan",
  "alerts",
  "totp",
];

test("older servers and an unknown plugin list keep everything on", () => {
  for (const feature of ALL) {
    assert.equal(features.hasServerFeature(feature, false, []), true);
    assert.equal(features.hasServerFeature(feature, true, null), true);
  }
});

test("only enabled and running plugins count", () => {
  const plugins = features.activePlugins([
    { id: "ssh-terminal", enabled: true, state: "active" },
    { id: "docker", enabled: false, state: "disabled" },
    { id: "tunnels", enabled: true, state: "failed" },
    { id: "snippets" },
    { name: "no id" },
  ]);
  assert.deepEqual(
    plugins.map((p) => p.id),
    ["ssh-terminal", "snippets"],
  );
  const has = (f) => features.hasServerFeature(f, true, plugins);
  assert.equal(has("terminal"), true);
  assert.equal(has("commandHistory"), true);
  assert.equal(has("snippets"), true);
  assert.equal(has("docker"), false);
  assert.equal(has("tunnels"), false);
  assert.equal(has("fileManager"), false);
  assert.equal(has("rdp"), false);
});

test("remote desktop protocols follow the plugin's declared protocols", () => {
  const plugins = features.activePlugins([
    {
      id: "remote-desktop",
      enabled: true,
      state: "active",
      contributes: { protocols: [{ id: "rdp" }, { id: "vnc" }] },
    },
  ]);
  const has = (f) => features.hasServerFeature(f, true, plugins);
  assert.equal(has("rdp"), true);
  assert.equal(has("vnc"), true);
  assert.equal(has("telnet"), false);

  const noList = features.activePlugins([
    { id: "remote-desktop", enabled: true, state: "active", contributes: {} },
  ]);
  assert.equal(features.hasServerFeature("telnet", true, noList), true);
});

test("cached lists survive a JSON round trip", () => {
  const plugins = features.activePlugins([
    {
      id: "remote-desktop",
      enabled: true,
      state: "active",
      contributes: { protocols: [{ id: "rdp" }] },
    },
  ]);
  const again = features.activePlugins(JSON.parse(JSON.stringify(plugins)));
  assert.equal(features.hasServerFeature("rdp", true, again), true);
  assert.equal(features.hasServerFeature("vnc", true, again), false);
  assert.equal(features.activePlugins("nope"), null);
});

test("host filters only offer features the server has", () => {
  const has = (f) => f !== "docker" && f !== "vnc";
  assert.equal(features.filterOptionAvailable("docker", has), false);
  assert.equal(features.filterOptionAvailable("vnc", has), false);
  assert.equal(features.filterOptionAvailable("tunnel", has), true);
  assert.equal(features.filterOptionAvailable("ssh", has), true);
  assert.equal(features.filterOptionAvailable("online", has), true);
});

test("session tabs map to the feature they need", () => {
  assert.equal(features.sessionFeature("terminal"), "terminal");
  assert.equal(features.sessionFeature("stats"), "metrics");
  assert.equal(features.sessionFeature("filemanager"), "fileManager");
  assert.equal(features.sessionFeature("tunnel"), "tunnels");
  assert.equal(features.sessionFeature("docker"), "docker");
  assert.equal(features.sessionFeature("remoteDesktop", "vnc"), "vnc");
  assert.equal(features.sessionFeature("remoteDesktop", "telnet"), "telnet");
  assert.equal(features.sessionFeature("remoteDesktop", "ssh"), "rdp");
  assert.equal(features.sessionFeature("remoteDesktop"), "rdp");
  assert.equal(features.sessionFeature("unknown"), null);
});
