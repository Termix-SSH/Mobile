// A snippet's target hosts. The list is saved as the server's JSON array of
// host ids, so a snippet made on the phone shows its targets on the web.
import type { Snippet, SSHHost } from "@/types";

export function parseHostFilter(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is number => typeof id === "number")
      : [];
  } catch {
    return [];
  }
}

export function serializeHostFilter(ids: number[]): string | null {
  const unique = [...new Set(ids)];
  return unique.length ? JSON.stringify(unique) : null;
}

/**
 * The id a host has in a snippet's list. A linked server's list holds the
 * server's own ids; This device keeps the phone's.
 */
export function filterIdOf(
  host: Pick<SSHHost, "id" | "serverId">,
  accountKind: "local" | "server",
): number {
  return accountKind === "server" ? (host.serverId ?? host.id) : host.id;
}

export function targetHosts(
  snippet: Pick<Snippet, "hostFilter">,
  hosts: SSHHost[],
  accountKind: "local" | "server",
): SSHHost[] {
  const wanted = new Set(parseHostFilter(snippet.hostFilter));
  return hosts.filter((host) => wanted.has(filterIdOf(host, accountKind)));
}
