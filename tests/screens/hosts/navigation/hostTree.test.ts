import {
  DEFAULT_FILTERS,
  applyFilters,
  buildHostTree,
  flattenTree,
  folderCountMap,
  folderCounts,
  reorderInFolder,
  sortHostTree,
} from "@/screens/hosts/navigation/hostTree";
import type { SSHHost } from "@/types";

const host = (id: number, extra: Partial<SSHHost>) =>
  ({ id, name: `h${id}`, ip: `10.0.0.${id}`, folder: "", ...extra }) as SSHHost;

const hosts = [
  host(1, {}),
  host(2, { enableSsh: false, enableRdp: true }),
  host(3, { enableDocker: true }),
];
const ids = (nodes: any[]): number[] =>
  nodes.flatMap((n) => (n.kind === "host" ? [n.host.id] : ids(n.children)));

test("ssh is a built in filter, others come from matchers", () => {
  const tree = buildHostTree(hosts);
  const status = () => "online" as const;
  expect(
    ids(applyFilters(tree, { ...DEFAULT_FILTERS, protocol: ["ssh"] }, status)),
  ).toEqual([1, 3]);
  const matchers = {
    rdp: (h: SSHHost) => !!h.enableRdp,
    docker: (h: SSHHost) => !!h.enableDocker,
  };
  expect(
    ids(
      applyFilters(
        tree,
        { ...DEFAULT_FILTERS, protocol: ["rdp"] },
        status,
        matchers,
      ),
    ),
  ).toEqual([2]);
  expect(
    ids(
      applyFilters(
        tree,
        { ...DEFAULT_FILTERS, features: ["docker"] },
        status,
        matchers,
      ),
    ),
  ).toEqual([3]);
});

test("a saved filter for a feature that is gone matches nothing", () => {
  const tree = buildHostTree(hosts);
  expect(
    ids(
      applyFilters(
        tree,
        { ...DEFAULT_FILTERS, features: ["gone"] },
        () => "online",
      ),
    ),
  ).toEqual([]);
});

describe("manual order and drag", () => {
  const unknown = () => "unknown" as const;
  const list = [
    host(1, { name: "c", folder: "Prod" }),
    host(2, { name: "a", folder: "Prod", sortOrder: 1 }),
    host(3, { name: "b", folder: "Prod", sortOrder: 0 }),
    host(4, { name: "z", folder: "Prod / Db" }),
    host(5, { name: "x" }),
  ];
  const tree = sortHostTree(buildHostTree(list), "default", unknown);
  const open = new Set(["Prod", "Prod / Db", "No Folder"]);

  test("default sort follows the manual order, then name", () => {
    const rows = flattenTree(tree, open);
    expect(rows.map((r: any) => r.key)).toEqual([
      "f:Prod",
      "f:Prod / Db",
      "h:4",
      "h:3",
      "h:2",
      "h:1",
      "f:No Folder",
      "h:5",
    ]);
    const db: any = rows.find((r: any) => r.key === "h:4");
    expect(db.folderPath).toBe("Prod / Db");
    expect(db.depth).toBe(2);
  });

  test("closed folders hide their rows", () => {
    const rows = flattenTree(tree, new Set(["Prod"]));
    expect(rows.map((r: any) => r.key)).toEqual([
      "f:Prod",
      "f:Prod / Db",
      "h:3",
      "h:2",
      "h:1",
      "f:No Folder",
    ]);
  });

  test("a drag inside the folder gives the new order", () => {
    const before = flattenTree(tree, open);
    const move = (from: number, to: number) => {
      const after = [...before];
      const [row] = after.splice(from, 1);
      after.splice(to, 0, row);
      return reorderInFolder(before, after, row.key);
    };
    // h:1 to the top of Prod's hosts.
    expect(move(5, 3)).toEqual([
      { id: 1, sortOrder: 0 },
      { id: 3, sortOrder: 1 },
      { id: 2, sortOrder: 2 },
    ]);
    // Into another folder, or above its own subfolder: refused.
    expect(move(5, 7)).toBeNull();
    expect(move(3, 1)).toBeNull();
    // Dropped where it was.
    expect(move(4, 4)).toBeNull();
  });
});

test("the folder count map matches counting each folder on its own", () => {
  const list = [
    host(1, { folder: "a" }),
    host(2, { folder: "a / b" }),
    host(3, { folder: "a / b" }),
    host(4, { folder: "c" }),
  ];
  const tree = buildHostTree(list);
  const status = (id: number): "online" | "offline" =>
    id % 2 ? "online" : "offline";
  const map = folderCountMap(tree as any, status);
  expect(map.get("a")).toEqual({ total: 3, online: 2 });
  expect(map.get("a / b")).toEqual({ total: 2, online: 1 });
  expect(map.get("c")).toEqual(folderCounts(tree[1] as any, status));
});

test("flattening keeps depth and order for nested open folders", () => {
  const tree = buildHostTree([
    host(1, { folder: "a / b" }),
    host(2, { folder: "a" }),
  ]);
  const rows = flattenTree(tree, new Set(["a", "a / b"]));
  expect(rows.map((r) => [r.key, r.depth])).toEqual([
    ["f:a", 0],
    ["f:a / b", 1],
    ["h:1", 2],
    ["h:2", 1],
  ]);
});
