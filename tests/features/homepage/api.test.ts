import {
  cachedItems,
  clearHomepageCache,
  fetchServiceLinks,
  orderItems,
  parseConfig,
  parseItems,
} from "@/features/homepage/api";
import { homepageInstances } from "@/features/homepage/register";

const get = jest.fn();
const client: any = { accountId: "s1", http: { auth: { get } } };

const rows = [
  { id: 5, typeId: "service_grid", title: "Media", config: '{"columns":4}' },
  { id: 6, typeId: "service_grid", title: "Services", config: "{bad" },
  { id: 7, typeId: "folder", title: "Group", config: "{}" },
  { id: 8, typeId: "clock", title: null, config: "{}" },
];
const layout = {
  layout: {
    version: 2,
    entries: [
      { itemId: 6, x: 6, y: 0, w: 6, h: 210 },
      { itemId: 5, x: 0, y: 0, w: 6, h: 210 },
      { itemId: 7, x: 0, y: 9, w: 12, h: 36 },
    ],
  },
};

beforeEach(() => {
  get.mockReset();
  clearHomepageCache();
  get.mockImplementation(async (url: string) => {
    if (url.endsWith("/items")) return { data: rows };
    if (url.endsWith("/layout")) return { data: layout };
    if (url.endsWith("/service-links")) {
      return {
        data: [
          { id: 2, label: "B", url: "https://b.example", order: 1 },
          { id: 1, label: "A", url: "https://a.example", order: 0 },
          { id: 3, label: "broken" },
        ],
      };
    }
    throw new Error(url);
  });
});

test("configs come as text or objects, bad JSON is empty", () => {
  expect(parseConfig('{"a":1}')).toEqual({ a: 1 });
  expect(parseConfig({ a: 1 })).toEqual({ a: 1 });
  expect(parseConfig("{bad")).toEqual({});
  expect(parseConfig("[1]")).toEqual({});
  expect(parseConfig(null)).toEqual({});
});

test("rows without an id or type are dropped", () => {
  expect(parseItems([{ id: 1 }, { typeId: "x" }, null, rows[0]])).toEqual([
    {
      id: 5,
      typeId: "service_grid",
      title: "Media",
      config: { columns: 4 },
    },
  ]);
  expect(parseItems("nope")).toEqual([]);
});

test("items follow the grid top to bottom, left to right, unplaced last", () => {
  const order = orderItems(parseItems(rows), layout).map((i) => i.id);
  expect(order).toEqual([5, 6, 7, 8]);
});

test("items load from the plugin's routes and are shared for a moment", async () => {
  const first = await cachedItems(client);
  await cachedItems(client);
  expect(first.map((i) => i.id)).toEqual([5, 6, 7, 8]);
  expect(get).toHaveBeenCalledWith("/plugin-api/homepage/items");
  expect(get).toHaveBeenCalledTimes(2);
  await cachedItems(client, true);
  expect(get).toHaveBeenCalledTimes(4);
});

test("a missing layout still lists every item", async () => {
  get.mockImplementation(async (url: string) => {
    if (url.endsWith("/items")) return { data: rows };
    throw new Error("404");
  });
  expect((await cachedItems(client)).map((i) => i.id)).toEqual([5, 6, 7, 8]);
});

test("service links come back in their order, broken ones dropped", async () => {
  const links = await fetchServiceLinks(client);
  expect(links.map((l) => l.label)).toEqual(["A", "B"]);
});

test("one Home card per widget, folders skipped, service links off at first", async () => {
  const list = await homepageInstances({
    account: { id: "s1", kind: "server" },
    client,
  } as any);
  expect(list).toEqual([
    { key: "5", title: "Media" },
    { key: "6", title: "Services" },
    { key: "8", title: "Clock" },
    { key: "links", title: "Service links", defaultOn: false },
  ]);
  expect(
    await homepageInstances({
      account: { kind: "local" },
      client: null,
    } as any),
  ).toEqual([]);
});
