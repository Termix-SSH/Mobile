/**
 * Which sign in types the phone engine can do alone and which need a linked
 * server plugin. Local mode reads this to say what is missing.
 */
import { AppError } from "@/core/errors";
import { deviceWord } from "@/utils/device-word";
import { t } from "@/i18n";

export const DEVICE_AUTH_TYPES = [
  "password",
  "key",
  "credential",
  "none",
  "tailscale",
];

interface ServerAuth {
  plugin: string;
  title: string;
  why: string;
}

const SERVER_AUTH: Record<string, ServerAuth> = {
  opkssh: {
    plugin: "opkssh",
    title: "OPKSSH",
    why: t("transport.local.authSupport.theSignInAndThe"),
  },
  vault: {
    plugin: "vault",
    title: t("transport.local.authSupport.vault"),
    why: t("transport.local.authSupport.theSignInAndThe"),
  },
  stepca: {
    plugin: "step-ca",
    title: t("transport.local.authSupport.stepCa"),
    why: t("transport.local.authSupport.theSignInAndThe"),
  },
  agent: {
    plugin: "ssh-terminal",
    title: t("transport.local.authSupport.sshAgent"),
    why: t("transport.local.authSupport.theHasNoSshAgent", { deviceWord }),
  },
};

/** Plugin ids behind server only sign in types, for showing them in a picker. */
export function serverAuthPlugin(authType: string): string | null {
  return SERVER_AUTH[authType]?.plugin ?? null;
}

export function isDeviceAuth(authType: string): boolean {
  return DEVICE_AUTH_TYPES.includes(authType);
}

const SECRET_REF = /^op:\/\//;

/** A password or key that is a 1Password reference; only the server can read it. */
export function hasSecretRef(...values: (string | undefined | null)[]) {
  return values.some((v) => typeof v === "string" && SECRET_REF.test(v.trim()));
}

export function needsServerMessage(authType: string): string {
  const info = SERVER_AUTH[authType];
  if (!info) {
    return t("transport.local.authSupport.thisHostSignsInWith", { authType });
  }
  return t("transport.local.authSupport.needsATermixServerBecause", {
    title: info.title,
    why: info.why,
  });
}

export function secretRefMessage(): string {
  return t("transport.local.authSupport.thisHostUsesA1password");
}

/** Throws when the phone cannot sign in with this type or these secrets. */
export function assertDeviceAuth(
  authType: string,
  ...secrets: (string | undefined | null)[]
): void {
  if (!isDeviceAuth(authType)) {
    throw new AppError(needsServerMessage(authType), "AUTH_NEEDS_SERVER");
  }
  if (hasSecretRef(...secrets)) {
    throw new AppError(secretRefMessage(), "AUTH_NEEDS_SERVER");
  }
}

/** Sign ins the server runs in a browser, by interaction id. */
export const BROWSER_SIGN_IN_TITLES: Record<string, string> = {
  opkssh: "OPKSSH",
  vault: "Vault",
  stepca: t("transport.local.authSupport.stepCa"),
};

/**
 * File and Docker connects can't start a browser sign in, only the terminal
 * can. Returns what to tell the user, or null for any other reply.
 */
export function signInFirstMessage(interaction: unknown): string | null {
  if (typeof interaction !== "string") return null;
  const title = BROWSER_SIGN_IN_TITLES[interaction];
  return title
    ? t("transport.local.authSupport.signInWithFirstOpen", { title })
    : null;
}
