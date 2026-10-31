/**
 * Signing in to one server through its own client, never the active account.
 * Every way ends with a token saved on that client, or a second factor step.
 */
import type { AccountClient } from "@/core/api/AccountClient";
import { AppError } from "@/core/errors";
import type { SignInOption } from "./methods";

/** The app's own address the server sends the browser back to. */
export const APP_CALLBACK_URL = "termix-mobile://oidc-callback";

/** The callback for one sign in, with its flow id in the path. */
export function callbackUrlFor(flow: string | null): string {
  return flow ? `${APP_CALLBACK_URL}/${flow}` : APP_CALLBACK_URL;
}

export interface SecondFactorStep {
  tempToken: string;
  /** Factor ids the user may answer with, like totp or security-key. */
  factors: string[];
}

export type LoginResult =
  { kind: "signedIn" } | { kind: "secondFactor"; step: SecondFactorStep };

function factorsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((f) => (typeof f === "string" ? f : (f as { id?: unknown })?.id))
    .filter((id): id is string => typeof id === "string" && !!id);
}

async function postJson(
  client: AccountClient,
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await client.fetch(`${client.rootBase()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      // Termix only puts the token in the body for its apps.
      "User-Agent": client.userAgent(),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (/^\s*<(?:!doctype|html)/i.test(text)) {
    throw new AppError(
      "A login proxy answered instead of Termix. Sign in to the proxy first.",
      "PROXY_AUTH_GATE",
    );
  }
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  return { status: res.status, data };
}

/** Saves the session from a login answer, or returns the second factor step. */
export async function finishLoginAnswer(
  client: AccountClient,
  status: number,
  data: Record<string, unknown>,
): Promise<LoginResult> {
  if (status < 200 || status >= 300) {
    const message =
      typeof data.error === "string" && data.error
        ? data.error
        : status === 401
          ? "Wrong username or password"
          : `Sign in failed (HTTP ${status})`;
    throw new AppError(
      message,
      status === 429 ? "RATE_LIMITED" : "AUTH_FAILED",
    );
  }
  if (data.requires_totp || data.requires_second_factor) {
    const tempToken = String(data.temp_token ?? "");
    if (!tempToken)
      throw new AppError("The server did not send a token.", "AUTH_FAILED");
    const factors = factorsOf(data.second_factors);
    return {
      kind: "secondFactor",
      step: { tempToken, factors: factors.length ? factors : ["totp"] },
    };
  }
  const token = typeof data.token === "string" ? data.token : "";
  if (!token)
    throw new AppError("The server did not send a session.", "AUTH_FAILED");
  await client.setToken(token);
  return { kind: "signedIn" };
}

export async function signInWithPassword(
  client: AccountClient,
  username: string,
  password: string,
): Promise<LoginResult> {
  const res = await client.api.auth.loginUser(username.trim(), password);
  const data = res as unknown as Record<string, unknown>;
  if (data.requires_totp) {
    const factors = factorsOf(data.second_factors);
    return {
      kind: "secondFactor",
      step: {
        tempToken: String(data.temp_token || data.token || ""),
        factors: factors.length ? factors : ["totp"],
      },
    };
  }
  if (!client.token()) {
    throw new AppError("The server did not send a session.", "AUTH_FAILED");
  }
  return { kind: "signedIn" };
}

/** A form method other than password, like LDAP. */
export async function signInWithForm(
  client: AccountClient,
  option: Extract<SignInOption, { kind: "form" }>,
  username: string,
  password: string,
): Promise<LoginResult> {
  const query = option.instanceId
    ? `?instance=${encodeURIComponent(option.instanceId)}`
    : "";
  const { status, data } = await postJson(
    client,
    `/users/auth/${encodeURIComponent(option.methodId)}/verify${query}`,
    {
      username: username.trim(),
      password,
      rememberMe: true,
      instanceId: option.instanceId,
    },
  );
  return finishLoginAnswer(client, status, data);
}

/** Where the browser goes for a redirect method. */
export async function redirectStartUrl(
  client: AccountClient,
  option: Extract<SignInOption, { kind: "redirect" }>,
  flow: string | null = null,
): Promise<string> {
  if (option.legacy) {
    const res = await client.api.auth.getOIDCAuthorizeUrl(APP_CALLBACK_URL);
    if (!res?.auth_url)
      throw new AppError("The server sent no sign in address.", "AUTH_FAILED");
    return res.auth_url;
  }
  const params = new URLSearchParams({ appCallbackUrl: callbackUrlFor(flow) });
  if (option.instanceId) params.set("instance", option.instanceId);
  const res = await client.fetch(
    `${client.rootBase()}/users/auth/${encodeURIComponent(option.methodId)}/start?${params.toString()}`,
    {
      headers: { Accept: "application/json", "User-Agent": client.userAgent() },
    },
  );
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const url = data.redirectUrl ?? data.auth_url;
  if (!res.ok || typeof url !== "string" || !url) {
    throw new AppError(
      typeof data.error === "string"
        ? data.error
        : "The server sent no sign in address.",
      "AUTH_FAILED",
    );
  }
  return url;
}

/** The server's own login page, which hands the session back to the app. */
export function browserSignInUrl(
  client: AccountClient,
  flow: string | null = null,
): string {
  return `${client.rootBase()}/?return_to=${encodeURIComponent(callbackUrlFor(flow))}`;
}

/** Answers a second factor with a code, like TOTP or a backup code. */
export async function verifySecondFactor(
  client: AccountClient,
  step: SecondFactorStep,
  factorId: string,
  code: string,
): Promise<LoginResult> {
  const { status, data } = await postJson(
    client,
    `/users/auth/second-factor/${encodeURIComponent(factorId)}/verify`,
    {
      temp_token: step.tempToken,
      code: code.trim(),
      totp_code: code.trim(),
      rememberMe: true,
    },
  );
  if (status === 404 && factorId === "totp") {
    // Servers before 2.9 only have the TOTP route.
    await client.api.totp.verifyTOTPLogin(step.tempToken, code.trim());
    if (!client.token())
      throw new AppError("The server did not send a session.", "AUTH_FAILED");
    return { kind: "signedIn" };
  }
  return finishLoginAnswer(client, status, data);
}

export type CallbackResult = (
  | { kind: "token"; token: string }
  | { kind: "secondFactor"; step: SecondFactorStep }
  | { kind: "error"; message: string }
) & {
  /** The sign in it belongs to, from the path. Null on old servers. */
  flow?: string | null;
};

/** Reads the app link the server sent the browser back to. */
export function parseCallback(url: string): CallbackResult | null {
  const result = readCallback(url);
  if (!result) return null;
  const path = url.slice(APP_CALLBACK_URL.length).split("?")[0];
  const flow = /^\/[A-Za-z0-9]{8,64}$/.test(path) ? path.slice(1) : null;
  return { ...result, flow };
}

function readCallback(url: string): CallbackResult | null {
  if (!url.startsWith(APP_CALLBACK_URL)) return null;
  const rest = url.slice(APP_CALLBACK_URL.length);
  if (rest && !/^[/?]/.test(rest)) return null;
  const at = url.indexOf("?");
  const params: Record<string, string> = {};
  // Hermes' URL does not parse custom schemes well, so split by hand.
  for (const pair of (at === -1 ? "" : url.slice(at + 1)).split("&")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    try {
      params[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(
        pair.slice(eq + 1).replace(/\+/g, " "),
      );
    } catch {
      // A broken pair is skipped.
    }
  }
  if (params.error) {
    return { kind: "error", message: callbackErrorText(params.error) };
  }
  if (params.second_factor === "1") {
    if (!params.temp_token)
      return { kind: "error", message: "The server did not send a token." };
    const factors = (params.second_factors ?? "").split(",").filter(Boolean);
    return {
      kind: "secondFactor",
      step: {
        tempToken: params.temp_token,
        factors: factors.length ? factors : ["totp"],
      },
    };
  }
  if (params.token) return { kind: "token", token: params.token };
  return { kind: "error", message: "The server did not send a token." };
}

const CALLBACK_ERRORS: Record<string, string> = {
  no_token:
    "The page signed you in but sent no session back. Update the server to Termix 26.10.6 or newer.",
  user_not_allowed: "This account isn't allowed to sign in here.",
  user_not_found: "No Termix account matches that sign in.",
};

/** Plain words for an error code the server put on the callback. */
export function callbackErrorText(code: string): string {
  return CALLBACK_ERRORS[code] ?? code;
}

/** The browser closed without coming back to the app. */
export function browserCanceled(type: string): boolean {
  return type === "cancel" || type === "dismiss";
}

/** Factors the app can answer itself; the rest go through the browser. */
export function typedFactor(step: SecondFactorStep): string | null {
  return step.factors.find((f) => f === "totp") ?? null;
}
