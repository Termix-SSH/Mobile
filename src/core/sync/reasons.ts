import type { SyncError, SyncErrorKind } from "./errors";
import { deviceWord } from "@/utils/device-word";
import { t } from "@/i18n";

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
    title: t("sync.reasons.signedOut"),
    message: t("sync.reasons.thisSSignInTo", { deviceWord }),
    fix: "sign_in",
    fixLabel: t("sync.reasons.signInAgain"),
  },
  revoked: {
    title: t("sync.reasons.signedOut"),
    message: t("sync.reasons.theServerEndedThisS", { deviceWord }),
    fix: "sign_in",
    fixLabel: t("sync.reasons.signInAgain"),
  },
  proxy_login: {
    title: t("sync.reasons.proxySignInNeeded"),
    message: t("sync.reasons.theProxyInFrontOf"),
    fix: "proxy_sign_in",
    fixLabel: t("sync.reasons.signInToTheProxy"),
  },
  basic_auth: {
    title: t("sync.reasons.proxyPasswordNeeded"),
    message: t("sync.reasons.theProxyInFrontOf2"),
    fix: "proxy_password",
    fixLabel: t("sync.reasons.enterThePassword"),
  },
  client_cert: {
    title: t("sync.reasons.certificateRefused"),
    message: t("sync.reasons.theServerDidNotAccept", { deviceWord }),
    fix: "pick_cert",
    fixLabel: t("sync.reasons.pickACertificate"),
  },
  tls: {
    title: t("sync.reasons.untrustedServer"),
    message: t("sync.reasons.theServerSCertificateIs", { deviceWord }),
    fix: "retry",
    fixLabel: t("sync.reasons.tryAgain"),
  },
  pin_mismatch: {
    title: t("sync.reasons.serverKeyChanged"),
    message: t("sync.reasons.theServerShowsAnotherKey"),
    fix: "check_pin",
    fixLabel: t("sync.reasons.checkThePin"),
  },
  offline: {
    title: t("sync.reasons.offline"),
    message: t("sync.reasons.canTReachTheServer"),
    fix: "retry",
    fixLabel: t("sync.reasons.tryAgain"),
  },
  server: {
    title: t("sync.reasons.serverProblem"),
    message: t("sync.reasons.theServerHadAProblem"),
    fix: "retry",
    fixLabel: t("sync.reasons.tryAgain"),
  },
  version_mismatch: {
    title: t("sync.reasons.updateNeeded"),
    message: t("sync.reasons.thisServerUsesANewer"),
    fix: "update",
    fixLabel: t("sync.reasons.checkForUpdates"),
  },
  not_termix: {
    title: t("sync.reasons.notATermixServer"),
    message: t("sync.reasons.theAddressDoesNotAnswer"),
    fix: null,
    fixLabel: null,
  },
  no_sync: {
    title: t("sync.reasons.syncIsOff"),
    message: t("sync.reasons.theSyncPluginIsOff"),
    fix: null,
    fixLabel: null,
  },
  different_account: {
    title: t("sync.reasons.differentUser"),
    message: t("sync.reasons.youSignedInAsA"),
    fix: "sign_in",
    fixLabel: t("sync.reasons.signInAgain"),
  },
};

export function describeReason(reason: string | null | undefined): ReasonText {
  return (
    TEXT[(reason ?? "") as SyncReason] ?? {
      title: t("sync.reasons.syncStopped"),
      message: reason || t("sync.reasons.somethingWentWrong"),
      fix: "retry",
      fixLabel: t("sync.reasons.tryAgain"),
    }
  );
}
