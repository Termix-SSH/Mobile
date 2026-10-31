import { eq } from "drizzle-orm";
import { accounts } from "@/core/accounts";
import type { ServerAccount } from "@/core/accounts/types";
import { changes } from "@/core/db/changes";
import { hosts, snippets } from "@/core/db/schema";
import { localStores } from "@/core/db/stores";
import { SyncManager } from "@/core/sync/manager";
import {
  resolveConflict,
  retryRejected,
  setKindEnabled,
} from "@/core/sync/settings";
import { SyncBook } from "@/core/sync/store";
import {
  clearSnippetIds,
  hostStatusesByLocalId,
  serverHostConfig,
  serverHostId,
  serverSnippetId,
} from "@/core/sync/host-ids";
import { resetStorage } from "../../helpers/http";
import { testDriver } from "../../helpers/db";
import { FakeSyncServer } from "../../helpers/syncServer";
import { clearFakeNet, fakeNet } from "../../helpers/net";

const streams: {
  url: string;
  onEvent: (e: { event: string; data: string }) => void;
  onClose: (r: object) => void;
  closed: boolean;
}[] = [];

jest.mock("@/core/sync/events", () => ({
  openEventStream: (options: any) => {
    const stream = { ...options, closed: false };
    streams.push(stream);
    return () => {
      stream.closed = true;
    };
  },
}));

let server: FakeSyncServer;
let account: ServerAccount;
let manager: SyncManager;

beforeEach(async () => {
  await resetStorage();
  streams.length = 0;
  localStores.setDriver(testDriver());
  localStores.unlock();
  server = new FakeSyncServer();
  account = await accounts.add("https://termix.example");
  account = await accounts.update(account.id, {
    options: { sync: true, refreshCheckedAt: new Date().toISOString() },
  });
  await accounts.client(account.id)!.setToken(server.token);
  manager = new SyncManager(localStores);
});

afterEach(async () => {
  manager.stop();
  jest.useRealTimers();
  await accounts.setActive("local");
  for (const a of accounts.list()) {
    if (a.kind === "server") await accounts.remove(a.id);
  }
});

const find = () => accounts.find(account.id) as ServerAccount;
const db = async () => (await localStores.openForSync(account.id)).db;

test("a linked account syncs on start and opens a live stream", async () => {
  manager.start();
  await manager.syncNow(account.id);
  expect(manager.get(account.id)).toMatchObject({
    state: "idle",
    reason: null,
  });
  expect(find().lastSyncAt).not.toBeNull();
  expect(find().status).toBe("idle");
  expect((await db()).select().from(hosts).all()).toHaveLength(2);
  expect(streams).toHaveLength(1);
  expect(streams[0].url).toBe("https://termix.example/sync/v2/events");
});

test("a session that arrives after start still syncs", async () => {
  const client = accounts.client(account.id)!;
  await client.setToken(null);
  manager.start();
  expect(manager.get(account.id).state).not.toBe("idle");
  // A sign in changes the client only, not the account list.
  await client.setToken(server.token);
  await manager.syncNow(account.id);
  expect(manager.get(account.id).state).toBe("idle");
  expect(find().lastSyncAt).not.toBeNull();
});

test("a change event pulls, and a local edit pushes", async () => {
  manager.start();
  await manager.syncNow(account.id);
  const row = server.get(
    "snippets",
    "66666666-6666-4666-8666-666666666666",
  )!.row!;
  server.put("snippets", "66666666-6666-4666-8666-666666666666", {
    ...row,
    content: "uptime -p",
  });
  streams[0].onEvent({ event: "change", data: "{}" });
  await new Promise((r) => setTimeout(r, 700));
  await manager.syncNow(account.id);
  expect((await db()).select().from(snippets).get()!.content).toBe("uptime -p");

  jest.useFakeTimers();
  (await db()).update(snippets).set({ content: "w" }).run();
  changes.emit(account.id, "snippets");
  await jest.advanceTimersByTimeAsync(2_100);
  jest.useRealTimers();
  await manager.syncNow(account.id);
  expect(server.pushes.flat().map((op) => op.row?.content)).toEqual(["w"]);
});

