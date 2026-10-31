import {
  addRecent,
  clearRecent,
  clearRecentCache,
  listRecent,
  recordRecent,
  resolveRecent,
  RECENT_LIMIT,
} from "@/core/hosts/recent";
import { resetStorage } from "../../helpers/http";

beforeEach(async () => {
  await resetStorage();
  clearRecentCache();
});

const host = (id: number, syncId?: string) =>
  ({ id, syncId, name: `h${id}`, ip: "10.0.0.1" }) as any;

test("addRecent puts the host first, drops its old entry and caps the list", () => {
  let list = addRecent([], host(1, "a"), "t1");
  list = addRecent(list, host(2), "t2");
  list = addRecent(list, host(1, "a"), "t3");
  expect(list.map((r) => r.hostId)).toEqual([1, 2]);
  expect(list[0].at).toBe("t3");
  for (let i = 10; i < 30; i++) list = addRecent(list, host(i));
  expect(list).toHaveLength(RECENT_LIMIT);
});

test("a host matches by syncId even when its local id changed", () => {
  const list = addRecent([], host(5, "s5"));
  expect(resolveRecent(list, [host(9, "s5")]).map((h) => h.id)).toEqual([9]);
  expect(resolveRecent(list, [host(5)]).map((h) => h.id)).toEqual([5]);
  expect(resolveRecent(list, [host(6)])).toEqual([]);
});

test("recordRecent keeps each account apart and survives a reload", async () => {
  await recordRecent("local", host(1));
  await recordRecent("s1", host(2));
  clearRecentCache();
  expect((await listRecent("local")).map((r) => r.hostId)).toEqual([1]);
  expect((await listRecent("s1")).map((r) => r.hostId)).toEqual([2]);
});

test("clearRecent forgets the list for that account only", async () => {
  await recordRecent("a", host(1));
  await recordRecent("b", host(2));
  await clearRecent("a");
  expect(await listRecent("a")).toEqual([]);
  clearRecentCache();
  expect(await listRecent("a")).toEqual([]);
  expect((await listRecent("b")).map((r) => r.hostId)).toEqual([2]);
});
