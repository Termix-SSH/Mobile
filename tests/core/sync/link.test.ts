import { eq } from "drizzle-orm";
import { accounts } from "@/core/accounts";
import type { ServerAccount } from "@/core/accounts/types";
import { hosts, snippets } from "@/core/db/schema";
import { localStores } from "@/core/db/stores";
import { secureStore } from "@/core/storage/kv";
import { SyncEngine } from "@/core/sync/engine";
import {
  linkAccount,
  mergeThisDevice,
  thisDeviceHasData,
  unlinkAccount,
} from "@/core/sync/link";
import { SyncRemote } from "@/core/sync/remote";
import { fakeServer, resetStorage } from "../../helpers/http";
import { testDriver } from "../../helpers/db";
import { FakeSyncServer } from "../../helpers/syncServer";

let server: FakeSyncServer;
let account: ServerAccount;

beforeEach(async () => {
  await resetStorage();
  localStores.setDriver(testDriver());
  localStores.unlock();
  server = new FakeSyncServer();
  account = await accounts.add("https://termix.example");
  await accounts.client(account.id)!.setToken(server.loginToken);
});

afterEach(async () => {
  await accounts.setActive("local");
  for (const a of accounts.list()) {
    if (a.kind === "server") await accounts.remove(a.id);
  }
});

const find = (id: string) => accounts.find(id) as ServerAccount;

async function pass(id: string) {
  await new SyncEngine({
    open: () => localStores.openForSync(id),
    remote: new SyncRemote(accounts.client(id)!),
    disabledTypes: () => [],
    emit: () => {},
  }).pass();
}

test("linking trades the login for a device session and turns on sync", async () => {
  const outcome = await linkAccount(account.id);
  expect(outcome).toEqual({ synced: true, firstLink: true });
  expect(accounts.client(account.id)!.token()).toBe(server.token);
  const linked = find(account.id);
  expect(linked).toMatchObject({
    remoteUserId: "<user-id>",
    username: "fixture",
    serverName: "Termix",
    serverVersion: "26.10.5",
    status: "idle",
    options: expect.objectContaining({ sync: true, linkedOnce: true }),
  });
  const body = server.seen.find((r) => r.url.endsWith("/sync/v2/link"))!
    .data as {
    deviceId: string;
    clientType: string;
  };
  expect(body.clientType).toBe("mobile");
  expect(body.deviceId).toMatch(/^mobile-/);
  expect(await secureStore.get("device.id")).toBe(body.deviceId);

  // Signing in again is not a first link, and keeps the same device id.
  await accounts.client(account.id)!.setToken(server.loginToken);
  expect((await linkAccount(account.id)).firstLink).toBe(false);
  const again = server.seen.filter((r) => r.url.endsWith("/sync/v2/link"))[1];
  expect((again.data as { deviceId: string }).deviceId).toBe(body.deviceId);
});

test("a server without sync stays on live reads", async () => {
  fakeServer(() => ({
    status: 404,
    data: "<pre>Cannot GET /sync/v2/info</pre>",
    headers: { "content-type": "text/html" },
  }));
  const outcome = await linkAccount(account.id);
  expect(outcome).toMatchObject({ synced: false, reason: "no_sync" });
  expect(find(account.id).options.sync).toBe(false);
  expect(accounts.client(account.id)!.token()).toBe(server.loginToken);
});

test("signing in as someone else is refused and the new session given back", async () => {
  await accounts.update(account.id, {
    remoteUserId: "someone-else",
    username: "bob",
  });
  await expect(linkAccount(account.id)).rejects.toMatchObject({
    kind: "different_account",
  });
  expect(server.revoked).toBe(true);
  expect(accounts.client(account.id)!.token()).toBeNull();
  expect(find(account.id)).toMatchObject({
    status: "signed_out",
    lastError: "different_account",
  });
});

test("Merge brings This device's own rows over, skipping lookalikes", async () => {
  const local = (await localStores.get("local")).db;
  expect(await thisDeviceHasData()).toBe(false);
  local
    .insert(hosts)
    .values([
      // Same as the server's web-1: skipped.
      {
        syncId: "l1",
        name: "web-1",
        ip: "10.0.0.5",
        port: 22,
        username: "root",
        authType: "password",
      },
      {
        syncId: "l2",
        name: "nas",
        ip: "10.0.0.9",
        port: 22,
        username: "admin",
        authType: "password",
      },
    ])
    .run();
  expect(await thisDeviceHasData()).toBe(true);

  await linkAccount(account.id);
  await pass(account.id);
  const result = await mergeThisDevice(account.id);
  expect(result).toEqual({ copied: 1, skipped: 1 });
  await pass(account.id);

  const pushedNames = server.pushes.flat().map((op) => op.row?.name);
  expect(pushedNames).toEqual(["nas"]);
  // This device keeps its own copy.
  expect(local.select().from(hosts).all()).toHaveLength(2);
});

test("unlink with Keep copies own rows to This device and removes the account", async () => {
  await linkAccount(account.id);
  await pass(account.id);
  const stopped: string[] = [];
  const result = await unlinkAccount(account.id, {
    keep: true,
    stop: (id) => stopped.push(id),
  });
  expect(result.copied).toBeGreaterThan(0);
  expect(stopped).toEqual([account.id]);
  expect(server.revoked).toBe(true);
  expect(accounts.find(account.id)).toBeNull();

  const local = (await localStores.get("local")).db;
  const web = local.select().from(hosts).where(eq(hosts.name, "web-1")).get()!;
  expect(web.syncId).not.toBe("44444444-4444-4444-8444-444444444444");
  expect(web.credentialId).not.toBeNull();
  expect(local.select().from(snippets).all()).toHaveLength(1);
});

test("unlink with Delete keeps nothing", async () => {
  await linkAccount(account.id);
  await pass(account.id);
  await accounts.setActive(account.id);
  const result = await unlinkAccount(account.id, { keep: false });
  expect(result.copied).toBe(0);
  expect(accounts.active().id).toBe("local");
  const local = (await localStores.get("local")).db;
  expect(local.select().from(hosts).all()).toHaveLength(0);
});
