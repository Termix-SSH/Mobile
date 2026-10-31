// Sharing one host as a link: shown as a QR code or copied to the clipboard.
import {
  fromBase64,
  toBase64,
  utf8Decode,
  utf8Encode,
} from "@/modules/termix-ssh/src/base64";
import type { SSHHost } from "@/types";
import { isValidPort } from "./termix-json";

export const SHARE_PREFIX = "termix://host?d=";

/** A host as it travels in a link. Keys and logins never do. */
export interface SharedHost {
  v: 1;
  name: string;
  ip: string;
  port: number;
  username: string;
  authType: "password" | "key" | "none" | "tailscale";
  folder?: string;
  tags?: string[];
  notes?: string;
  /** Only when asked for, and never in a QR code. */
  password?: string;
}

export interface ShareOptions {
  /** Add the host's password. Only for the clipboard. */
  password?: boolean;
  /** Leave out notes and tags, so a QR code stays easy to scan. */
  compact?: boolean;
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  return fromBase64(text.replace(/-/g, "+").replace(/_/g, "/"));
}

export function sharedFromHost(
  host: SSHHost,
  options: ShareOptions = {},
): SharedHost {
  // A saved login isn't ours to hand out, so the receiver picks their own.
  // Server sign ins don't travel either.
  const shareable: string[] = ["none", "password", "key", "tailscale"];
  const authType: SharedHost["authType"] = shareable.includes(host.authType)
    ? (host.authType as SharedHost["authType"])
    : "password";
  const shared: SharedHost = {
    v: 1,
    name: host.name,
    ip: host.ip,
    port: host.port,
    username: host.username,
    authType,
  };
  if (host.folder) shared.folder = host.folder;
  if (!options.compact) {
    if (host.tags?.length) shared.tags = host.tags;
    if (host.notes) shared.notes = host.notes;
  }
  if (options.password && host.authType === "password" && host.password) {
    shared.password = host.password;
  }
  return shared;
}

export function encodeHostShare(
  host: SSHHost,
  options: ShareOptions = {},
): string {
  const json = JSON.stringify(sharedFromHost(host, options));
  return SHARE_PREFIX + toBase64Url(utf8Encode(json));
}

function checkShared(value: unknown): SharedHost | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.ip !== "string" || !v.ip.trim() || !isValidPort(v.port)) {
    return null;
  }
  const auth = ["password", "key", "none", "tailscale"].includes(
    v.authType as string,
  )
    ? (v.authType as SharedHost["authType"])
    : "password";
  return {
    v: 1,
    name: typeof v.name === "string" ? v.name : v.ip,
    ip: v.ip.trim(),
    port: Number(v.port),
    username: typeof v.username === "string" ? v.username : "",
    authType: auth,
    folder: typeof v.folder === "string" ? v.folder : undefined,
    tags: Array.isArray(v.tags)
      ? v.tags.filter((t): t is string => typeof t === "string")
      : undefined,
    notes: typeof v.notes === "string" ? v.notes : undefined,
    password: typeof v.password === "string" ? v.password : undefined,
  };
}

/**
 * Reads a shared host from a link, a bare payload, or the text of a Termix
 * host file with one host in it. Null when the text is none of those.
 */
export function decodeHostShare(input: string): SharedHost | null {
  const text = input.trim();
  if (!text) return null;
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const data = JSON.parse(text);
      const list = Array.isArray(data) ? data : data?.hosts;
      if (!Array.isArray(list) || list.length !== 1) return null;
      const row = list[0] ?? {};
      return checkShared({
        ...row,
        authType: row.authType === "credential" ? "password" : row.authType,
      });
    } catch {
      return null;
    }
  }
  const payload = text.startsWith(SHARE_PREFIX)
    ? text.slice(SHARE_PREFIX.length)
    : /^[A-Za-z0-9_-]+$/.test(text)
      ? text
      : null;
  if (!payload) return null;
  try {
    return checkShared(JSON.parse(utf8Decode(fromBase64Url(payload))));
  } catch {
    return null;
  }
}
