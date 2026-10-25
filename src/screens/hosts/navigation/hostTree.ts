import { SSHHost, HostTreeNode } from "@/types";

export type HostStatus = "online" | "offline" | "unknown";
export type GetHostStatus = (hostId: number) => HostStatus;

export const NO_FOLDER = "No Folder";
// One collator for every compare; localeCompare builds one per call on Hermes.
const ORDER = new Intl.Collator();
const compareText = (a: string, b: string) => ORDER.compare(a, b);
const FOLDER_SEP = " / ";

export type SortKey =
  | "default"
  | "name-asc"
  | "name-desc"
  | "ip-asc"
  | "ip-desc"
  | "status-online"
  | "status-offline"
  | "pinned";

export type FilterState = {
  status: ("online" | "offline" | "pinned")[];
  /** Filter values; features add their own through the registry. */
  protocol: string[];
  features: string[];
  tags: string[];
};

export const DEFAULT_FILTERS: FilterState = {
  status: [],
  protocol: [],
  features: [],
  tags: [],
};

/** Tests a host against one protocol or feature filter value. */
export type HostMatchers = Record<string, (host: SSHHost) => boolean>;

// SSH is not a plugin, so its filter lives here.
const CORE_MATCHERS: HostMatchers = {
  ssh: (host) =>
    host.enableSsh ??
    (!host.enableRdp && !host.enableVnc && !host.enableTelnet),
};

export function isFolder(
  node: HostTreeNode,
): node is Extract<HostTreeNode, { kind: "folder" }> {
  return node.kind === "folder";
}

export function filtersActive(filters: FilterState): boolean {
  return Object.values(filters).some((arr) => arr.length > 0);
}

/**
 * Build a recursive folder tree from a flat host list. Folder paths use " / "
 * as the nesting delimiter (matches the web app's buildHostTree). Hosts without
 * a folder are collected under a root-level "No Folder" bucket. Folder metadata
 * (color) is matched by leaf folder name from `folderColors`.
 */
export function buildHostTree(
  hosts: SSHHost[],
  folderColors: Record<string, string | undefined> = {},
): HostTreeNode[] {
  const root: HostTreeNode[] = [];
  const folderMap = new Map<
    string,
    Extract<HostTreeNode, { kind: "folder" }>
  >();

  const getOrCreateFolder = (
    fullPath: string,
  ): Extract<HostTreeNode, { kind: "folder" }> => {
    const existing = folderMap.get(fullPath);
    if (existing) return existing;
    const parts = fullPath.split(FOLDER_SEP);
    let siblings = root;
    let accumulated = "";
    let node!: Extract<HostTreeNode, { kind: "folder" }>;
    for (const part of parts) {
      accumulated = accumulated ? `${accumulated}${FOLDER_SEP}${part}` : part;
      let folder = folderMap.get(accumulated);
      if (!folder) {
        folder = {
          kind: "folder",
          name: part,
          path: accumulated,
          color: folderColors[part],
          children: [],
        };
        folderMap.set(accumulated, folder);
        siblings.push(folder);
      }
      siblings = folder.children;
      node = folder;
    }
    return node;
  };

  // Ensure empty (host-less) folders from metadata still appear is intentionally
  // skipped - the list only shows folders that contain hosts, like the web.
  for (const host of hosts) {
    const path = (host.folder ?? "").trim();
    if (path) {
      getOrCreateFolder(path).children.push({ kind: "host", host });
    } else {
      // Group folderless hosts under a single root-level "No Folder" bucket.
      const folder = getOrCreateFolder(NO_FOLDER);
      folder.children.push({ kind: "host", host });
    }
  }

  return root;
}

/** Recursively count total and online hosts under a folder node. */
export function folderCounts(
  node: Extract<HostTreeNode, { kind: "folder" }>,
  getStatus: GetHostStatus,
): { total: number; online: number } {
  let total = 0;
  let online = 0;
  for (const child of node.children) {
    if (isFolder(child)) {
      const c = folderCounts(child, getStatus);
      total += c.total;
      online += c.online;
    } else {
      total++;
      if (getStatus(child.host.id) === "online") online++;
    }
  }
  return { total, online };
}

export type FolderCounts = Map<string, { total: number; online: number }>;

