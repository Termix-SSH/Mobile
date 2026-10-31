import { AccountStore } from "@/core/accounts/store";
import { LOCAL_ACCOUNT_ID, accountLabel } from "@/core/accounts/types";
import { plainStore, accountStorage } from "@/core/storage/kv";
import { resetStorage } from "../../helpers/http";

beforeEach(resetStorage);

function store() {
  let n = 0;
  return new AccountStore({
    newId: () => `id${++n}`,
    now: () => "2026-10-22T00:00:00.000Z",
  });
}

test("a fresh install has only This device, and it is active", async () => {
  const s = store();
  await s.init();
  expect(s.list().map((a) => a.id)).toEqual([LOCAL_ACCOUNT_ID]);
  expect(s.active().kind).toBe("local");
  expect(s.activeClient()).toBeNull();
  expect(accountLabel(s.active())).toBe("This device");
});

test("adding a server does not switch to it", async () => {
  const s = store();
  await s.init();
  const added = await s.add("https://termix.example/");
  expect(added.serverUrl).toBe("https://termix.example");
  expect(added.status).toBe("signed_out");
  expect(s.active().id).toBe(LOCAL_ACCOUNT_ID);
  await s.setActive(added.id);
  expect(s.active().id).toBe(added.id);
  expect(s.activeClient()?.serverUrl).toBe("https://termix.example");
});

test("each server gets its own client, reused across calls", async () => {
  const s = store();
  await s.init();
  const a = await s.add("https://a.example");
  const b = await s.add("https://b.example");
  expect(s.client(a.id)).toBe(s.client(a.id));
  expect(s.client(a.id)).not.toBe(s.client(b.id));
  expect(s.client(LOCAL_ACCOUNT_ID)).toBeNull();
});

test("accounts and the active one survive a restart", async () => {
  const s = store();
  await s.init();
  const a = await s.add("https://a.example");
  await s.setActive(a.id);
  const again = new AccountStore();
  await again.init();
  expect(again.list().map((x) => x.id)).toEqual([LOCAL_ACCOUNT_ID, a.id]);
  expect(again.active().id).toBe(a.id);
});

test("removing follows the desktop rules", async () => {
  const s = store();
  await s.init();
  const a = await s.add("https://a.example");
  await s.setActive(a.id);
  await expect(s.remove(LOCAL_ACCOUNT_ID)).rejects.toThrow(/can't be removed/);
  await expect(s.remove(a.id)).rejects.toThrow(/Switch to another account/);
  await s.setActive(LOCAL_ACCOUNT_ID);
  await s.remove(a.id);
  expect(s.list()).toHaveLength(1);
});

test("removing an account wipes its secrets", async () => {
  const s = store();
  await s.init();
  const a = await s.add("https://a.example");
  await s.client(a.id)!.setToken("secret-token");
  await s.remove(a.id);
  expect(await accountStorage(a.id).secrets.get("session")).toBeNull();
});

test("removing an account deletes its local database", async () => {
  const wipeLocalData = jest.fn(async () => {});
  const s = new AccountStore({ newId: () => "srv", wipeLocalData });
  await s.init();
  const a = await s.add("https://a.example");
  await s.remove(a.id);
  expect(wipeLocalData).toHaveBeenCalledWith("srv");
});

test("updates notify subscribers and keep the snapshot stable between them", async () => {
  const s = store();
  await s.init();
  const before = s.getSnapshot();
  expect(s.getSnapshot()).toBe(before);
  const listener = jest.fn();
  s.subscribe(listener);
  const a = await s.add("https://a.example");
  await s.update(a.id, { username: "luke", status: "idle" });
  expect(listener).toHaveBeenCalledTimes(2);
  expect(s.getSnapshot()).not.toBe(before);
  expect(s.findByUrl("https://A.example/")?.username).toBe("luke");
});

test("a saved active id that no longer exists falls back to This device", async () => {
  await plainStore.setJson("accounts.v1", { accounts: [], activeId: "gone" });
  const s = store();
  await s.init();
  expect(s.active().id).toBe(LOCAL_ACCOUNT_ID);
});

test("a pending server stays out of lists until it is confirmed", async () => {
  const s = store();
  await s.init();
  const pending = await s.add("https://p.example", { pending: true });
  expect(s.list().map((a) => a.id)).toEqual([LOCAL_ACCOUNT_ID]);
  expect(s.findByUrl("https://p.example")).toBeNull();
  expect(s.findPending("https://p.example/")?.id).toBe(pending.id);
  expect(s.client(pending.id)).not.toBeNull();
  await s.confirm(pending.id);
  expect(s.list().map((a) => a.id)).toEqual([LOCAL_ACCOUNT_ID, pending.id]);
  expect(s.find(pending.id)).not.toHaveProperty("pending");
});

test("a dropped or left over pending server is wiped", async () => {
  const wiped: string[] = [];
  let n = 0;
  const make = () =>
    new AccountStore({
      newId: () => `id${++n}`,
      wipeLocalData: async (id) => {
        wiped.push(id);
      },
    });
  const s = make();
  await s.init();
  const a = await s.add("https://a.example", { pending: true });
  await s.discardPending(a.id);
  expect(s.find(a.id)).toBeNull();
  const b = await s.add("https://b.example", { pending: true });
  // The app closed mid link; the next start drops it.
  const again = make();
  await again.init();
  expect(again.find(b.id)).toBeNull();
  expect(wiped).toEqual([a.id, b.id]);
});
