import { AppError } from "@/core/errors";
import { SshError, type SshErrorKind } from "@/modules/termix-ssh";
import type { TransportKind } from "./types";

/** Which step of connecting went wrong. */
export type FailureStage =
  | "unavailable"
  | "network"
  | "proxy"
  | "hostKey"
  | "auth"
  | "server"
  | "session"
  | "cancelled";

/** A failed connection, said plainly: what failed and what to try. */
export interface ConnectFailure {
  stage: FailureStage;
  message: string;
  hint: string;
  /** Set by the connection once it knows which way it tried. */
  origin?: TransportKind;
  /** Never retried on its own, like a session another device took over. */
  noRetry?: boolean;
}

const TITLES: Record<FailureStage, string> = {
  unavailable: "Can't connect this way",
  network: "Could not reach the host",
  proxy: "The proxy did not let the connection through",
  hostKey: "The host key was not trusted",
  auth: "The login was refused",
  server: "The Termix server did not answer",
  session: "The connection dropped",
  cancelled: "Login cancelled",
};

/** Short heading for a failure. */
export function failureTitle(stage: FailureStage): string {
  return TITLES[stage];
}

/** What to try next, worded for the way it was tried. */
export function hintFor(stage: FailureStage, origin?: TransportKind): string {
  switch (stage) {
    case "network":
      return origin === "relay"
        ? "Check the address and port, and that the server can reach the host."
        : "Check the address and port, and that this phone can reach the host.";
    case "proxy":
      return "Check the proxy settings of this host.";
    case "hostKey":
      return "Check the key with whoever runs the host before you trust it.";
    case "auth":
      return "Check the username and login in the host editor.";
    case "server":
      return "Check that the server is up and that you are still signed in.";
    case "session":
      return "Try again. If it keeps dropping, check the network.";
    case "cancelled":
      return "Connect again when you are ready.";
    case "unavailable":
      return "Pick another way to connect this host.";
  }
}

// 100.64.0.0/10, MagicDNS names and Tailscale's IPv6 range.
const TAILNET_V4 = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;
const TAILNET_NAME = /\.ts\.net\.?$/i;
const TAILNET_V6 = /^\[?fd7a:115c:a1e0:/i;

/** A host address that only works over Tailscale. */
export function isTailnetAddress(address: string): boolean {
  const a = address.trim();
  return TAILNET_V4.test(a) || TAILNET_NAME.test(a) || TAILNET_V6.test(a);
}

export const TAILSCALE_HINT =
  "This is a Tailscale address. Check that Tailscale is connected on this phone.";

const SSH_STAGE: Record<SshErrorKind, FailureStage> = {
  connect: "network",
  timeout: "network",
  io: "network",
  hostKeyRejected: "hostKey",
  passphraseRequired: "auth",
  badPassphrase: "auth",
  invalidKey: "auth",
  auth: "auth",
  authMethodNotAvailable: "auth",
  authCancelled: "cancelled",
  cancelled: "cancelled",
  channel: "session",
  sftp: "session",
  disconnected: "session",
  unavailable: "unavailable",
};

const PROXY = /\b(proxy|socks)/i;

/** A failure from the phone's own engine or the app. */
export function fromError(err: unknown): ConnectFailure {
  if (err instanceof SshError) {
    let stage = SSH_STAGE[err.kind] ?? "network";
    if (stage === "network" && PROXY.test(err.message)) stage = "proxy";
    const hint =
      err.kind === "invalidKey"
        ? "The saved key can't be read. Paste it again in the host editor."
        : hintFor(stage, "local");
    return { stage, message: err.message, hint };
  }
  if (err instanceof AppError) {
    switch (err.code) {
      case "TRANSPORT_UNAVAILABLE":
        return unavailable(err.message);
      case "AUTH_NEEDS_SERVER":
        return {
          stage: "unavailable",
          message: err.message,
          hint: "Connect this host through a Termix server.",
        };
      case "JUMP_HOST_MISSING":
        return {
          stage: "unavailable",
          message: err.message,
          hint: "Pick the jump hosts again in the host editor.",
        };
    }
  }
  const message = err instanceof Error ? err.message : String(err);
  return { stage: "network", message, hint: hintFor("network", "local") };
}

export function unavailable(reason: string, hint?: string): ConnectFailure {
  return {
    stage: "unavailable",
    message: reason,
    hint: hint ?? hintFor("unavailable"),
  };
}

// Server side SSH errors as the relay passes them on.
const NETWORK =
  /ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN|getaddrinfo|timed out|connection refused|no route/i;

/** A failure message from the relay (server socket or the server's SSH), without the host name. */
export function fromRelayMessage(message: string): ConnectFailure {
  const m = message;
  const make = (stage: FailureStage, hint = hintFor(stage, "relay")) => ({
    stage,
    message: m,
    hint,
  });
  if (/log in again|no server url|not configured|signed out/i.test(m))
    return make("server", "Sign in to this server again.");
  if (/only the web app|needs a sign-in/i.test(m))
    return make("unavailable", "Open this host in the Termix web app.");
  if (/^authentication failed|permission denied|password/i.test(m))
    return make("auth");
  if (/host key/i.test(m)) return make("hostKey");
  if (PROXY.test(m) && NETWORK.test(m)) return make("proxy");
  if (/server not responding|maximum reconnection|websocket/i.test(m))
    return make("server");
  if (NETWORK.test(m)) return make("network");
  if (/connection closed|disconnected/i.test(m)) return make("session");
  return make("server");
}
