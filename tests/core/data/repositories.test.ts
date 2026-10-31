import { AccountClient } from "@/core/api/AccountClient";
import {
  emptyRepositories,
  repositoriesFor,
  serverRepositories,
} from "@/core/data/repositories";
import { hosts } from "@/core/db/schema";
import { localStores } from "@/core/db/stores";
import { accountStorage } from "@/core/storage/kv";
import { fakeServer, resetStorage } from "../../helpers/http";
import { testDriver } from "../../helpers/db";

beforeEach(async () => {
  await resetStorage();
  localStores.setDriver(testDriver());
  localStores.unlock();
});

test("This device saves into its encrypted store", async () => {
  const repos = repositoriesFor({ id: "local", kind: "local" }, null);
  expect(repos.source).toBe("local");
  expect(await repos.hosts.list()).toEqual([]);
  await repos.snippets.create({ name: "up", content: "uptime" });
  expect((await repos.snippets.list()).map((s) => s.name)).toEqual(["up"]);
  expect(repositoriesFor({ id: "local", kind: "local" }, null)).toBe(repos);
});

test("with no store (web) reads are empty and writes refuse", async () => {
  localStores.setDriver(null);
  const repos = repositoriesFor({ id: "local", kind: "local" }, null);
  expect(repos).toBe(emptyRepositories);
  expect(await repos.hosts.list()).toEqual([]);
  await expect(repos.credentials.create({})).rejects.toMatchObject({
    code: "NO_LOCAL_STORE",
  });
});

test("linked servers read through the account client and signal writes", async () => {
  const seen = fakeServer((req) =>
    req.url.endsWith("/credentials")
      ? { data: { credentials: [{ id: 1, name: "root key" }] } }
      : { data: { id: 2, name: "new" } },
  );
  const client = new AccountClient({
    accountId: "a",
    serverUrl: "https://t.example",
    storage: accountStorage("a"),
  });
  const repos = repositoriesFor({ id: "a", kind: "server" } as any, client);
  expect(repos.source).toBe("server");
  expect(await repos.credentials.list()).toEqual([{ id: 1, name: "root key" }]);

  const changed = jest.fn();
  repos.credentials.subscribe(changed);
  await repos.credentials.create({ name: "new" });
  expect(changed).toHaveBeenCalledTimes(1);

  await repos.snippets.list();
  expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual([
    "GET https://t.example/credentials",
    "POST https://t.example/credentials",
    "GET https://t.example/snippets",
  ]);
  expect(repositoriesFor({ id: "a", kind: "server" } as any, client)).toBe(
    repos,
  );
});

test("a server keeps a host's origin, or the phone does when it can't", async () => {
  let refuse = false;
  const seen = fakeServer((req) =>
    req.method === "PUT" && refuse
      ? { status: 400, data: { error: "connectFrom is not declared" } }
      : { data: {} },
  );
  const client = new AccountClient({
    accountId: "b",
    serverUrl: "https://t.example",
    storage: accountStorage("b"),
  });
  client.apiGeneration = "plugin";
  const repos = repositoriesFor({ id: "b", kind: "server" } as any, client);
  const changed = jest.fn();
  repos.hosts.subscribe(changed);

  await repos.origins.set(4, "device");
  const put = seen.find((r) => r.method === "PUT")!;
  expect(put.url).toBe(
    "https://t.example/plugins/ssh-terminal/settings/host/4",
  );
  expect(put.data).toEqual({ connectFrom: "device" });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(await repos.origins.get({ id: 4 })).toBe("device");
  expect(await accountStorage("b").data.getJson("hostOrigins")).toEqual({});

  // An older ssh-terminal refuses the key; the phone keeps the choice.
  refuse = true;
  await repos.origins.set(5, "server");
  expect(await accountStorage("b").data.getJson("hostOrigins")).toEqual({
    "5": "server",
  });
  expect(await repos.origins.get({ id: 5 })).toBe("server");

  // Another repos instance (after a restart) reads the phone copy, and the
  // server's own value wins when the host carries one.
  const fresh = serverRepositories(client, accountStorage("b").data);
  expect(await fresh.origins.get({ id: 5 })).toBe("server");
  expect(await fresh.origins.get({ id: 6, connectFrom: "auto" })).toBe("auto");
  expect(await fresh.origins.get({ id: 7 })).toBeUndefined();
});

test("with no store an origin can't be saved", async () => {
  localStores.setDriver(null);
  const repos = repositoriesFor({ id: "local", kind: "local" }, null);
  expect(await repos.origins.get({ id: 1 })).toBeUndefined();
  await expect(repos.origins.set(1, "auto")).rejects.toMatchObject({
    code: "NO_LOCAL_STORE",
  });
});

test("a linked server that syncs reads its own copy, and shared rows are read only", async () => {
  const client = new AccountClient({
    accountId: "s1",
    serverUrl: "https://t.example",
    storage: accountStorage("s1"),
  });
  const account = { id: "s1", kind: "server", options: { sync: true } } as any;
  const repos = repositoriesFor(account, client);
  expect(repos.source).toBe("local");
  expect(repos.connect).toBeDefined();

  const { db } = await localStores.get("s1");
  db.insert(hosts)
    .values({
      syncId: "sh",
      name: "theirs",
      ip: "1.2.3.4",
      port: 22,
      username: "r",
      authType: "password",
      sharedSource: JSON.stringify({
        owner: "alice",
        permissionLevel: "connect",
      }),
      serverId: 7,
    })
    .run();
  const [host] = await repos.hosts.list();
  expect(host).toMatchObject({
    serverId: 7,
    shared: { owner: "alice", permissionLevel: "connect" },
  });
  await expect(repos.hosts.remove(host.id)).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
  // Without a store (web) the same account reads live.
  localStores.setDriver(null);
  expect(repositoriesFor(account, client).source).toBe("server");
});

test("a live server reorders and bulk updates hosts through the host routes", async () => {
  const seen = fakeServer(() => ({ data: {} }));
  const client = new AccountClient({
    accountId: "c",
    serverUrl: "https://t.example",
    storage: accountStorage("c"),
  });
  const repos = repositoriesFor({ id: "c", kind: "server" } as any, client);
  const changed = jest.fn();
  repos.hosts.subscribe(changed);

  await repos.hosts.reorder([{ id: 3, sortOrder: 0 }]);
  await repos.hosts.bulkUpdate([3, 4], { pin: true });

  expect(seen.map((r) => `${r.method} ${r.url}`)).toEqual([
    "PUT https://t.example/host/reorder",
    "PATCH https://t.example/host/bulk-update",
  ]);
  expect(seen[1].data).toEqual({
    hostIds: [3, 4],
    updates: { pin: true },
  });
  expect(changed).toHaveBeenCalledTimes(2);
});
