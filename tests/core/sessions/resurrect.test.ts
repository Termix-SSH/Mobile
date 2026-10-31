import {
  loadSavedTabs,
  restoreTabs,
  saveTabs,
  toSavedTab,
  type SavedTab,
} from "@/core/sessions/resurrect";
import { plainStore } from "@/core/storage/kv";

const host = (over: object = {}) =>
  ({ id: 7, name: "Box", ip: "box.lan", password: "secret", ...over }) as any;

const tab = (over: object = {}) => ({
  id: "7-terminal-1",
  type: "terminal",
  accountId: "local",
  host: host(),
  title: "Box",
  isActive: true,
  createdAt: new Date(1000),
  instanceId: "inst",
  backendSessionId: null,
  ...over,
});

test("a saved tab keeps how to find it again, never the host's secrets", () => {
  const saved = toSavedTab(
    tab({
      transport: "relay",
      backendSessionId: "s1",
      customTitle: "prod",
      resumeData: { tmux: "main" },
    }),
  );
  expect(saved).toEqual({
    id: "7-terminal-1",
    type: "terminal",
    accountId: "local",
    hostId: 7,
    serverHost: false,
    title: "Box",
    instanceId: "inst",
    backendSessionId: "s1",
    remoteProtocol: undefined,
    origin: undefined,
    transport: "relay",
    listed: undefined,
    customTitle: "prod",
    resumeData: { tmux: "main" },
    active: true,
    createdAt: 1000,
  });
  expect(JSON.stringify(saved)).not.toContain("secret");

  // A server copy of a synced host is found again by its local id.
  expect(
    toSavedTab(tab({ host: host({ id: 900, localId: 7 }) })),
  ).toMatchObject({ hostId: 7, serverHost: true });
});

test("tabs round trip through storage; bad data reads as nothing", async () => {
  const saved = toSavedTab(tab());
  await saveTabs([saved]);
  expect(await loadSavedTabs()).toEqual([saved]);

  await plainStore.setJson("sessions.openTabs", {
    v: 1,
    tabs: [{ id: 1 }, saved],
  });
  expect(await loadSavedTabs()).toEqual([saved]);
  await plainStore.setJson("sessions.openTabs", { v: 99, tabs: [saved] });
  expect(await loadSavedTabs()).toEqual([]);

  await saveTabs([]);
  expect(await plainStore.get("sessions.openTabs")).toBeNull();
});

test("restore finds hosts again, drops gone ones and keeps unknown ones for later", async () => {
  const a: SavedTab = toSavedTab(tab());
  const gone: SavedTab = { ...a, id: "gone", hostId: 8 };
  const offline: SavedTab = { ...a, id: "later", hostId: 9 };
  const noAccount: SavedTab = { ...a, id: "acct", accountId: "removed" };
  const result = await restoreTabs([a, gone, offline, noAccount], {
    accountExists: (id) => id === "local",
    findHost: async (t) => {
      if (t.hostId === 7) return host();
      if (t.hostId === 8) return null;
      throw new Error("offline");
    },
  });
  expect(result.restored.map((r) => r.saved.id)).toEqual(["7-terminal-1"]);
  expect(result.restored[0].host.name).toBe("Box");
  expect(result.missing.map((t) => t.id)).toEqual(["gone", "acct"]);
  expect(result.later.map((t) => t.id)).toEqual(["later"]);
});