/** Counts for every folder under the given ones, in one pass. */
export function folderCountMap(
  folders: Extract<HostTreeNode, { kind: "folder" }>[],
  getStatus: GetHostStatus,
): FolderCounts {
  const out: FolderCounts = new Map();
  const visit = (node: Extract<HostTreeNode, { kind: "folder" }>) => {
    let total = 0;
    let online = 0;
    for (const child of node.children) {
      if (isFolder(child)) {
        const c = visit(child);
        total += c.total;
        online += c.online;
      } else {
        total++;
        if (getStatus(child.host.id) === "online") online++;
      }
    }
    const counts = { total, online };
    out.set(node.path, counts);
    return counts;
  };
  folders.forEach(visit);
  return out;
}

function hostMatchesQuery(host: SSHHost, query: string): boolean {
  return (
    host.name.toLowerCase().includes(query) ||
    host.ip.toLowerCase().includes(query) ||
    (host.username ?? "").toLowerCase().includes(query) ||
    (host.tags ?? []).some((t) => t.toLowerCase().includes(query))
  );
}

/** True if any host under this folder matches the search query. */
export function folderHasMatch(
  node: Extract<HostTreeNode, { kind: "folder" }>,
  query: string,
): boolean {
  for (const child of node.children) {
    if (isFolder(child)) {
      if (folderHasMatch(child, query)) return true;
    } else if (hostMatchesQuery(child.host, query)) {
      return true;
    }
  }
  return false;
}

/**
 * Prune the tree to hosts matching the query. Folders with no surviving
 * children are dropped. Returns a new tree (does not mutate input).
 */
export function filterTreeByQuery(
  nodes: HostTreeNode[],
  query: string,
): HostTreeNode[] {
  if (!query) return nodes;
  const out: HostTreeNode[] = [];
  for (const node of nodes) {
    if (isFolder(node)) {
      const children = filterTreeByQuery(node.children, query);
      if (children.length > 0) out.push({ ...node, children });
    } else if (hostMatchesQuery(node.host, query)) {
      out.push(node);
    }
  }
  return out;
}

function hostPassesFilters(
  host: SSHHost,
  filters: FilterState,
  getStatus: GetHostStatus,
  matchers: HostMatchers,
): boolean {
  if (filters.status.length > 0) {
    const status = getStatus(host.id);
    const ok =
      (filters.status.includes("online") && status === "online") ||
      (filters.status.includes("offline") && status !== "online") ||
      (filters.status.includes("pinned") && !!host.pin);
    if (!ok) return false;
  }
  const anyMatch = (values: string[]) =>
    values.some((v) => (matchers[v] ?? CORE_MATCHERS[v])?.(host) ?? false);
  if (filters.protocol.length > 0 && !anyMatch(filters.protocol)) return false;
  if (filters.features.length > 0 && !anyMatch(filters.features)) return false;
  if (filters.tags.length > 0) {
    const ok = filters.tags.some((tag) => (host.tags ?? []).includes(tag));
    if (!ok) return false;
  }
  return true;
}

/** Prune the tree by the active filter state, dropping empty folders. */
export function applyFilters(
  nodes: HostTreeNode[],
  filters: FilterState,
  getStatus: GetHostStatus,
  matchers: HostMatchers = {},
): HostTreeNode[] {
  if (!filtersActive(filters)) return nodes;
  const out: HostTreeNode[] = [];
  for (const node of nodes) {
    if (isFolder(node)) {
      const children = applyFilters(
        node.children,
        filters,
        getStatus,
        matchers,
      );
      if (children.length > 0) out.push({ ...node, children });
    } else if (hostPassesFilters(node.host, filters, getStatus, matchers)) {
      out.push(node);
    }
  }
  return out;
}

/**
 * Recursively sort the tree. Folders always sort before hosts; the "No Folder"
 * bucket sorts last among folders. Hosts within a level sort by the given key.
 */
export function sortHostTree(
  nodes: HostTreeNode[],
  key: SortKey,
  getStatus: GetHostStatus,
): HostTreeNode[] {
  const sorted = [...nodes].sort((a, b) => {
    const aFolder = isFolder(a);
    const bFolder = isFolder(b);
    if (aFolder && !bFolder) return -1;
    if (!aFolder && bFolder) return 1;
    if (aFolder && bFolder) {
      if (a.name === NO_FOLDER) return 1;
      if (b.name === NO_FOLDER) return -1;
      return compareText(a.name, b.name);
    }
    const ha = (a as Extract<HostTreeNode, { kind: "host" }>).host;
    const hb = (b as Extract<HostTreeNode, { kind: "host" }>).host;
    switch (key) {
      case "default":
        return byManualOrder(ha, hb);
      case "name-asc":
        return compareText(ha.name, hb.name);
      case "name-desc":
        return compareText(hb.name, ha.name);
      case "ip-asc":
        return compareText(ha.ip, hb.ip);
      case "ip-desc":
        return compareText(hb.ip, ha.ip);
      case "status-online":
        return (
          (getStatus(hb.id) === "online" ? 1 : 0) -
          (getStatus(ha.id) === "online" ? 1 : 0)
        );
      case "status-offline":
        return (
          (getStatus(ha.id) === "online" ? 1 : 0) -
          (getStatus(hb.id) === "online" ? 1 : 0)
        );
      case "pinned":
        return (hb.pin ? 1 : 0) - (ha.pin ? 1 : 0);
      default:
        return 0;
    }
  });
  return sorted.map((node) =>
    isFolder(node)
      ? { ...node, children: sortHostTree(node.children, key, getStatus) }
      : node,
  );
}

