import { localRepositories, HISTORY_LIMIT } from "@/core/data/local";
import { hosts as hostsTable } from "@/core/db/schema";
import type { SSHHost, SSHHostData } from "@/types";
import { resetStorage } from "../../helpers/http";
import { testStores } from "../../helpers/db";

beforeEach(resetStorage);

function setup() {
  const { stores } = testStores();
  return { stores, repos: localRepositories("local", stores) };
}

const fullHost: SSHHostData = {
  name: "web",
  ip: "10.0.0.5",
  port: 2222,
  username: "deploy",
  folder: "Prod / Web",
  tags: ["prod", "web"],
  pin: true,
  authType: "password",
  password: "hunter2",
  enableTerminal: true,
  enableTunnel: true,
  enableFileManager: true,
  enableDocker: true,
  defaultPath: "/srv",
  tunnelConnections: [
    {
      sourcePort: 8080,
      endpointPort: 80,
      endpointHost: "db",
      maxRetries: 3,
      retryInterval: 10,
      autoStart: false,
    } as never,
  ],
  jumpHosts: [{ hostId: 7 }],
  statsConfig: JSON.stringify({
    enabledWidgets: ["cpu"],
    metricsEnabled: true,
    metricsInterval: 30,
  }),
  forceKeyboardInteractive: true,
  overrideCredentialUsername: false,
  notes: "main box",
  macAddress: "aa:bb:cc:dd:ee:ff",
  enableSsh: true,
  enableRdp: true,
  enableVnc: true,
  enableTelnet: true,
  rdpUser: "admin",
  rdpPassword: "rdp-pass",
  rdpDomain: "CORP",
  rdpPort: 3390,
  vncUser: "v",
  vncPassword: "vnc-pass",
  vncPort: 5901,
  telnetUser: "t",
  telnetPassword: "tel-pass",
  telnetPort: 2323,
};

test("a host keeps every field across save and load", async () => {
  const { repos } = setup();
  const saved = await repos.hosts.create(fullHost);
  const [loaded] = await repos.hosts.list();
  expect(loaded).toEqual(saved);
  expect(loaded.syncId).toMatch(/^[0-9a-f-]{36}$/);
  expect(loaded).toMatchObject({
    name: "web",
    ip: "10.0.0.5",
    port: 2222,
    username: "deploy",
    folder: "Prod / Web",
    tags: ["prod", "web"],
    pin: true,
    authType: "password",
    password: "hunter2",
    enableTerminal: true,
    enableTunnel: true,
    enableFileManager: true,
    enableDocker: true,
    defaultPath: "/srv",
    jumpHosts: [{ hostId: 7 }],
    forceKeyboardInteractive: true,
    notes: "main box",
    macAddress: "aa:bb:cc:dd:ee:ff",
    enableSsh: true,
    enableRdp: true,
    enableVnc: true,
    enableTelnet: true,
    rdpUser: "admin",
    rdpPassword: "rdp-pass",
    rdpDomain: "CORP",
    rdpPort: 3390,
    vncUser: "v",
    vncPassword: "vnc-pass",
    vncPort: 5901,
    telnetUser: "t",
    telnetPassword: "tel-pass",
    telnetPort: 2323,
  } satisfies Partial<SSHHost>);
  expect(loaded.tunnelConnections).toHaveLength(1);
  expect(JSON.parse(loaded.statsConfig!)).toMatchObject({
    enabledWidgets: ["cpu"],
    metricsEnabled: true,
    metricsInterval: 30,
  });
});

test("rows use the server's wire shape", async () => {
  const { repos, stores } = setup();
  await repos.hosts.create(fullHost);
  const { db } = await stores.get("local");
  const [row] = db.select().from(hostsTable).all();
  expect(row.tags).toBe("prod,web");
  expect(row.forceKeyboardInteractive).toBe("true");
  expect(JSON.parse(row.pluginSettings!)).toMatchObject({
    "ssh-terminal": { enableTerminal: true },
    "file-manager": { enableFileManager: true, defaultPath: "/srv" },
    docker: { enableDocker: true },
    tunnels: { enableTunnel: true },
    "remote-desktop": { enableRdp: true, rdpPort: 3390 },
    "wake-on-lan": { macAddress: "aa:bb:cc:dd:ee:ff" },
    "host-metrics": { metricsEnabled: true, metricsInterval: 30 },
  });
  expect(JSON.parse(row.protocolAuth!)).toEqual({
    rdp: {
      authType: "direct",
      username: "admin",
      password: "rdp-pass",
      fields: { domain: "CORP" },
      credentialId: null,
    },
    vnc: {
      authType: "direct",
      username: "v",
      password: "vnc-pass",
      fields: {},
      credentialId: null,
    },
    telnet: {
      authType: "direct",
      username: "t",
      password: "tel-pass",
      fields: {},
      credentialId: null,
    },
  });
});

