import { AppError } from "@/core/errors";
import { SshError, type SshErrorKind } from "@/modules/termix-ssh";
import type { TransportKind } from "./types";
import { deviceWord } from "@/utils/device-word";
import { t } from "@/i18n";

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
  unavailable: t("transport.errors.canTConnectThisWay"),
  network: t("transport.errors.couldNotReachTheHost"),
  proxy: t("transport.errors.theProxyDidNotLet"),
  hostKey: t("transport.errors.theHostKeyWasNot"),
  auth: t("transport.errors.theLoginWasRefused"),
  server: t("transport.errors.theTermixServerDidNot"),
  session: t("transport.errors.theConnectionDropped"),
  cancelled: t("transport.errors.loginCancelled"),
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
        ? t("transport.errors.checkTheAddressAndPort")
        : t("transport.errors.checkTheAddressAndPort2", { deviceWord });
    case "proxy":
      return t("transport.errors.checkTheProxySettingsOf");
    case "hostKey":
      return t("transport.errors.checkTheKeyWithWhoever");
    case "auth":
      return t("transport.errors.checkTheUsernameAndLogin");
    case "server":
      return t("transport.errors.checkThatTheServerIs");
    case "session":
      return t("transport.errors.tryAgainIfItKeeps");
    case "cancelled":
      return t("transport.errors.connectAgainWhenYouAre");
    case "unavailable":
      return t("transport.errors.pickAnotherWayToConnect");
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

export const TAILSCALE_HINT = t("transport.errors.thisIsATailscaleAddress", {
  deviceWord,
});

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
        ? t("transport.errors.theSavedKeyCanT")
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
          hint: t("transport.errors.connectThisHostThroughA"),
        };
      case "JUMP_HOST_MISSING":
        return {
          stage: "unavailable",
          message: err.message,
          hint: t("transport.errors.pickTheJumpHostsAgain"),
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
    return make("server", t("transport.errors.signInToThisServer"));
  if (/only the web app|needs a sign-in/i.test(m))
    return make("unavailable", t("transport.errors.openThisHostInThe"));
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