/** The manual order from a drag, then name for hosts never dragged (like core). */
export function byManualOrder(a: SSHHost, b: SSHHost): number {
  const oa = a.sortOrder ?? null;
  const ob = b.sortOrder ?? null;
  if (oa !== null && ob !== null && oa !== ob) return oa - ob;
  if (oa !== null && ob === null) return -1;
  if (oa === null && ob !== null) return 1;
  return compareText(a.name || a.ip, b.name || b.ip);
}

/** One line of the host list: a folder header or a host. */
export type HostListRow =
  | {
      kind: "folder";
      key: string;
      depth: number;
      open: boolean;
      node: Extract<HostTreeNode, { kind: "folder" }>;
    }
  | {
      kind: "host";
      key: string;
      depth: number;
      host: SSHHost;
      /** Path of the folder it sits in. */
      folderPath: string;
    };

/** The tree as list rows, children only under open folders. */
export function flattenTree(
  nodes: HostTreeNode[],
  expanded: Set<string>,
  depth = 0,
  parentPath = "",
  rows: HostListRow[] = [],
): HostListRow[] {
  for (const node of nodes) {
    if (isFolder(node)) {
      const open = expanded.has(node.path);
      rows.push({ kind: "folder", key: `f:${node.path}`, depth, open, node });
      if (open)
        flattenTree(node.children, expanded, depth + 1, node.path, rows);
    } else {
      rows.push({
        kind: "host",
        key: `h:${node.host.id}`,
        depth,
        host: node.host,
        folderPath: parentPath,
      });
    }
  }
  return rows;
}

/**
 * New manual order after a drag, or null when the host left its folder.
 * `before` and `after` are the rows before and after the drag.
 */
export function reorderInFolder(
  before: HostListRow[],
  after: HostListRow[],
  movedKey: string,
): { id: number; sortOrder: number }[] | null {
  const moved = before.find((r) => r.key === movedKey);
  if (!moved || moved.kind !== "host") return null;
  const inFolder = (r: HostListRow) =>
    r.kind === "host" && r.folderPath === moved.folderPath;
  const oldIdx = before.flatMap((r, i) => (inFolder(r) ? [i] : []));
  const newIdx = after.flatMap((r, i) => (inFolder(r) ? [i] : []));
  const start = newIdx[0];
  const contiguous = newIdx[newIdx.length - 1] - start + 1 === newIdx.length;
  // The folder's hosts must stay one block right where they were.
  const sameSpot = after[start - 1]?.key === before[oldIdx[0] - 1]?.key;
  if (!contiguous || !sameSpot) return null;
  const order = newIdx.map((i) => after[i]);
  if (order.every((r, i) => r.key === before[oldIdx[i]].key)) return null;
  return order.map((r, sortOrder) => ({
    id: (r as Extract<HostListRow, { kind: "host" }>).host.id,
    sortOrder,
  }));
}

/** Collect every folder path in the tree (for default "expand all"). */
export function collectFolderPaths(nodes: HostTreeNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (isFolder(node)) {
      paths.push(node.path);
      paths.push(...collectFolderPaths(node.children));
    }
  }
  return paths;
}

/** Collect paths of all folders that contain a query match (for auto-expand). */
export function collectMatchingFolderPaths(
  nodes: HostTreeNode[],
  query: string,
): string[] {
  if (!query) return [];
  const paths: string[] = [];
  for (const node of nodes) {
    if (isFolder(node) && folderHasMatch(node, query)) {
      paths.push(node.path);
      paths.push(...collectMatchingFolderPaths(node.children, query));
    }
  }
  return paths;
}

/** Union of all tags across the host list (for the filter sheet). */
export function collectAllTags(hosts: SSHHost[]): string[] {
  return [...new Set(hosts.flatMap((h) => h.tags ?? []))].sort();
}
