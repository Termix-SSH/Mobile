import type { SyncError, SyncErrorKind } from "./errors";

/**
 * Why a linked server stopped syncing, saved as the account's lastError so
 * the UI can explain it and offer the quickest fix.
 */
export type SyncReason =
  Exclude<SyncErrorKind, "signed_out"> | "expired" | "revoked";

export type SyncFix =
  | "sign_in"
  | "proxy_sign_in"
  | "proxy_password"
  | "pick_cert"
  | "check_pin"
  | "update"
  | "retry";

export interface ReasonText {
  title: string;
  message: string;
  fix: SyncFix | null;
  fixLabel: string | null;
}

export function reasonOf(error: SyncError): SyncReason {
  if (error.kind !== "signed_out") return error.kind;
  return /expired/i.test(error.serverMessage ?? "") ? "expired" : "revoked";
}

/** Reasons that stop sync until the user does something. */
export function isSessionEnded(reason: string | null | undefined): boolean {
  return reason === "expired" || reason === "revoked";
}

const TEXT: Record<SyncReason, ReasonText> = {
  expired: {
    title: "Signed out",
    message: "This phone's sign in to the server ran out.",
    fix: "sign_in",
    fixLabel: "Sign in again",
  },
  revoked: {
    title: "Signed out",
    message:
      "The server ended this phone's session. It may have been signed out from another device.",
    fix: "sign_in",
    fixLabel: "Sign in again",
  },
  proxy_login: {
    title: "Proxy sign in needed",
    message: "The proxy in front of this server wants you to sign in again.",
    fix: "proxy_sign_in",
    fixLabel: "Sign in to the proxy",
  },
  basic_auth: {
    title: "Proxy password needed",
    message: "The proxy in front of this server asked for its password.",
    fix: "proxy_password",
    fixLabel: "Enter the password",
  },
  client_cert: {
    title: "Certificate refused",
    message: "The server did not accept this phone's certificate.",
    fix: "pick_cert",
    fixLabel: "Pick a certificate",
  },
  tls: {
    title: "Untrusted server",
    message: "The server's certificate is not trusted by this phone.",
    fix: "retry",
    fixLabel: "Try again",
  },
  pin_mismatch: {
    title: "Server key changed",
    message:
      "The server shows another key than the one pinned for it. If you changed its certificate, pin the new key.",
    fix: "check_pin",
    fixLabel: "Check the pin",
  },
  offline: {
    title: "Offline",
    message: "Can't reach the server. Sync will try again soon.",
    fix: "retry",
    fixLabel: "Try again",
  },
  server: {
    title: "Server problem",
    message: "The server had a problem. Sync will try again soon.",
    fix: "retry",
    fixLabel: "Try again",
  },
  version_mismatch: {
    title: "Update needed",
    message: "This server uses a newer sync version. Update the app.",
    fix: "update",
    fixLabel: "Check for updates",
  },
  not_termix: {
    title: "Not a Termix server",
    message: "The address does not answer like a Termix server.",
    fix: null,
    fixLabel: null,
  },
  no_sync: {
    title: "Sync is off",
    message: "Sync is not turned on for this server.",
    fix: null,
    fixLabel: null,
  },
  different_account: {
    title: "Different user",
    message:
      "You signed in as a different user than this server account belongs to.",
    fix: "sign_in",
    fixLabel: "Sign in again",
  },
};

export function describeReason(reason: string | null | undefined): ReasonText {
  return (
    TEXT[(reason ?? "") as SyncReason] ?? {
      title: "Sync stopped",
      message: reason || "Something went wrong.",
      fix: "retry",
      fixLabel: "Try again",
    }
  );
}
