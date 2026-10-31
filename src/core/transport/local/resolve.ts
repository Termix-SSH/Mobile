/**
 * Turns a saved host into an engine login, like core's host-resolver and
 * build-connect-config: the linked login fills the secrets, ssh_options sets
 * keepalive, algorithms and env, and proxies and port knocks carry over.
 */
import type { HostConnectProfile } from "@/core/data/types";
import type {
  SshConnectConfig,
  SshPortKnock,
  SshProxyHop,
} from "@/modules/termix-ssh";
import type { TerminalHostConfig } from "../types";
import { assertDeviceAuth } from "./auth-support";

/** One login: the engine config plus what the app keeps to answer prompts. */
export interface ResolvedLogin {
  config: SshConnectConfig;
  /** Auth type after the login is applied, like the server's rewrite. */
  authType: string;
  /** Stored password, filled into keyboard-interactive password prompts. */
  password?: string;
  /** Host row for saving its key; null for a host that is not saved. */
  hostId: number | null;
  name: string;
  env: Record<string, string>;
  jumpHostIds: number[];
  savedHostKey: HostConnectProfile["hostKey"];
}

/** Matches core's ssh-keepalive.ts: seconds, 0 turns it off, at least 5. */
function keepalive(options: Record<string, unknown>, base: number) {
  const n = Number(options.keepaliveInterval);
  if (!Number.isFinite(n) || options.keepaliveInterval == null) return base;
  if (n <= 0) return 0;
  return Math.max(5, Math.round(n));
}

function keepaliveCount(options: Record<string, unknown>, base: number) {
  const n = Number(options.keepaliveCountMax);
  if (!Number.isFinite(n) || options.keepaliveCountMax == null) return base;
  return n <= 0 ? 0 : Math.max(1, Math.round(n));
}

function envVars(options: Record<string, unknown>): Record<string, string> {
  const list = Array.isArray(options.environmentVariables)
    ? (options.environmentVariables as { key?: unknown; value?: unknown }[])
    : [];
  const env: Record<string, string> = {};
  for (const item of list) {
    if (typeof item?.key === "string" && item.key.trim()) {
      env[item.key.trim()] = String(item.value ?? "");
    }
  }
  return env;
}

export function proxiesOf(
  socks5: HostConnectProfile["socks5"] | undefined,
): SshProxyHop[] {
  if (!socks5?.use) return [];
  const chain = (socks5.chain ?? []) as Record<string, unknown>[];
  if (chain.length > 0) {
    return chain
      .filter((n) => typeof n?.host === "string" && n.host)
      .map((n) => ({
        kind:
          n.type === "http"
            ? "http"
            : n.type === 4 || n.type === "socks4"
              ? "socks4"
              : "socks5",
        host: n.host as string,
        port: Number(n.port) || 1080,
        username: (n.username as string) || undefined,
        password: (n.password as string) || undefined,
      }));
  }
  if (!socks5.host) return [];
  return [
    {
      kind: "socks5",
      host: socks5.host,
      port: socks5.port || 1080,
      username: socks5.username || undefined,
      password: socks5.password || undefined,
    },
  ];
}

export function knocksOf(
  sequence: HostConnectProfile["portKnock"] | undefined,
): SshPortKnock[] {
  return (sequence ?? [])
    .map((k) => ({
      port: Number(k?.port),
      udp: String(k?.protocol ?? "tcp").toLowerCase() === "udp",
      delayMs: Number(k?.delay ?? 100),
    }))
    .filter((k) => Number.isInteger(k.port) && k.port > 0 && k.port <= 65535);
}

/**
 * The login for a host. `profile` is the saved row (null for a host typed in
 * by hand); `host` is what the screen passed, used when nothing is saved.
 */
export function resolveLogin(
  profile: HostConnectProfile | null,
  host: TerminalHostConfig,
  opts: { jump?: boolean } = {},
): ResolvedLogin {
  const saved = profile?.host;
  const src = saved ?? host;
  let username = src.username;
  let password = src.password || undefined;
  let key = src.key || undefined;
  let keyPassword = src.keyPassword || undefined;
  let certificate: string | undefined;
  let authType: string = src.authType || "none";

  assertDeviceAuth(authType);

  const cred = profile?.credential;
  if (src.credentialId && cred) {
    password = cred.password || undefined;
    key = cred.key || undefined;
    keyPassword = cred.keyPassword || undefined;
    certificate = cred.certPublicKey || undefined;
    if (!src.overrideCredentialUsername && cred.username) {
      username = cred.username;
    }
  }
  assertDeviceAuth(authType, password, key);
  // Like the server, a linked login decides the type by what it holds.
  if (authType === "credential") {
    authType = key ? "key" : password ? "password" : "none";
  }

  const options = profile?.sshOptions ?? {};
  const tailscale = authType === "tailscale";
  const config: SshConnectConfig = {
    host: src.ip,
    port: Number((saved?.sshPort ?? src.port) || 22),
    username,
    password:
      authType === "password" || authType === "key" ? password : undefined,
    privateKey: authType === "key" ? key : undefined,
    passphrase: authType === "key" ? keyPassword : undefined,
    certificate: authType === "key" ? certificate : undefined,
    forceKeyboardInteractive: !!src.forceKeyboardInteractive,
    tryKeyboard: tailscale ? false : opts.jump ? authType !== "none" : true,
    allowLegacyAlgorithms: options.allowLegacyAlgorithms !== false,
    connectTimeoutSecs: tailscale ? 60 : 20,
    keepaliveIntervalSecs: keepalive(options, 30),
    keepaliveCountMax: keepaliveCount(options, opts.jump ? 3 : 5),
    proxies: proxiesOf(profile?.socks5),
    portKnock: knocksOf(profile?.portKnock),
  };
  return {
    config,
    authType,
    password,
    hostId: saved ? saved.id : null,
    name: src.name || src.ip,
    env: envVars(options),
    jumpHostIds: (saved?.jumpHosts ?? host.jumpHosts ?? [])
      .map((j) => Number(j.hostId))
      .filter((id) => Number.isFinite(id) && id > 0),
    savedHostKey: profile?.hostKey ?? null,
  };
}

/** Core's Tailscale fallback: one more try as `user+password` with a fixed password. */
export function tailscaleRetry(login: ResolvedLogin): ResolvedLogin {
  return {
    ...login,
    config: {
      ...login.config,
      username: `${login.config.username}+password`,
      password: "termix",
      tryKeyboard: false,
    },
  };
}
