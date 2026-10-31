import { isServerAccount, type Account } from "@/core/accounts/types";
import type { SSHHost } from "@/types";

/**
 * `termix-mobile://open` links, so a notification (ntfy, Home Assistant) can
 * open a host in the app. Two forms:
 *
 *   termix-mobile://open?server=https://termix.example&view=terminal&hostId=12
 *   termix-mobile://open?url=<a Termix web link with ?view=...&hostId=...>
 *
 * With no server the host is one on This device.
 */
export const OPEN_LINK_PREFIX = "termix-mobile://open";

export interface OpenLink {
  /** The server's address, null for This device. */
  server: string | null;
  hostId: number | null;
  /** App session type, null to run the host's first action. */
  type: string | null;
}

// Web view ids from Termix links, and the app's session type for each.
const VIEWS: Record<string, string> = {
  terminal: "terminal",
  "file-manager": "filemanager",
  "server-stats": "stats",
  "host-metrics": "stats",
};

function readQuery(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of query.split("&")) {
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    try {
      out[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(
        pair.slice(eq + 1).replace(/\+/g, " "),
      );
    } catch {
      // A broken pair is skipped.
    }
  }
  return out;
}

function cleanServer(value: string | undefined): string | null | false {
  if (!value) return null;
  if (!/^https?:\/\/[^/?#\s]+/i.test(value)) return false;
  return value.replace(/[?#].*$/, "").replace(/\/+$/, "");
}

/** Null for anything that isn't a well formed open link. */
export function parseOpenLink(url: string): OpenLink | null {
  if (!url?.startsWith(OPEN_LINK_PREFIX)) return null;
  const rest = url.slice(OPEN_LINK_PREFIX.length);
  if (rest && !/^[/?]/.test(rest)) return null;
  // Hermes' URL does not parse custom schemes well, so split by hand.
  const at = rest.indexOf("?");
  let params = readQuery(at === -1 ? "" : rest.slice(at + 1));
  let server = cleanServer(params.server);

  if (params.url) {
    const web = params.url;
    const q = web.indexOf("?");
    server = cleanServer(q === -1 ? web : web.slice(0, q));
    params = { ...readQuery(q === -1 ? "" : web.slice(q + 1)), ...params };
  }
  if (server === false) return null;

  let hostId: number | null = null;
  if (params.hostId !== undefined) {
    hostId = Number(params.hostId);
    if (!Number.isInteger(hostId) || hostId <= 0) return null;
  }
  const type = params.view ? (VIEWS[params.view] ?? null) : null;
  return { server, hostId, type };
}

const norm = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();

/**
 * The account a link is for: This device with no server, else the linked
 * server whose address the link starts with (the longest one wins).
 */
export function findLinkAccount(
  list: Account[],
  server: string | null,
): Account | null {
  if (!server) return list.find((a) => a.kind === "local") ?? null;
  const target = norm(server);
  let best: Account | null = null;
  for (const account of list) {
    if (!isServerAccount(account) || account.pending) continue;
    const base = norm(account.serverUrl);
    if (target !== base && !target.startsWith(`${base}/`)) continue;
    if (
      !best ||
      (isServerAccount(best) && base.length > norm(best.serverUrl).length)
    ) {
      best = account;
    }
  }
  return best;
}

/** A synced host keeps the server's id as serverId; a live one as id. */
export function findLinkHost(
  hosts: SSHHost[],
  hostId: number,
  fromServer: boolean,
): SSHHost | null {
  if (fromServer) {
    const synced = hosts.find((h) => Number(h.serverId) === hostId);
    if (synced) return synced;
    return hosts.find((h) => !h.serverId && Number(h.id) === hostId) ?? null;
  }
  return hosts.find((h) => Number(h.id) === hostId) ?? null;
}
