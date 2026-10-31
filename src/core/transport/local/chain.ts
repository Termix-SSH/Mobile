/**
 * Logs in to a host from this phone: every jump hop in order, then the host.
 * The shell and background work share this and differ only in how they
 * answer prompts.
 */
import { AppError } from "@/core/errors";
import type { HostConnectRepository } from "@/core/data/types";
import {
  connect,
  SshError,
  type SshKbdRequest,
  type SshPrompts,
  type SshSession,
} from "@/modules/termix-ssh";
import type { TerminalHostConfig } from "../types";
import { checkHostKey, type AskHostKey } from "./host-keys";
import { resolveLogin, tailscaleRetry, type ResolvedLogin } from "./resolve";

export interface HopInfo {
  index: number;
  total: number;
  ip: string;
}

export interface ChainHandlers {
  /** Null when nobody can be asked. */
  askHostKey: AskHostKey | null;
  /** Answers one keyboard-interactive round; null cancels the login. */
  askKbd(
    request: SshKbdRequest,
    login: ResolvedLogin,
    hop: HopInfo | null,
  ): Promise<string[] | null>;
  onBanner?(banner: string, login: ResolvedLogin): void;
  signal?: AbortSignal;
  /** Overrides the connect timeout, except for Tailscale's browser check. */
  connectTimeoutSecs?: number;
}

/** Secrets typed into a dialog for this attempt, over what is saved. */
export interface LoginOverrides {
  password?: string;
  key?: string;
  keyPassword?: string;
}

export interface Chain {
  target: SshSession;
  /** Jump hop sessions, first hop first. */
  hops: SshSession[];
  login: ResolvedLogin;
}

export function applyOverrides(
  login: ResolvedLogin,
  o: LoginOverrides | null,
): ResolvedLogin {
  if (!o) return login;
  const config = { ...login.config };
  let authType = login.authType;
  if (o.password !== undefined || o.key !== undefined) {
    authType = o.key ? "key" : "password";
    config.password = o.password || undefined;
    config.privateKey = o.key || undefined;
    config.certificate = undefined;
    config.tryKeyboard = true;
  }
  if (o.keyPassword !== undefined)
    config.passphrase = o.keyPassword || undefined;
  return {
    ...login,
    authType,
    config,
    password: o.password !== undefined ? o.password : login.password,
  };
}

/** Closes sessions last first, ignoring errors. */
export function closeAll(sessions: SshSession[]): void {
  [...sessions].reverse().forEach((s) => s.disconnect().catch(() => {}));
}

function withTimeout(login: ResolvedLogin, secs?: number): ResolvedLogin {
  if (!secs || login.authType === "tailscale") return login;
  return { ...login, config: { ...login.config, connectTimeoutSecs: secs } };
}

function promptsFor(
  login: ResolvedLogin,
  hop: HopInfo | null,
  h: ChainHandlers,
  repo: HostConnectRepository | undefined,
): SshPrompts {
  return {
    verifyHostKey: (key) =>
      checkHostKey({
        hostId: login.hostId,
        saved: login.savedHostKey,
        key,
        jump: hop != null,
        name: login.name,
        ask: h.askHostKey,
        repo,
      }),
    keyboardInteractive: (request) => h.askKbd(request, login, hop),
    onBanner: (banner) => h.onBanner?.(banner, login),
  };
}

/**
 * Logs in to every jump host of `host` in order. Telnet and remote desktops
 * dial their target through the last one.
 */
export async function openJumps(
  repo: HostConnectRepository | undefined,
  host: TerminalHostConfig,
  jumpHostIds: number[],
  h: ChainHandlers,
): Promise<SshSession[]> {
  const hops: SshSession[] = [];
  const opts = { signal: h.signal };
  try {
    const total = jumpHostIds.length;
    for (const [index, id] of jumpHostIds.entries()) {
      const p = repo ? await repo.profile(id) : null;
      if (!p) {
        throw new AppError(
          "A jump host of this host no longer exists.",
          "JUMP_HOST_MISSING",
        );
      }
      const hopLogin = withTimeout(
        resolveLogin(p, host, { jump: true }),
        h.connectTimeoutSecs,
      );
      const hop = { index, total, ip: hopLogin.config.host };
      const prompts = promptsFor(hopLogin, hop, h, repo);
      const prev = hops[hops.length - 1];
      try {
        hops.push(
          prev
            ? await prev.connectVia(hopLogin.config, prompts, opts)
            : await connect(hopLogin.config, prompts, opts),
        );
      } catch (err) {
        if (err instanceof SshError && err.kind !== "cancelled") {
          err.message = `Jump host ${index + 1}/${total} (${hop.ip}): ${err.message}`;
        }
        throw err;
      }
    }
    return hops;
  } catch (err) {
    closeAll(hops);
    throw err;
  }
}

export async function openChain(
  repo: HostConnectRepository | undefined,
  host: TerminalHostConfig,
  overrides: LoginOverrides | null,
  h: ChainHandlers,
): Promise<Chain> {
  const profile = host.id > 0 && repo ? await repo.profile(host.id) : null;
  const login = withTimeout(
    applyOverrides(resolveLogin(profile, host), overrides),
    h.connectTimeoutSecs,
  );
  const hops = await openJumps(repo, host, login.jumpHostIds, h);
  const opts = { signal: h.signal };
  try {
    const last = hops[hops.length - 1];
    const open = (l: ResolvedLogin) => {
      const prompts = promptsFor(l, null, h, repo);
      return last
        ? last.connectVia(l.config, prompts, opts)
        : connect(l.config, prompts, opts);
    };
    try {
      return { target: await open(login), hops, login };
    } catch (err) {
      // Core's Tailscale fallback for servers that refuse "none".
      if (
        login.authType === "tailscale" &&
        err instanceof SshError &&
        (err.kind === "auth" || err.kind === "authMethodNotAvailable")
      ) {
        const retry = tailscaleRetry(login);
        return { target: await open(retry), hops, login: retry };
      }
      throw err;
    }
  } catch (err) {
    closeAll(hops);
    throw err;
  }
}