test("an ended session stops syncing and says why", async () => {
  manager.start();
  server.revoked = true;
  await manager.syncNow(account.id);
  expect(manager.get(account.id)).toMatchObject({
    state: "signed_out",
    reason: "revoked",
  });
  expect(find()).toMatchObject({ status: "signed_out", lastError: "revoked" });
  expect(accounts.client(account.id)!.token()).toBeNull();
  const calls = server.seen.length;
  await new Promise((r) => setTimeout(r, 50));
  expect(server.seen.length).toBe(calls);
});

test("offline retries with backoff, proxy problems wait for the user", async () => {
  jest.useFakeTimers();
  const handle = (server as any).handle.bind(server);
  let fail = true;
  (server as any).handle = (req: any) =>
    fail ? new Error("Network Error") : handle(req);
  manager.start();
  await jest.advanceTimersByTimeAsync(10);
  expect(manager.get(account.id).state).toBe("offline");
  expect(find()).toMatchObject({ status: "offline", lastError: "offline" });
  fail = false;
  await jest.advanceTimersByTimeAsync(15_100);
  expect(manager.get(account.id).state).toBe("idle");
});

test("a proxy login page is reported and not retried on its own", async () => {
  jest.useFakeTimers();
  server.failNext = {
    status: 200,
    data: "<html>login</html>",
    headers: { "content-type": "text/html" },
  };
  manager.start();
  await jest.advanceTimersByTimeAsync(10);
  expect(manager.get(account.id)).toMatchObject({
    state: "error",
    reason: "proxy_login",
  });
  const calls = server.seen.length;
  await jest.advanceTimersByTimeAsync(20 * 60_000);
  expect(server.seen.length).toBe(calls);
  // The token is kept: the session itself is fine.
  expect(accounts.client(account.id)!.token()).toBe(server.token);
});

test("the device session is renewed before it runs out", async () => {
  await accounts.update(account.id, {
    options: { sync: true, refreshCheckedAt: "2020-01-01T00:00:00Z" },
  });
  server.refreshToken = "renewed";
  manager.start();
  await manager.syncNow(account.id);
  expect(accounts.client(account.id)!.token()).toBe("renewed");
  expect(Date.parse(String(find().options.refreshCheckedAt))).toBeGreaterThan(
    Date.parse("2026-01-01"),
  );
});

test("first sync with Merge copies This device after the server's rows", async () => {
  const local = (await localStores.get("local")).db;
  local
    .insert(snippets)
    .values({ syncId: "mine", name: "mine", content: "ls" })
    .run();
  manager.start();
  await manager.firstSync(account.id, true);
  expect(server.pushes.flat().map((op) => op.row?.name)).toEqual(["mine"]);
});

test("a background run syncs each linked server within its time", async () => {
  expect(await manager.runInBackground(10_000)).toBe(1);
  expect(find().lastSyncAt).not.toBeNull();
});

test("server ids come from shared rows, the row, then the server", async () => {
  manager.start();
  await manager.syncNow(account.id);
  const d = await db();
  const web = d
    .select()
    .from(hosts)
    .where(eq(hosts.syncId, "44444444-4444-4444-8444-444444444444"))
    .get()!;
  server.hostIds.set(web.syncId, 2);
  expect(
    await serverHostId(account.id, { id: web.id, syncId: web.syncId }),
  ).toBe(2);
  server.hostIds.clear();
  // Kept on the row now.
  expect(
    await serverHostId(account.id, { id: web.id, syncId: web.syncId }),
  ).toBe(2);
  expect(await serverHostId(account.id, { id: 5, serverId: 77 })).toBe(77);
  expect(await serverHostId("local", { id: 5, syncId: "x" })).toBe(5);
});

test("a quiet server is checked on a timer, never in a loop", async () => {
  jest.useFakeTimers();
  manager.start();
  await jest.advanceTimersByTimeAsync(10);
  const pulls = () =>
    server.seen.filter((r) => r.url.endsWith("/sync/v2/changes")).length;
  const first = pulls();
  expect(first).toBeGreaterThan(0);
  // The live stream drops; the next check waits a while.
  streams[0].onClose({});
  await jest.advanceTimersByTimeAsync(5_000);
  expect(pulls()).toBe(first);
  await jest.advanceTimersByTimeAsync(30_000);
  expect(pulls()).toBeGreaterThan(first);
  const second = pulls();
  await jest.advanceTimersByTimeAsync(5_000);
  expect(pulls()).toBe(second);
});

