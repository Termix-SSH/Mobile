import { SSHHost, HostTreeNode } from "@/types";

export type HostStatus = "online" | "offline" | "unknown";
export type GetHostStatus = (hostId: number) => HostStatus;

export const NO_FOLDER = "No Folder";
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
  protocol: ("ssh" | "rdp" | "vnc" | "telnet")[];
  features: ("terminal" | "fileManager" | "tunnel" | "docker")[];
  tags: string[];
};

export const DEFAULT_FILTERS: FilterState = {
  status: [],
  protocol: [],
  features: [],
  tags: [],
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
  // skipped — the list only shows folders that contain hosts, like the web.
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
): boolean {
  if (filters.status.length > 0) {
    const status = getStatus(host.id);
    const ok =
      (filters.status.includes("online") && status === "online") ||
      (filters.status.includes("offline") && status !== "online") ||
      (filters.status.includes("pinned") && !!host.pin);
    if (!ok) return false;
  }
  if (filters.protocol.length > 0) {
    // SSH-only legacy hosts have no enableSsh flag; treat them as ssh.
    const isSsh =
      host.enableSsh ??
      (!host.enableRdp && !host.enableVnc && !host.enableTelnet);
    const ok =
      (filters.protocol.includes("ssh") && isSsh) ||
      (filters.protocol.includes("rdp") && !!host.enableRdp) ||
      (filters.protocol.includes("vnc") && !!host.enableVnc) ||
      (filters.protocol.includes("telnet") && !!host.enableTelnet);
    if (!ok) return false;
  }
  if (filters.features.length > 0) {
    const ok =
      (filters.features.includes("terminal") &&
        host.enableTerminal !== false) ||
      (filters.features.includes("fileManager") && !!host.enableFileManager) ||
      (filters.features.includes("tunnel") && !!host.enableTunnel) ||
      (filters.features.includes("docker") && !!host.enableDocker);
    if (!ok) return false;
  }
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
): HostTreeNode[] {
  if (!filtersActive(filters)) return nodes;
  const out: HostTreeNode[] = [];
  for (const node of nodes) {
    if (isFolder(node)) {
      const children = applyFilters(node.children, filters, getStatus);
      if (children.length > 0) out.push({ ...node, children });
    } else if (hostPassesFilters(node.host, filters, getStatus)) {
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
      return a.name.localeCompare(b.name);
    }
    if (key === "default") return 0;
    const ha = (a as Extract<HostTreeNode, { kind: "host" }>).host;
    const hb = (b as Extract<HostTreeNode, { kind: "host" }>).host;
    switch (key) {
      case "name-asc":
        return ha.name.localeCompare(hb.name);
      case "name-desc":
        return hb.name.localeCompare(ha.name);
      case "ip-asc":
        return ha.ip.localeCompare(hb.ip);
      case "ip-desc":
        return hb.ip.localeCompare(ha.ip);
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
