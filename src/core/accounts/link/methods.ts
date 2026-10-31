/**
 * What a server offers for signing in, read from GET /users/auth/methods
 * (Termix 2.9+), with the older endpoints as a fallback.
 */
import type { AccountClient } from "@/core/api/AccountClient";

/** A button or form on the sign in screen. */
export type SignInOption =
  | { kind: "password" }
  /** A form method like LDAP: username and password sent to its own route. */
  | { kind: "form"; methodId: string; instanceId?: string; label: string }
  /** A provider the browser goes to, like an SSO provider. */
  | {
      kind: "redirect";
      methodId: string;
      instanceId?: string;
      label: string;
      autoStart?: boolean;
      /** A server before 2.9, which only has /users/oidc/authorize. */
      legacy?: boolean;
    }
  /**
   * The server's own page in the system browser, for anything the app can't
   * do itself. `passkey` when the server lists passkey sign in.
   */
  | { kind: "browser"; passkey?: boolean };

export interface ServerSignIn {
  /** Answers JSON like Termix. False when nothing answered at all. */
  reachable: boolean;
  /** A login proxy answers instead of Termix. */
  proxyGate: boolean;
  setupRequired: boolean;
  registrationAllowed: boolean;
  options: SignInOption[];
  /** False when the login policy turned remember me off. */
  rememberDevice: boolean;
}

interface PublicMethod {
  id: string;
  kind: "form" | "redirect";
  instances?: { id: string; label: string; autoStart?: boolean }[];
}

const LABELS: Record<string, string> = {
  ldap: "LDAP",
  oidc: "SSO",
};

/** Words for a method id the app has no name for. */
function labelFor(id: string): string {
  return (
    LABELS[id] ??
    id.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}

/** Turns the server's method list into the options the screen shows. */
export function optionsFromMethods(methods: PublicMethod[]): SignInOption[] {
  const out: SignInOption[] = [];
  let passkey = false;
  for (const method of methods) {
    const instances = method.instances?.length ? method.instances : null;
    if (method.id === "password") {
      out.push({ kind: "password" });
    } else if (method.id === "passkey") {
      // Passkeys belong to the server's address, so they run on its page.
      passkey = true;
    } else if (method.kind === "redirect") {
      for (const instance of instances ?? [null]) {
        out.push({
          kind: "redirect",
          methodId: method.id,
          instanceId: instance?.id,
          label: instance?.label || labelFor(method.id),
          ...(instance?.autoStart ? { autoStart: true } : {}),
        });
      }
    } else {
      for (const instance of instances ?? [null]) {
        out.push({
          kind: "form",
          methodId: method.id,
          instanceId: instance?.id,
          label: instance?.label || labelFor(method.id),
        });
      }
    }
  }
  // The server's own page handles passkeys and anything the app can't.
  out.push(passkey ? { kind: "browser", passkey: true } : { kind: "browser" });
  return out;
}

function looksHtml(contentType: string, body: string): boolean {
  return (
    contentType.includes("text/html") || /^\s*<(?:!doctype|html)/i.test(body)
  );
}

type Read = { status: number; json: unknown; html: boolean } | null;

/** GET a public JSON route. Null when nothing answered. */
async function read(client: AccountClient, path: string): Promise<Read> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await client.fetch(`${client.rootBase()}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": client.userAgent() },
    });
    const body = await res.text();
    const html = looksHtml(
      (res.headers.get("content-type") ?? "").toLowerCase(),
      body,
    );
    let json: unknown = null;
    if (!html) {
      try {
        json = body ? JSON.parse(body) : null;
      } catch {
        json = null;
      }
    }
    return { status: res.status, json, html };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const field = (value: unknown, key: string): unknown =>
  value && typeof value === "object"
    ? (value as Record<string, unknown>)[key]
    : undefined;

/** Reads what the server offers. Never throws. */
export async function readSignIn(client: AccountClient): Promise<ServerSignIn> {
  const [methods, setup, registration] = await Promise.all([
    read(client, "/users/auth/methods"),
    read(client, "/users/setup-required"),
    read(client, "/users/registration-allowed"),
  ]);
  const answers = [methods, setup, registration].filter(
    (r): r is NonNullable<Read> => !!r,
  );
  const proxyGate = answers.some((r) => r.html);
  const base = {
    reachable: answers.length > 0,
    proxyGate,
    setupRequired: field(setup?.json, "setup_required") === true,
    registrationAllowed: field(registration?.json, "allowed") === true,
    rememberDevice: field(methods?.json, "rememberDevice") !== false,
  };
  if (proxyGate || !base.reachable) return { ...base, options: [] };

  const list = field(methods?.json, "methods");
  if (methods?.status === 200 && Array.isArray(list)) {
    return { ...base, options: optionsFromMethods(list as PublicMethod[]) };
  }

  // Before 2.9: password login and one SSO provider.
  const [password, oidc] = await Promise.all([
    read(client, "/users/password-login-allowed"),
    read(client, "/users/oidc-config"),
  ]);
  const options: SignInOption[] = [];
  if (field(password?.json, "allowed") !== false)
    options.push({ kind: "password" });
  if (field(oidc?.json, "client_id")) {
    options.push({
      kind: "redirect",
      methodId: "oidc",
      label: "SSO",
      legacy: true,
    });
  }
  options.push({ kind: "browser" });
  return { ...base, options };
}
