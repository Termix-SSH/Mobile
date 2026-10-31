import {
  filterIdOf,
  parseHostFilter,
  serializeHostFilter,
  targetHosts,
} from "@/features/snippets/targets";
import type { SSHHost } from "@/types";

const host = (id: number, serverId?: number) =>
  ({ id, serverId, name: `h${id}` }) as SSHHost;

test("a filter reads as a list of numbers", () => {
  expect(parseHostFilter("[1,2,3]")).toEqual([1, 2, 3]);
  expect(parseHostFilter('[1,"2",null]')).toEqual([1]);
  expect(parseHostFilter("nope")).toEqual([]);
  expect(parseHostFilter('{"a":1}')).toEqual([]);
  expect(parseHostFilter(null)).toEqual([]);
});

test("a filter is saved without repeats, or as null when empty", () => {
  expect(serializeHostFilter([2, 1, 2])).toBe("[2,1]");
  expect(serializeHostFilter([])).toBeNull();
});

test("a server list uses the server's ids, This device the phone's", () => {
  expect(filterIdOf(host(5, 50), "server")).toBe(50);
  expect(filterIdOf(host(5), "server")).toBe(5);
  expect(filterIdOf(host(5, 50), "local")).toBe(5);
});

test("target hosts are found by the right id", () => {
  const hosts = [host(1, 10), host(2, 20), host(3)];
  expect(
    targetHosts({ hostFilter: "[20,3]" }, hosts, "server").map((h) => h.id),
  ).toEqual([2, 3]);
  expect(
    targetHosts({ hostFilter: "[1]" }, hosts, "local").map((h) => h.id),
  ).toEqual([1]);
  expect(targetHosts({ hostFilter: null }, hosts, "local")).toEqual([]);
});
