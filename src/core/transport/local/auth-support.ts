/**
 * Which sign in types the phone engine can do alone and which need a linked
 * server plugin. Local mode reads this to say what is missing.
 */
import { AppError } from "@/core/errors";

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
    why: "the sign in and the certificate live on the server",
  },
  vault: {
    plugin: "vault",
    title: "Vault",
    why: "the sign in and the certificate live on the server",
  },
  stepca: {
    plugin: "step-ca",
    title: "Step CA",
    why: "the sign in and the certificate live on the server",
  },
  agent: {
    plugin: "ssh-terminal",
    title: "SSH agent",
    why: "the phone has no SSH agent",
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
    return `This host signs in with "${authType}", which needs a Termix server. Link one to connect.`;
  }
  return `${info.title} needs a Termix server because ${info.why}. Link one and connect this host through it.`;
}

export function secretRefMessage(): string {
  return "This host uses a 1Password reference, which needs a Termix server with Secret Sources. Link one and connect this host through it.";
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
  stepca: "Step CA",
};

/**
 * File and Docker connects can't start a browser sign in, only the terminal
 * can. Returns what to tell the user, or null for any other reply.
 */
export function signInFirstMessage(interaction: unknown): string | null {
  if (typeof interaction !== "string") return null;
  const title = BROWSER_SIGN_IN_TITLES[interaction];
  return title
    ? `Sign in with ${title} first. Open a terminal to this host once, then try again.`
    : null;
}
