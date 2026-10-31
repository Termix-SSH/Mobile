import {
  overridesAfterEdit,
  pluginKeysIn,
  planHostDefaults,
  resolveForHost,
  storedOverrides,
} from "@/core/hosts/defaults/apply";
import {
  readCoreDefault,
  writeCoreDefault,
} from "@/core/hosts/defaults/columns";
import { leftOutKeys } from "@/core/hosts/defaults/draft";
import {
  emptyIndex,
  levelsForHost,
  type DefaultsIndex,
} from "@/core/hosts/defaults/resolve";
import { coreKeyInfo } from "@/core/hosts/defaults/values";

function index(): DefaultsIndex {
  const i = emptyIndex();
  i.user.set("core.username", "me");
  i.user.set("core.sshPort", 2222);
  i.user.set("core.keepaliveInterval", 15);
  i.user.set("ssh-terminal.theme", "dracula");
  i.folders.set("Prod", {
    name: "Prod",
    values: new Map<string, unknown>([["core.sshPort", 2022]]),
  });
  return i;
}

const baseColumns = {
  connectionType: "ssh",
  username: "",
  port: 22,
  sshPort: 22,
  authType: "password",
  folder: "",
  sshOptions: null,
  forceKeyboardInteractive: "false",
};

test("a new host takes the defaults for the keys it left out", () => {
  const plan = planHostDefaults({
    columns: baseColumns,
    index: index(),
    leftOut: new Set(["username", "sshPort", "keepaliveInterval"]),
  });
  expect(plan.columns.username).toBe("me");
  expect(plan.columns.port).toBe(2222);
  expect(plan.columns.sshPort).toBe(2222);
  expect(JSON.parse(plan.columns.sshOptions as string)).toEqual({
    keepaliveInterval: 15,
  });
  expect(plan.overrides.core).not.toContain("username");
});

test("a value that differs from the default stays and is the host's own", () => {
  const plan = planHostDefaults({
    columns: { ...baseColumns, username: "deploy", port: 2200, sshPort: 2200 },
    index: index(),
    leftOut: new Set(),
  });
  expect(plan.columns.username).toBe("deploy");
  expect(plan.columns.port).toBe(2200);
  expect(plan.overrides.core).toEqual(
    expect.arrayContaining(["username", "sshPort"]),
  );
});

test("a folder default beats the user default for hosts inside it", () => {
  const plan = planHostDefaults({
    columns: { ...baseColumns, folder: "Prod" },
    index: index(),
    leftOut: new Set(["sshPort"]),
  });
  expect(plan.columns.sshPort).toBe(2022);
});

test("plugin defaults fill keys the host has no value for", () => {
  const plan = planHostDefaults({
    columns: baseColumns,
    index: index(),
    pluginSettings: { "ssh-terminal": { font: "mono" } },
    fillPlugins: true,
  });
  expect(plan.pluginSettings["ssh-terminal"]).toEqual({
    font: "mono",
    theme: "dracula",
  });
  const own = planHostDefaults({
    columns: baseColumns,
    index: index(),
    pluginSettings: { "ssh-terminal": { theme: "nord" } },
    fillPlugins: true,
  });
  expect(own.pluginSettings["ssh-terminal"].theme).toBe("nord");
});

test("plugin keys are only filled on request", () => {
  const plan = planHostDefaults({ columns: baseColumns, index: index() });
  expect(plan.pluginSettings).toEqual({});
});

test("a host that follows a key is rewritten when the default changes", () => {
  const first = planHostDefaults({
    columns: baseColumns,
    index: emptyIndex(),
    overrides: null,
  });
  expect(first.overrides.core).toEqual(expect.not.arrayContaining(["sshPort"]));
  const second = planHostDefaults({
    columns: first.columns,
    index: index(),
    overrides: first.overrides,
  });
  expect(second.columns.sshPort).toBe(2222);
  expect(second.changed).toBe(true);
});

test("a host with no stored overrides is classified from its values", () => {
  const plan = planHostDefaults({
    columns: { ...baseColumns, username: "kept", port: 2200, sshPort: 2200 },
    index: index(),
    overrides: null,
  });
  expect(plan.overrides.core).toEqual(
    expect.arrayContaining(["username", "sshPort"]),
  );
  expect(plan.columns.username).toBe("kept");
});

test("an unchanged, classified host reports no change", () => {
  const plan = planHostDefaults({
    columns: baseColumns,
    index: emptyIndex(),
    overrides: { core: ["username"] },
  });
  expect(plan.changed).toBe(false);
});