test("an update keeps secrets it was not given and clears other auth types", async () => {
  const { repos } = setup();
  const host = await repos.hosts.create(fullHost);
  const kept = await repos.hosts.update(host.id, {
    ...fullHost,
    password: undefined,
    rdpPassword: undefined,
    enableVnc: false,
  });
  expect(kept.password).toBe("hunter2");
  expect(kept.rdpPassword).toBe("rdp-pass");
  expect(kept.vncPassword).toBeUndefined();
  expect(kept.syncId).toBe(host.syncId);

  const cred = await repos.credentials.create({
    name: "key",
    authType: "key",
    username: "root",
    key: "PRIVATE",
  });
  const switched = await repos.hosts.update(host.id, {
    ...fullHost,
    authType: "credential",
    credentialId: cred.id,
  });
  expect(switched.password).toBeUndefined();
  expect(switched.credentialId).toBe(cred.id);

  await repos.credentials.remove(cred.id);
  expect((await repos.hosts.get(host.id))?.credentialId).toBeUndefined();
});

test("missing rows give a clear error", async () => {
  const { repos } = setup();
  await expect(repos.hosts.update(99, fullHost)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(await repos.hosts.get(99)).toBeNull();
});

test("credentials round trip and keep secrets on update", async () => {
  const { repos } = setup();
  const cred = await repos.credentials.create({
    name: "deploy key",
    authType: "key",
    username: "deploy",
    key: "PRIVATE",
    publicKey: "ssh-ed25519 AAA",
    keyPassword: "pp",
    tags: ["a", "b"],
  });
  expect(cred).toMatchObject({
    name: "deploy key",
    key: "PRIVATE",
    publicKey: "ssh-ed25519 AAA",
    keyPassword: "pp",
    tags: ["a", "b"],
    usageCount: 0,
  });
  const renamed = await repos.credentials.update(cred.id, { name: "renamed" });
  expect(renamed).toMatchObject({ name: "renamed", key: "PRIVATE" });
  await expect(repos.credentials.create({ name: " " })).rejects.toMatchObject({
    code: "VALIDATION_ERROR",
  });
});

test("snippets, folders, rename and reorder", async () => {
  const { repos } = setup();
  await repos.snippetFolders.create({ name: "ops" });
  await expect(
    repos.snippetFolders.create({ name: "ops" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const a = await repos.snippets.create({
    name: "uptime",
    content: "uptime",
    folder: "ops",
  });
  const b = await repos.snippets.create({ name: "df", content: "df -h" });
  await repos.snippets.reorder([
    { id: b.id, order: 0 },
    { id: a.id, order: 1, folder: "ops" },
  ]);
  expect((await repos.snippets.list()).map((s) => s.name)).toEqual([
    "df",
    "uptime",
  ]);

  await repos.snippetFolders.rename("ops", "admin");
  expect((await repos.snippets.get(a.id))?.folder).toBe("admin");
  expect((await repos.snippetFolders.list()).map((f) => f.name)).toEqual([
    "admin",
  ]);

  await repos.snippetFolders.remove("admin");
  expect((await repos.snippets.get(a.id))?.folder).toBeNull();
  expect(await repos.snippetFolders.list()).toEqual([]);

  const edited = await repos.snippets.update(b.id, { content: "df -H" });
  expect(edited).toMatchObject({ name: "df", content: "df -H" });
  await repos.snippets.remove(b.id);
  expect(await repos.snippets.get(b.id)).toBeNull();
});

test("command history is per host, newest first, no repeats, capped", async () => {
  const { repos } = setup();
  const host = await repos.hosts.create(fullHost);
  const other = await repos.hosts.create({ ...fullHost, name: "other" });
  const now = jest.spyOn(Date.prototype, "toISOString");
  let tick = 0;
  // Every write gets a later time, so order is exact.
  now.mockImplementation(
    () => `2026-01-01T00:00:${String(tick++).padStart(6, "0")}Z`,
  );

  await repos.commandHistory.add(host, "ls");
  await repos.commandHistory.add(host, "pwd");
  await repos.commandHistory.add(host, "ls");
  await repos.commandHistory.add(host, "  ");
  await repos.commandHistory.add(other, "whoami");
  expect(await repos.commandHistory.list(host)).toEqual(["ls", "pwd"]);

  await repos.commandHistory.remove(host, "ls");
  expect(await repos.commandHistory.list(host)).toEqual(["pwd"]);

  for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
    await repos.commandHistory.add(host, `cmd ${i}`);
  }
  const list = await repos.commandHistory.list(host);
  expect(list).toHaveLength(HISTORY_LIMIT);
  expect(list[0]).toBe(`cmd ${HISTORY_LIMIT + 4}`);

  await repos.commandHistory.clear(host);
  expect(await repos.commandHistory.list(host)).toEqual([]);
  expect(await repos.commandHistory.list(other)).toEqual(["whoami"]);
  now.mockRestore();
});

test("recent activity keeps the newest entries", async () => {
  const { repos } = setup();
  await repos.recentActivity.add({ kind: "terminal", title: "web" });
  await repos.recentActivity.add({ kind: "files", title: "db" });
  const list = await repos.recentActivity.list();
  expect(list.map((e) => e.title)).toEqual(
    expect.arrayContaining(["web", "db"]),
  );
});

test("writes tell subscribers, other accounts stay quiet", async () => {
  const { stores, repos } = setup();
  const other = localRepositories("srv", stores);
  const mine = jest.fn();
  const theirs = jest.fn();
  repos.hosts.subscribe(mine);
  other.hosts.subscribe(theirs);
  const host = await repos.hosts.create(fullHost);
  await repos.hosts.remove(host.id);
  expect(mine).toHaveBeenCalledTimes(2);
  expect(theirs).not.toHaveBeenCalled();
  expect(await other.hosts.list()).toEqual([]);
});

test("everything waits for App Lock", async () => {
  const { stores, repos } = setup();
  stores.lock();
  await expect(repos.hosts.list()).rejects.toMatchObject({
    code: "APP_LOCKED",
  });
});

test("lists hear about an unlock, so a read made while locked can retry", async () => {
  const { stores, repos } = setup();
  stores.lock();
  const listener = jest.fn();
  repos.hosts.subscribe(listener);
  stores.lock();
  expect(listener).not.toHaveBeenCalled();
  stores.unlock();
  expect(listener).toHaveBeenCalledTimes(1);
});

test("history found by host id alone lands on the host's syncId", async () => {
  const { repos } = setup();
  const host = await repos.hosts.create(fullHost);
  // The terminal only knows the id.
  await repos.commandHistory.add({ id: host.id } as SSHHost, "uptime");
  expect(await repos.commandHistory.list(host)).toEqual(["uptime"]);
  expect(await repos.commandHistory.list({ id: host.id } as SSHHost)).toEqual([
    "uptime",
  ]);
});

test("connect profiles carry the login, options and saved key", async () => {
  const { repos, stores } = setup();
  const cred = await repos.credentials.create({
    name: "deploy key",
    authType: "key",
    username: "deploy",
    key: "KEY",
    keyPassword: "kp",
    certPublicKey: "CERT",
  } as never);
  const host = await repos.hosts.create({
    ...fullHost,
    authType: "credential",
    credentialId: cred.id,
  });
  const { db } = await stores.get("local");
  db.update(hostsTable)
    .set({
      sshOptions: JSON.stringify({ keepaliveInterval: 10 }),
      useSocks5: true,
      socks5Host: "proxy",
      socks5Port: 1081,
      socks5ProxyChain: JSON.stringify([{ host: "a", port: 1, type: 5 }]),
      portKnockSequence: JSON.stringify([{ port: 7000 }]),
    })
    .run();

  const p = (await repos.connect!.profile(host.id))!;
  expect(p.host.id).toBe(host.id);
  expect(p.credential).toMatchObject({
    username: "deploy",
    key: "KEY",
    keyPassword: "kp",
    certPublicKey: "CERT",
  });
  expect(p.sshOptions).toEqual({ keepaliveInterval: 10 });
  expect(p.socks5).toMatchObject({ use: true, host: "proxy", port: 1081 });
  expect(p.socks5.chain).toHaveLength(1);
  expect(p.portKnock).toEqual([{ port: 7000 }]);
  expect(p.hostKey).toBeNull();
  expect(await repos.connect!.profile(9999)).toBeNull();
});

test("host keys save like the server and count changes", async () => {
  const { repos, stores } = setup();
  const host = await repos.hosts.create(fullHost);
  const key = { fingerprint: "abcd", keyType: "ssh-ed25519" };
  await repos.connect!.saveHostKey(host.id, key, false);
  expect((await repos.connect!.profile(host.id))!.hostKey).toEqual({
    ...key,
    changedCount: 0,
  });

  const { db } = await stores.get("local");
  const first = db.select().from(hostsTable).get()!;
  await repos.connect!.saveHostKey(
    host.id,
    { fingerprint: "ef01", keyType: "ssh-rsa" },
    true,
  );
  const row = db.select().from(hostsTable).get()!;
  expect(row.hostKeyFingerprint).toBe("ef01");
  expect(row.hostKeyChangedCount).toBe(1);
  expect(row.hostKeyFirstSeen).toBe(first.hostKeyFirstSeen);
  expect(row.hostKeyAlgorithm).toBe("sha256");

  await repos.connect!.touchHostKey(host.id);
  expect(db.select().from(hostsTable).get()!.hostKeyLastVerified).toBeTruthy();
  await expect(
    repos.connect!.saveHostKey(9999, key, false),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("a host's origin saves in its ssh-terminal settings and survives an edit", async () => {
  const { repos, stores } = setup();
  const host = await repos.hosts.create(fullHost);
  expect(await repos.origins.get(host)).toBeUndefined();

  await repos.origins.set(host.id, "server");
  expect(await repos.origins.get({ id: host.id })).toBe("server");
  const { db } = await stores.get("local");
  const settings = JSON.parse(
    db.select().from(hostsTable).get()!.pluginSettings!,
  );
  expect(settings["ssh-terminal"]).toEqual({
    enableTerminal: true,
    connectFrom: "server",
  });

  // The host editor rewrites the block, but keeps keys it doesn't edit.
  await repos.hosts.update(host.id, { ...fullHost, enableTerminal: false });
  const after = JSON.parse(db.select().from(hostsTable).get()!.pluginSettings!);
  expect(after["ssh-terminal"]).toEqual({
    enableTerminal: false,
    connectFrom: "server",
  });
  expect((await repos.hosts.get(host.id))!.connectFrom).toBe("server");
  await expect(repos.origins.set(9999, "auto")).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});

test("host terminal settings, sudo password and ssh options round trip", async () => {
  const { repos } = setup();
  const saved = await repos.hosts.create({
    ...fullHost,
    sudoPassword: "root-pass",
    terminalConfig: { theme: "nord", autoTmux: true, startupSnippetId: "s-1" },
    sshOptions: {
      keepaliveInterval: 15,
      environmentVariables: [{ key: "EDITOR", value: "vim" }],
    },
  });
  const loaded = (await repos.hosts.get(saved.id))!;
  expect(loaded.sudoPassword).toBe("root-pass");
  expect(loaded.terminalConfig).toEqual({
    theme: "nord",
    autoTmux: true,
    startupSnippetId: "s-1",
  });
  expect(loaded.sshOptions).toEqual({
    keepaliveInterval: 15,
    environmentVariables: [{ key: "EDITOR", value: "vim" }],
  });
  expect(loaded.pluginSettings?.["ssh-terminal"]).toMatchObject({
    theme: "nord",
    autoTmux: true,
  });

  // Undefined keeps the stored secret and options, an empty string clears.
  await repos.hosts.update(saved.id, { ...fullHost });
  const kept = (await repos.hosts.get(saved.id))!;
  expect(kept.sudoPassword).toBe("root-pass");
  expect(kept.sshOptions?.keepaliveInterval).toBe(15);
  await repos.hosts.update(saved.id, { ...fullHost, sudoPassword: "" });
  expect((await repos.hosts.get(saved.id))!.sudoPassword).toBeUndefined();
});

test("snippets keep the note flag", async () => {
  const { repos } = setup();
  const note = await repos.snippets.create({
    name: "n",
    content: "text",
    isNote: true,
  });
  expect((await repos.snippets.get(note.id))!.isNote).toBe(true);
  await repos.snippets.update(note.id, { name: "n2" });
  expect((await repos.snippets.get(note.id))!.isNote).toBe(true);
  await repos.snippets.update(note.id, { isNote: false });
  expect((await repos.snippets.get(note.id))!.isNote).toBe(false);
});

test("merged history goes below what the phone has, in the given order", async () => {
  const { repos } = setup();
  const host = await repos.hosts.create(fullHost);
  await repos.commandHistory.add(host, "ls");
  const changes = jest.fn();
  const off = repos.commandHistory.subscribe(changes);
  await repos.commandHistory.merge(host, ["top", "ls", " df ", ""]);
  off();
  expect(await repos.commandHistory.list(host)).toEqual(["ls", "top", "df"]);
  await new Promise((r) => setTimeout(r, 0));
  expect(changes).toHaveBeenCalled();
  // Nothing new, nothing written.
  await repos.commandHistory.merge(host, ["top"]);
  expect(await repos.commandHistory.list(host)).toEqual(["ls", "top", "df"]);
});

test("host prefs are kept per host and can be removed", async () => {
  const { repos } = setup();
  const a = await repos.hosts.create(fullHost);
  const b = await repos.hosts.create({ ...fullHost, name: "b" });
  await repos.hostPrefs.set(a, "keyLayout", "{}");
  await repos.hostPrefs.set(a, "keyLayout", "two");
  expect(await repos.hostPrefs.get(a, "keyLayout")).toBe("two");
  expect(await repos.hostPrefs.get(b, "keyLayout")).toBeNull();
  // A bare id finds the same host.
  const bare = { id: a.id } as SSHHost;
  expect(await repos.hostPrefs.get(bare, "keyLayout")).toBe("two");
  await repos.hostPrefs.set(a, "keyLayout", null);
  expect(await repos.hostPrefs.get(a, "keyLayout")).toBeNull();
});

test("metric samples keep one point a minute per host and a week of them", async () => {
  const { repos } = setup();
  const a = await repos.hosts.create(fullHost);
  const b = await repos.hosts.create({ ...fullHost, name: "b" });
  const point = (ts: number, cpu: number) => ({
    ts,
    cpu,
    mem: 50,
    disk: 10,
    rx: null,
    tx: null,
  });
  const t0 = Date.UTC(2026, 9, 1);
  await repos.metricSamples.append(a, point(t0, 1));
  await repos.metricSamples.append(a, point(t0 + 30_000, 2));
  await repos.metricSamples.append(a, point(t0 + 60_000, 3));
  await repos.metricSamples.append(b, point(t0, 9));
  expect((await repos.metricSamples.range(a, 0)).map((p) => p.cpu)).toEqual([
    1, 3,
  ]);
  expect(await repos.metricSamples.range(a, t0 + 1)).toHaveLength(1);
  // A point a week later drops everything older than a week.
  const later = t0 + 8 * 24 * 3600_000;
  await repos.metricSamples.append(a, point(later, 4));
  expect((await repos.metricSamples.range(a, 0)).map((p) => p.cpu)).toEqual([
    4,
  ]);
  expect(await repos.metricSamples.range(b, 0)).toHaveLength(0);
});

test("hosts reorder and bulk update, and shared copies stay as they are", async () => {
  const { stores, repos } = setup();
  const a = await repos.hosts.create({ ...fullHost, name: "a", pin: false });
  const b = await repos.hosts.create({ ...fullHost, name: "b", pin: false });
  const db = (await stores.get("local")).db;
  const shared = db
    .insert(hostsTable)
    .values({
      name: "shared",
      ip: "10.0.0.9",
      port: 22,
      username: "u",
      authType: "password",
      syncId: "s-1",
      sharedSource: JSON.stringify({ owner: "x", permissionLevel: "view" }),
    } as never)
    .returning()
    .get();

  await repos.hosts.reorder([
    { id: b.id, sortOrder: 0 },
    { id: a.id, sortOrder: 1 },
    { id: shared.id, sortOrder: 2 },
  ]);
  await repos.hosts.bulkUpdate([a.id, b.id, shared.id], {
    pin: true,
    folder: " Lab ",
  });

  const byName = Object.fromEntries(
    (await repos.hosts.list()).map((h) => [h.name, h]),
  );
  expect(byName.b.sortOrder).toBe(0);
  expect(byName.a.sortOrder).toBe(1);
  expect(byName.a.pin).toBe(true);
  expect(byName.a.folder).toBe("Lab");
  expect(byName.shared.sortOrder).toBeNull();
  expect(byName.shared.pin).toBe(false);

  await repos.hosts.bulkUpdate([a.id], { folder: "" });
  expect((await repos.hosts.get(a.id))?.folder).toBe("");
});

test("a host's color and icon round trip and stay when an edit leaves them out", async () => {
  const { repos } = setup();
  const saved = await repos.hosts.create({
    ...fullHost,
    color: "#22c55e",
    icon: "database",
  });
  expect(saved).toMatchObject({ color: "#22c55e", icon: "database" });
  const kept = await repos.hosts.update(saved.id, { ...fullHost });
  expect(kept).toMatchObject({ color: "#22c55e", icon: "database" });
  const cleared = await repos.hosts.update(saved.id, {
    ...fullHost,
    color: null,
    icon: null,
  });
  expect(cleared).toMatchObject({ color: null, icon: null });
});

test("lists asked at the same time share one read, and a later list sees new hosts", async () => {
  const { repos } = setup();
  await repos.hosts.create(fullHost);
  const [a, b] = await Promise.all([repos.hosts.list(), repos.hosts.list()]);
  expect(a).toHaveLength(1);
  expect(a).not.toBe(b);
  expect(a[0]).toBe(b[0]);
  await repos.hosts.create({ ...fullHost, name: "second" });
  expect(await repos.hosts.list()).toHaveLength(2);
});

describe("sub-hosts", () => {
  const base: SSHHostData = {
    ip: "10.0.0.9",
    port: 22,
    username: "root",
    authType: "password",
    password: "x",
  };

  test("a host saves under a parent host and leaves its folder", async () => {
    const { repos } = setup();
    const parent = await repos.hosts.create({
      ...base,
      name: "p",
      folder: "Lab",
    });
    const child = await repos.hosts.create({
      ...base,
      name: "c",
      folder: "Lab",
      parentHostId: parent.id,
    });
    expect(child).toMatchObject({ parentHostId: parent.id, folder: "" });

    // An edit that leaves the parent out keeps it.
    const kept = await repos.hosts.update(child.id, { ...base, name: "c2" });
    expect(kept.parentHostId).toBe(parent.id);

    // A folder replaces the parent, like the server.
    const moved = await repos.hosts.update(child.id, {
      ...base,
      folder: "Web",
    });
    expect(moved).toMatchObject({ parentHostId: null, folder: "Web" });
  });

  test("self, loop, missing and shared parents are refused", async () => {
    const { repos, stores } = setup();
    const a = await repos.hosts.create({ ...base, name: "a" });
    const b = await repos.hosts.create({
      ...base,
      name: "b",
      parentHostId: a.id,
    });
    await expect(
      repos.hosts.update(a.id, { ...base, parentHostId: a.id }),
    ).rejects.toThrow("own parent");
    await expect(
      repos.hosts.update(a.id, { ...base, parentHostId: b.id }),
    ).rejects.toThrow("own sub-hosts");
    await expect(
      repos.hosts.create({ ...base, parentHostId: 999 }),
    ).rejects.toThrow("Parent host not found");

    const { db } = await stores.get("local");
    const shared = db
      .insert(hostsTable)
      .values({
        syncId: "shared-1",
        ip: "10.0.0.2",
        port: 22,
        username: "u",
        authType: "password",
        sharedSource: JSON.stringify({ owner: "x", permissionLevel: "view" }),
      })
      .returning()
      .get();
    await expect(
      repos.hosts.bulkUpdate([a.id], { parentHostId: shared.id }),
    ).rejects.toThrow("Parent host not found");
  });

  test("bulk moves go under a host or back to a folder", async () => {
    const { repos } = setup();
    const p = await repos.hosts.create({ ...base, name: "p" });
    const a = await repos.hosts.create({ ...base, name: "a", folder: "Lab" });
    const b = await repos.hosts.create({ ...base, name: "b" });
    await repos.hosts.bulkUpdate([a.id, b.id], { parentHostId: p.id });
    expect(await repos.hosts.get(a.id)).toMatchObject({
      parentHostId: p.id,
      folder: "",
    });
    await repos.hosts.bulkUpdate([a.id], { folder: "Web" });
    expect(await repos.hosts.get(a.id)).toMatchObject({
      parentHostId: null,
      folder: "Web",
    });
  });

  test("deleting a parent leaves its sub-hosts at the top", async () => {
    const { repos } = setup();
    const p = await repos.hosts.create({ ...base, name: "p" });
    const c = await repos.hosts.create({
      ...base,
      name: "c",
      parentHostId: p.id,
    });
    await repos.hosts.remove(p.id);
    expect((await repos.hosts.get(c.id))?.parentHostId).toBeNull();
  });
});
