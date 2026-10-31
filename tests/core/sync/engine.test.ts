import { eq } from "drizzle-orm";
import {
  credentials,
  folders,
  hosts,
  snippetFolders,
  snippets,
  syncEntities,
} from "@/core/db/schema";
import { AccountClient } from "@/core/api/AccountClient";
import { batches, SyncEngine } from "@/core/sync/engine";
import { SyncRemote } from "@/core/sync/remote";
import { SyncBook } from "@/core/sync/store";
import { accountStorage } from "@/core/storage/kv";
import type { PushOp } from "@/core/sync/protocol";
import { resetStorage } from "../../helpers/http";
import { testStores } from "../../helpers/db";
import { FakeSyncServer } from "../../helpers/syncServer";

const HOST = "44444444-4444-4444-8444-444444444444";
const JUMP = "33333333-3333-4333-8333-333333333333";
const CRED = "11111111-1111-4111-8111-111111111111";
const SNIPPET = "66666666-6666-4666-8666-666666666666";

beforeEach(resetStorage);

async function setup(options: { disabled?: string[]; seed?: boolean } = {}) {
  const server = new FakeSyncServer({ seed: options.seed });
  const client = new AccountClient({
    accountId: "acct",
    serverUrl: "https://termix.example",
    storage: accountStorage("acct"),
  });
  await client.setToken(server.token);
  const { stores } = testStores();
  const emitted: string[] = [];
  const profiles: unknown[] = [];
  const disabled = options.disabled ?? [];
  const engine = new SyncEngine({
    open: () => stores.openForSync("acct"),
    remote: new SyncRemote(client),
    disabledTypes: () => disabled,
    emit: (tables) => emitted.push(...tables),
    onProfile: (row) => profiles.push(row),
  });
  const { db } = await stores.openForSync("acct");
  return {
    server,
    engine,
    db,
    emitted,
    profiles,
    disabled,
    book: new SyncBook(db),
  };
}

test("the first pass pulls the recorded server into the phone's copy", async () => {
  const { engine, db, emitted, profiles, book } = await setup();
  const summary = await engine.pass();
  expect(summary.first).toBe(true);
  expect(summary.pushed).toBe(0);

  const web = db.select().from(hosts).where(eq(hosts.syncId, HOST)).get()!;
  const cred = db
    .select()
    .from(credentials)
    .where(eq(credentials.syncId, CRED))
    .get()!;
  const jump = db.select().from(hosts).where(eq(hosts.syncId, JUMP)).get()!;
  expect(web.credentialId).toBe(cred.id);
  expect(JSON.parse(web.jumpHosts!)).toEqual([{ hostId: jump.id }]);
  expect(web.pin).toBe(false);
  expect(JSON.parse(web.pluginSettings!)["ssh-terminal"].enableTerminal).toBe(
    true,
  );
  expect(cred.password).toBe("deploy-pass");
  expect(db.select().from(folders).all()).toHaveLength(1);
  expect(db.select().from(snippetFolders).all()).toHaveLength(1);
  expect(db.select().from(snippets).get()!.folder).toBe("Ops");
  expect(profiles).toEqual([
    expect.objectContaining({ username: "fixture", isAdmin: true }),
  ]);
  expect(emitted).toContain("ssh_data");

  const state = book.state();
  expect(state.knownTypes).toEqual(
    expect.arrayContaining(["hosts", "snippets", "workspaces"]),
  );
  expect(state.cursor).toBe(8);
  expect(state.lastSyncAt).not.toBeNull();
});

test("a second pass with nothing new pushes nothing", async () => {
  const { server, engine } = await setup();
  await engine.pass();
  const again = await engine.pass();
  expect(again.pushed).toBe(0);
  expect(server.pushes).toHaveLength(0);
});

