// Reads what a person types into quick connect: user@host:port and friends.
import { isValidPort } from "./transfer/termix-json";

export interface ConnectTarget {
  user?: string;
  host: string;
  port?: number;
}

const HOST = /^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const IPV6 = /^[0-9A-Fa-f:.]+$/;

function validHost(host: string): boolean {
  if (host.includes(":")) return IPV6.test(host) && host.length >= 2;
  return HOST.test(host);
}

/**
 * Accepts `host`, `host:port`, `user@host`, `user@host:port`, `[::1]:22` and
 * an `ssh://` prefix. Returns null when there is no usable host.
 */
export function parseTarget(input: string): ConnectTarget | null {
  let rest = input
    .trim()
    .replace(/^ssh:\/\//i, "")
    .replace(/\/+$/, "");
  if (!rest || /\s/.test(rest)) return null;
  let user: string | undefined;
  const at = rest.lastIndexOf("@");
  if (at >= 0) {
    user = rest.slice(0, at);
    rest = rest.slice(at + 1);
    if (!user) return null;
  }
  let host = rest;
  let port: number | undefined;
  const bracket = /^\[([^\]]+)\](?::(\d+))?$/.exec(rest);
  if (bracket) {
    host = bracket[1];
    if (bracket[2]) port = Number(bracket[2]);
  } else {
    const single = /^([^:]+):(\d+)$/.exec(rest);
    if (single) {
      host = single[1];
      port = Number(single[2]);
    }
  }
  if (!validHost(host)) return null;
  if (port !== undefined && !isValidPort(port)) return null;
  return { user, host, port };
}

/** The name a saved quick connect host gets. */
export function targetName(target: ConnectTarget): string {
  return target.user ? `${target.user}@${target.host}` : target.host;
}
