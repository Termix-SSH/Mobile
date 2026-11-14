/**
 * What a plugin web view may reach on its server. The page has no network of
 * its own, so this list is the whole of it: the plugin's own routes, assets,
 * settings and operations, and the core reads the SDK's hooks and UI kit make.
 * Everything else answers 403 in the app and never reaches the server.
 */

import RULE_FILE from "./frame-core-rules.json";

type Method = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";

interface Rule {
  methods: Method[] | "any";
  path: (pluginId: string) => RegExp;
}

const esc = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const READ: Method[] = ["GET", "HEAD"];

export interface CoreRuleEntry {
  methods: string[];
  path: string;
  why?: string;
}

/**
 * Core requests shared with the web shell's frame policy. A copy of core's
 * frame-core-rules.json: refresh it with `npm run sync:frame-policy`; CI
 * fails when it differs from core's newest dev branch.
 */
export const CORE_RULES: CoreRuleEntry[] = RULE_FILE.rules;

const RULES: Rule[] = [
  // The web shell gives a frame these by other means.
  { methods: "any", path: (id) => new RegExp(`^/plugin-api/${esc(id)}(/|$)`) },
  { methods: READ, path: (id) => new RegExp(`^/plugin-assets/${esc(id)}/`) },
  { methods: ["POST"], path: () => /^\/users\/ws-ticket$/ },
  ...CORE_RULES.map((entry): Rule => ({
    methods: entry.methods as Method[],
    path: (id) => new RegExp(entry.path.split("{id}").join(esc(id))),
  })),
];

export type PolicyResult =
  { ok: true; path: string } | { ok: false; reason: string };

/** The path under the server's root, or null when the URL is not on it. */
function pathOn(root: string, url: string, schemes: string[]): string | null {
  let target: URL;
  let base: URL;
  try {
    target = new URL(url);
    base = new URL(root);
  } catch {
    return null;
  }
  if (!schemes.includes(target.protocol)) return null;
  if (target.host !== base.host || target.username || target.password) {
    return null;
  }
  // Encoded slashes and dots could step out of a prefix once the server decodes them.
  if (/%2f|%5c|%2e/i.test(target.pathname) || target.pathname.includes("\\")) {
    return null;
  }
  const prefix = base.pathname.replace(/\/+$/, "");
  if (prefix && !target.pathname.startsWith(`${prefix}/`)) return null;
  const path = target.pathname.slice(prefix.length) || "/";
  if (path.split("/").some((part) => part === "." || part === "..")) {
    return null;
  }
  return path;
}

export function checkRequest(
  pluginId: string,
  root: string,
  method: string,
  url: string,
): PolicyResult {
  const secure = root.startsWith("https:");
  const path = pathOn(root, url, [secure ? "https:" : "http:"]);
  if (!path) return { ok: false, reason: "not this server" };
  const verb = method.toUpperCase() as Method;
  const allowed = RULES.some(
    (rule) =>
      (rule.methods === "any" || rule.methods.includes(verb)) &&
      rule.path(pluginId).test(path),
  );
  return allowed
    ? { ok: true, path }
    : { ok: false, reason: `${verb} ${path}` };
}

export function checkSocket(
  pluginId: string,
  root: string,
  url: string,
): PolicyResult {
  const secure = root.startsWith("https:");
  const path = pathOn(root, url, [secure ? "wss:" : "ws:"]);
  if (!path) return { ok: false, reason: "not this server" };
  return new RegExp(`^/plugin-ws/${esc(pluginId)}(/|$)`).test(path)
    ? { ok: true, path }
    : { ok: false, reason: path };
}

/** Headers the page may not set: the app owns the login and the proxy. */
const OWNED =
  /^(authorization|cookie|host|origin|referer|user-agent|proxy-|cf-access-|x-termix-)/i;

export function pageHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!OWNED.test(name) && typeof value === "string") out[name] = value;
  }
  return out;
}
