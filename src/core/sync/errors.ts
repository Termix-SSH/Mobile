import { AxiosError } from "axios";
import { AppError } from "@/core/errors";
import { isHtmlPayload } from "@/core/api/http";

/**
 * Why talking to a linked server failed, in the same terms as the desktop's
 * sync client so both explain it the same way.
 */
export type SyncErrorKind =
  /** The device session ended (JSON 401). */
  | "signed_out"
  /** A proxy in front of the server wants its own sign in again. */
  | "proxy_login"
  | "basic_auth"
  | "client_cert"
  | "tls"
  /** The server shows another key than the one pinned for it. */
  | "pin_mismatch"
  | "offline"
  | "server"
  /** The server's sync protocol is newer than this app. */
  | "version_mismatch"
  /** Not a Termix server, or one from before sync. */
  | "not_termix"
  /** Termix, but the sync plugin is off. */
  | "no_sync"
  /** Signed in as someone else than the account was linked to. */
  | "different_account";

export class SyncError extends AppError {
  readonly kind: SyncErrorKind;
  /** The server's own error text, like "Session has expired". */
  readonly serverMessage?: string;

  constructor(
    kind: SyncErrorKind,
    message: string,
    extra: { status?: number; serverMessage?: string } = {},
  ) {
    super(message, `SYNC_${kind.toUpperCase()}`, extra.status);
    this.name = "SyncError";
    this.kind = kind;
    this.serverMessage = extra.serverMessage;
  }
}

const CLIENT_CERT_FAILURE =
  /certificate required|bad certificate|alert (42|116)|alert_?certificate|SSLV3_ALERT|-9829|errSSLPeerCertUnknown|client certificate/i;
const TLS_FAILURE = /ssl|tls|certificate|handshake|trust|-12\d\d/i;

function header(error: AxiosError, name: string): string {
  const headers = error.response?.headers as
    Record<string, unknown> | { get?: (n: string) => unknown } | undefined;
  if (!headers) return "";
  const value =
    typeof (headers as { get?: unknown }).get === "function"
      ? (headers as { get(n: string): unknown }).get(name)
      : (headers as Record<string, unknown>)[name];
  return typeof value === "string" ? value : "";
}

/** True when the reply is a web page instead of the JSON a route sends. */
export function isWebPage(data: unknown, contentType = ""): boolean {
  return isHtmlPayload(data) || /text\/html/i.test(contentType);
}

/** Turns any failed sync request into a SyncError. */
export function classifyRemoteError(error: unknown): SyncError {
  if (error instanceof SyncError) return error;
  if (!(error instanceof AxiosError)) {
    const message = error instanceof Error ? error.message : String(error);
    return new SyncError("offline", message);
  }
  const response = error.response;
  if (!response) {
    const text = `${error.message} ${error.code ?? ""}`;
    if (CLIENT_CERT_FAILURE.test(text)) {
      return new SyncError(
        "client_cert",
        "The server did not accept this phone's certificate.",
      );
    }
    if (TLS_FAILURE.test(text) && error.code !== "ECONNABORTED") {
      return new SyncError("tls", "The server's certificate is not trusted.");
    }
    return new SyncError("offline", "Can't reach the server.");
  }
  const status = response.status;
  const data = response.data as unknown;
  const page = isWebPage(data, header(error, "content-type"));
  const serverMessage =
    data && typeof data === "object" && "error" in data
      ? String((data as { error: unknown }).error)
      : undefined;

  if (status === 401) {
    if (!page && data && typeof data === "object") {
      return new SyncError("signed_out", serverMessage ?? "Signed out", {
        status,
        serverMessage,
      });
    }
    if (/^basic/i.test(header(error, "www-authenticate"))) {
      return new SyncError("basic_auth", "The proxy asked for its password.", {
        status,
      });
    }
    return new SyncError("proxy_login", "The proxy wants you to sign in.", {
      status,
    });
  }
  if (status === 404) {
    return new SyncError("no_sync", "Sync is not turned on for this server.", {
      status,
      serverMessage,
    });
  }
  if (page || status === 302 || status === 303) {
    return new SyncError("proxy_login", "The proxy wants you to sign in.", {
      status,
    });
  }
  return new SyncError("server", serverMessage ?? `Server error ${status}`, {
    status,
    serverMessage,
  });
}

/** Problems a person has to fix. Anything else is retried on its own. */
export function needsUser(kind: SyncErrorKind): boolean {
  return kind !== "offline" && kind !== "server";
}