test("a local edit is pushed with the revision the phone last saw", async () => {
  const { server, engine, db } = await setup();
  await engine.pass();
  db.update(hosts)
    .set({ notes: "from the phone" })
    .where(eq(hosts.syncId, HOST))
    .run();
  const summary = await engine.pass();
  expect(summary.pushed).toBe(1);
  const [op] = server.pushes[0];
  expect(op).toMatchObject({
    entityType: "hosts",
    syncId: HOST,
    op: "upsert",
    baseRevision: 1,
  });
  expect(op.row).toMatchObject({
    notes: "from the phone",
    credentialSyncId: CRED,
    jumpHosts: JSON.stringify([{ hostId: JUMP }]),
  });
  expect(server.get("hosts", HOST)!.revision).toBe(2);
  expect((await engine.pass()).pushed).toBe(0);
});

test("new local rows and deletes go up", async () => {
  const { server, engine, db } = await setup();
  await engine.pass();
  db.insert(snippets)
    .values({ syncId: "new-1", name: "df", content: "df -h" })
    .run();
  db.delete(snippets).where(eq(snippets.syncId, SNIPPET)).run();
  await engine.pass();
  const ops = server.pushes.flat();
  expect(ops).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        syncId: "new-1",
        op: "upsert",
        baseRevision: 0,
      }),
      expect.objectContaining({
        syncId: SNIPPET,
        op: "delete",
        baseRevision: 1,
      }),
    ]),
  );
  expect(server.get("snippets", SNIPPET)!.deleted).toBe(true);
});

test("server edits and deletes come down", async () => {
  const { server, engine, db } = await setup();
  await engine.pass();
  const row = server.get("hosts", HOST)!.row!;
  server.put("hosts", HOST, { ...row, name: "web-1 renamed" });
  server.put("snippets", SNIPPET, null, true);
  const summary = await engine.pass();
  expect(summary.pulled).toBe(2);
  expect(
    db.select().from(hosts).where(eq(hosts.syncId, HOST)).get()!.name,
  ).toBe("web-1 renamed");
  expect(db.select().from(snippets).all()).toHaveLength(0);
});

test("when both sides edit, the server wins and the phone's version is kept", async () => {
  const { server, engine, db, book } = await setup();
  await engine.pass();
  db.update(hosts).set({ notes: "phone" }).where(eq(hosts.syncId, HOST)).run();
  const row = server.get("hosts", HOST)!.row!;
  server.put("hosts", HOST, { ...row, notes: "desktop" });

  const summary = await engine.pass();
  expect(summary.conflicts).toBe(1);
  expect(
    db.select().from(hosts).where(eq(hosts.syncId, HOST)).get()!.notes,
  ).toBe("desktop");
  const [conflict] = book.conflicts();
  expect(conflict).toMatchObject({
    entityType: "hosts",
    syncId: HOST,
    serverRevision: 2,
  });
  expect(conflict.localRow.notes).toBe("phone");
  expect((await engine.pass()).pushed).toBe(0);
});

test("a refused change is not sent again until it changes", async () => {
  const { server, engine, db, book } = await setup();
  await engine.pass();
  server.entityTypes = server.entityTypes.map((t) =>
    t.type === "snippets" ? { ...t, readOnly: true } : t,
  );
  db.update(snippets).set({ content: "uptime -p" }).run();
  expect((await engine.pass()).rejected).toBe(1);
  expect(book.errors()[0]).toMatchObject({
    syncId: SNIPPET,
    error: "read_only",
  });
  await engine.pass();
  expect(server.pushes).toHaveLength(1);
  db.update(snippets).set({ content: "uptime -s" }).run();
  await engine.pass();
  expect(server.pushes).toHaveLength(2);
});