test("an edit makes the changed keys the host's own", () => {
  const before = { core: ["auth"] };
  const next = overridesAfterEdit(before, baseColumns, {
    ...baseColumns,
    sshPort: 2200,
  });
  expect(next?.core).toEqual(["auth", "sshPort"]);
  expect(overridesAfterEdit(null, baseColumns, baseColumns)).toBeNull();
});

test("stored overrides parse from the row text", () => {
  expect(storedOverrides('{"core":["a"]}')).toEqual({ core: ["a"] });
  expect(storedOverrides(null)).toBeNull();
});

test("plugin keys come from every level a host reads", () => {
  const keys = pluginKeysIn(levelsForHost(index(), "Prod"));
  expect(keys.map((k) => k.fullKey)).toEqual(["ssh-terminal.theme"]);
});

test("the jump host guard drops the host itself", () => {
  const i = emptyIndex();
  i.user.set("core.jumpHosts", [{ hostId: 4 }, { hostId: 5 }]);
  const info = coreKeyInfo().find((k) => k.key === "jumpHosts")!;
  expect(resolveForHost(info, levelsForHost(i, null), 4)?.value).toEqual([
    { hostId: 5 },
  ]);
});

test("columns read back what they write", () => {
  const auth = { authType: "credential", credentialId: 9 };
  const patch = writeCoreDefault("auth", auth, baseColumns);
  expect(patch).toMatchObject({ authType: "credential", credentialId: 9 });
  expect(readCoreDefault("auth", { ...baseColumns, ...patch })).toMatchObject({
    authType: "credential",
    credentialId: 9,
  });
  const keep = writeCoreDefault(
    "environmentVariables",
    [{ key: "A", value: "1" }],
    {
      sshOptions: '{"keepaliveInterval":9}',
    },
  );
  expect(JSON.parse(keep.sshOptions as string)).toEqual({
    keepaliveInterval: 9,
    environmentVariables: [{ key: "A", value: "1" }],
  });
  expect(writeCoreDefault("nope", 1, baseColumns)).toEqual({});
  expect(readCoreDefault("nope", baseColumns)).toBeUndefined();
});

test("columns write the single value keys", () => {
  expect(writeCoreDefault("username", "x", baseColumns)).toEqual({
    username: "x",
  });
  expect(writeCoreDefault("username", "", baseColumns)).toEqual({});
  expect(
    writeCoreDefault("forceKeyboardInteractive", true, baseColumns),
  ).toEqual({ forceKeyboardInteractive: "true" });
  expect(
    writeCoreDefault("jumpHosts", [{ hostId: 2 }], baseColumns).jumpHosts,
  ).toBe('[{"hostId":2}]');
  expect(writeCoreDefault("jumpHosts", [], baseColumns).jumpHosts).toBeNull();
  expect(writeCoreDefault("statusCheckEnabled", false, baseColumns)).toEqual({
    statusCheckEnabled: false,
  });
  expect(
    writeCoreDefault(
      "socks5",
      { useSocks5: true, socks5Host: "p" },
      baseColumns,
    ),
  ).toMatchObject({ useSocks5: true, socks5Host: "p", socks5Port: 1080 });
  expect(readCoreDefault("socks5", baseColumns)).toMatchObject({
    useSocks5: false,
  });
  expect(readCoreDefault("jumpHosts", { jumpHosts: '[{"hostId":1}]' })).toEqual(
    [{ hostId: 1 }],
  );
});

test("a draft says which keys it left out", () => {
  const out = leftOutKeys({ ip: "h", port: 22, username: "", authType: "key" });
  expect(out.has("username")).toBe(true);
  expect(out.has("sshPort")).toBe(false);
  expect(out.has("auth")).toBe(false);
  expect(out.has("socks5")).toBe(true);
  expect(out.has("keepaliveInterval")).toBe(true);
  const full = leftOutKeys({
    ip: "h",
    port: 22,
    username: "u",
    authType: "key",
    forceKeyboardInteractive: false,
    sshOptions: { keepaliveInterval: 1 },
    jumpHosts: [{ hostId: 1 }],
    statsConfig: "{}",
  });
  expect(full.has("keepaliveInterval")).toBe(false);
  expect(full.has("jumpHosts")).toBe(false);
  expect(full.has("statusCheckEnabled")).toBe(false);
});
