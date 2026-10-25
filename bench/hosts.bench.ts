import { localRepositories } from "@/core/data/local";
import {
  applyFilters,
  buildHostTree,
  collectFolderPaths,
  collectMatchingFolderPaths,
  DEFAULT_FILTERS,
  filterTreeByQuery,
  flattenTree,
  folderCounts,
  sortHostTree,
  type GetHostStatus,
} from "@/screens/hosts/navigation/hostTree";
import type { SSHHostData } from "@/types";
import { bigHostList } from "../tests/helpers/fixtures-big";
import { testStores } from "../tests/helpers/db";
import { bench, benchAsync } from "./bench";

const hosts = bigHostList(2000);
const statuses = new Map(
  hosts.map((h) => [h.id, h.id % 3 ? "online" : "offline"]),
);
const getStatus: GetHostStatus = (id) =>
  (statuses.get(id) as "online" | "offline") ?? "unknown";

// What the Hosts screen does after one status change: filter, sort, flatten,
// then every visible folder row counts its hosts.
function statusFlip(query: string) {
  const tree = buildHostTree(hosts);
  let nodes = applyFilters(tree, DEFAULT_FILTERS, getStatus);
  nodes = filterTreeByQuery(nodes, query);
  nodes = sortHostTree(nodes, "default", getStatus);
  const expanded = new Set(collectFolderPaths(tree));
  collectMatchingFolderPaths(tree, query).forEach((p) => expanded.add(p));
  const rows = flattenTree(nodes, expanded);
  for (const row of rows)
    if (row.kind === "folder") folderCounts(row.node, getStatus);
  return rows;
}

test("host list, 2,000 hosts", async () => {
  const tree = buildHostTree(hosts);
  bench("hosts: build tree", () => buildHostTree(hosts));
  bench("hosts: sort default", () => sortHostTree(tree, "default", getStatus));
  bench("hosts: sort name", () => sortHostTree(tree, "name-asc", getStatus));
  bench("hosts: search one keystroke", () => filterTreeByQuery(tree, "web-eu"));
  bench("hosts: status flip, no search", () => statusFlip(""));
  bench("hosts: status flip, with search", () => statusFlip("db"));

  const { stores } = testStores();
  const repos = localRepositories("bench", stores);
  for (const host of hosts) {
    const { id: _id, createdAt: _c, updatedAt: _u, ...data } = host;
    await repos.hosts.create(data as SSHHostData);
  }
  await benchAsync("hosts: list from the local database", () =>
    repos.hosts.list(),
  );
});