test("a switched off kind is neither pulled nor pushed, and comes back whole", async () => {
  const { server, engine, db, disabled } = await setup({
    disabled: ["snippets", "snippetFolders"],
  });
  await engine.pass();
  expect(db.select().from(snippets).all()).toHaveLength(0);
  db.insert(snippets)
    .values({ syncId: "mine", name: "local", content: "ls" })
    .run();
  server.put("snippets", "srv-2", {
    name: "server only",
    content: "w",
    order: 1,
  });
  await engine.pass();
  expect(server.pushes.flat().some((op) => op.entityType === "snippets")).toBe(
    false,
  );

  disabled.length = 0;
  await engine.pass();
  const names = db
    .select()
    .from(snippets)
    .all()
    .map((s) => s.name)
    .sort();
  expect(names).toEqual(["local", "server only", "uptime"]);
  expect(server.get("snippets", "mine")).toBeDefined();
});

test("server fields the phone has no column for go back unchanged", async () => {
  const { server, engine, db } = await setup();
  const row = server.get("hosts", HOST)!.row!;
  server.put("hosts", HOST, { ...row, futureField: { keep: true } });
  await engine.pass();
  db.update(hosts).set({ notes: "edit" }).where(eq(hosts.syncId, HOST)).run();
  await engine.pass();
  const pushed = server.pushes.flat().find((op) => op.syncId === HOST)!;
  expect(pushed.row).toMatchObject({
    futureField: { keep: true },
    notes: "edit",
  });
});

test("types the phone has no table for are kept as they came", async () => {
  const { server, engine, db } = await setup();
  server.put("workspaces", "w1", { name: "Morning" });
  await engine.pass();
  const kept = db
    .select()
    .from(syncEntities)
    .where(eq(syncEntities.syncId, "w1"))
    .get();
  expect(JSON.parse(kept!.data)).toMatchObject({
    name: "Morning",
    syncId: "w1",
  });
});

test("a record the server lost starts over instead of looping", async () => {
  const { server, engine, db, book } = await setup();
  await engine.pass();
  server.lose("snippets", SNIPPET);
  db.update(snippets).set({ content: "uptime -p" }).run();
  await engine.pass();
  expect(book.record("snippets", SNIPPET)!.revision).toBe(0);
  await engine.pass();
  const last = server.pushes.at(-1)!.find((op) => op.syncId === SNIPPET)!;
  expect(last.baseRevision).toBe(0);
  expect(server.get("snippets", SNIPPET)!.row!.content).toBe("uptime -p");
});

test("shared hosts land read only with the server's id and never go up", async () => {
  const { server, engine, db } = await setup();
  const row = server.get("hosts", JUMP)!.row!;
  server.put("sharedHosts", "shared-1", {
    ...row,
    name: "their box",
    shared: { hostId: 99, owner: "alice", permissionLevel: "connect" },
  });
  await engine.pass();
  const shared = db
    .select()
    .from(hosts)
    .where(eq(hosts.syncId, "shared-1"))
    .get()!;
  expect(shared.serverId).toBe(99);
  expect(JSON.parse(shared.sharedSource!)).toMatchObject({ owner: "alice" });
  db.update(hosts)
    .set({ notes: "x" })
    .where(eq(hosts.syncId, "shared-1"))
    .run();
  await engine.pass();
  expect(server.pushes.flat().some((op) => op.syncId === "shared-1")).toBe(
    false,
  );
});

test("pushes are split under the server's limits", () => {
  const op = (i: number, size = 10): PushOp => ({
    entityType: "snippets",
    syncId: String(i),
    baseRevision: 0,
    op: "upsert",
    row: { content: "x".repeat(size) },
  });
  expect(
    batches(Array.from({ length: 450 }, (_, i) => op(i))).map((b) => b.length),
  ).toEqual([200, 200, 50]);
  expect(
    batches([op(1, 700_000), op(2, 700_000)]).map((b) => b.length),
  ).toEqual([1, 1]);
});

test("a signed out device stops with the server's reason", async () => {
  const { server, engine } = await setup();
  server.revoked = true;
  await expect(engine.pass()).rejects.toMatchObject({
    kind: "signed_out",
    serverMessage: "Invalid token",
  });
});