test("snippets, statuses and relay configs use the server's ids", async () => {
  manager.start();
  await manager.syncNow(account.id);
  const d = await db();
  const web = d
    .select()
    .from(hosts)
    .where(eq(hosts.syncId, "44444444-4444-4444-8444-444444444444"))
    .get()!;
  server.hostIds.set(web.syncId, 2);
  expect(
    await serverHostConfig(account.id, { id: web.id, syncId: web.syncId }),
  ).toEqual({ id: 2, syncId: web.syncId });

  const handle = (server as any).handle.bind(server);
  (server as any).handle = (req: any) => {
    if (req.url.endsWith("/snippets")) {
      return {
        data: [{ id: 41, syncId: "66666666-6666-4666-8666-666666666666" }],
      };
    }
    if (req.url.endsWith("/sync/v2/host-status")) {
      return { data: { [web.syncId]: { status: "online" } } };
    }
    return handle(req);
  };
  clearSnippetIds();
  expect(
    await serverSnippetId(account.id, {
      id: 1,
      syncId: "66666666-6666-4666-8666-666666666666",
    }),
  ).toBe(41);
  expect(
    await hostStatusesByLocalId(account.id, [
      { id: web.id, syncId: web.syncId },
      { id: 999, syncId: "gone" },
    ]),
  ).toEqual({ [web.id]: { status: "online" } });
});

test("a kind switched off and on again is pulled in full", async () => {
  manager.start();
  await manager.syncNow(account.id);
  await setKindEnabled(account.id, "snippets", false, localStores);
  expect(find().disabledTypes).toEqual(["snippets", "snippetFolders"]);
  server.put("snippets", "later", { name: "added while off", content: "w" });
  await manager.syncNow(account.id);
  expect((await db()).select().from(snippets).all()).toHaveLength(1);

  await setKindEnabled(account.id, "snippets", true, localStores);
  await manager.syncNow(account.id);
  const names = (await db())
    .select()
    .from(snippets)
    .all()
    .map((s) => s.name)
    .sort();
  expect(names).toEqual(["added while off", "uptime"]);
});

test("Keep mine puts the phone's version back and sends it", async () => {
  manager.start();
  await manager.syncNow(account.id);
  const id = "44444444-4444-4444-8444-444444444444";
  (await db())
    .update(hosts)
    .set({ notes: "phone" })
    .where(eq(hosts.syncId, id))
    .run();
  server.put("hosts", id, {
    ...server.get("hosts", id)!.row!,
    notes: "desktop",
  });
  await manager.syncNow(account.id);
  const book = new SyncBook(await db());
  const [conflict] = book.conflicts();
  await resolveConflict(account.id, conflict.id, "mine", localStores);
  await manager.syncNow(account.id);
  expect(server.get("hosts", id)!.row!.notes).toBe("phone");
  expect(book.conflicts()).toHaveLength(0);
});

test("refused changes can be tried again", async () => {
  manager.start();
  await manager.syncNow(account.id);
  server.entityTypes = server.entityTypes.map((t) =>
    t.type === "snippets" ? { ...t, readOnly: true } : t,
  );
  (await db()).update(snippets).set({ content: "x" }).run();
  await manager.syncNow(account.id);
  expect(new SyncBook(await db()).errors()).toHaveLength(1);
  server.entityTypes = server.entityTypes.map((t) =>
    t.type === "snippets" ? { ...t, readOnly: false } : t,
  );
  await retryRejected(account.id, localStores);
  expect(new SyncBook(await db()).errors()).toHaveLength(0);
});

test("a live server is still checked every few minutes for other devices' pushes", async () => {
  jest.useFakeTimers();
  manager.start();
  await jest.advanceTimersByTimeAsync(10);
  expect(streams.length).toBeGreaterThan(0);
  const pulls = () =>
    server.seen.filter((r) => r.url.endsWith("/sync/v2/changes")).length;
  const before = pulls();
  await jest.advanceTimersByTimeAsync(5 * 60_000 + 100);
  expect(pulls()).toBeGreaterThan(before);
});

test("a failed pass to a server whose key no longer matches its pin says so", async () => {
  jest.useFakeTimers();
  const net = fakeNet();
  await accounts.client(account.id)!.setCertPins(["K".repeat(43) + "="]);
  net.serverKey = "Z".repeat(43) + "=";
  (server as any).handle = () => new Error("Network Error");
  manager.start();
  await jest.advanceTimersByTimeAsync(10);
  expect(find()).toMatchObject({ status: "error", lastError: "pin_mismatch" });
  clearFakeNet();
});
