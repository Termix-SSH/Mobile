import type { AccountClient } from "@/core/api/AccountClient";
import { checkServerAddress } from "@/core/accounts/link/address";
import {
  APP_CALLBACK_URL,
  browserCanceled,
  browserSignInUrl,
  callbackErrorText,
  finishLoginAnswer,
  parseCallback,
  redirectStartUrl,
  signInWithForm,
  typedFactor,
  verifySecondFactor,
} from "@/core/accounts/link/login";
import { optionsFromMethods, readSignIn } from "@/core/accounts/link/methods";

type Route = (init: RequestInit) => {
  status?: number;
  body: string;
  type?: string;
};

/** A client whose fetch answers from a table of paths. */
function fakeClient(routes: Record<string, Route>) {
  const seen: { path: string; init: RequestInit }[] = [];
  let token: string | null = null;
  const client = {
    accountId: "a1",
    serverUrl: "https://t.example",
    rootBase: () => "https://t.example",
    userAgent: () => "Termix-Mobile/iOS",
    token: () => token,
    setToken: jest.fn(async (value: string) => {
      token = value;
    }),
    api: {
      auth: {
        getOIDCAuthorizeUrl: jest.fn(async () => ({
          auth_url: "https://idp/legacy",
        })),
      },
      totp: {
        verifyTOTPLogin: jest.fn(async () => {
          token = "from-legacy";
        }),
      },
    },
    fetch: jest.fn(async (url: string, init: RequestInit = {}) => {
      const path = url.replace("https://t.example", "");
      seen.push({ path, init });
      const key = Object.keys(routes).find((k) => path.startsWith(k));
      if (!key) return new Response("", { status: 404 });
      const reply = routes[key](init);
      return new Response(reply.body, {
        status: reply.status ?? 200,
        headers: { "content-type": reply.type ?? "application/json" },
      });
    }),
  };
  return { client: client as unknown as AccountClient, seen, raw: client };
}

const json =
  (value: unknown, status = 200) =>
  () => ({
    status,
    body: JSON.stringify(value),
  });

test("addresses get https, keep a path and refuse junk", () => {
  expect(checkServerAddress("termix.example.com/")).toEqual({
    ok: true,
    url: "https://termix.example.com",
    insecure: false,
  });
  expect(checkServerAddress("http://10.0.0.5:30001/termix")).toEqual({
    ok: true,
    url: "http://10.0.0.5:30001/termix",
    insecure: true,
  });
  expect(checkServerAddress("")).toMatchObject({ ok: false });
  expect(checkServerAddress("a b")).toMatchObject({ ok: false });
  expect(checkServerAddress("ftp://x")).toMatchObject({ ok: false });
  expect(checkServerAddress("host:99999")).toMatchObject({ ok: false });
});

test("the method list becomes forms, one button per provider and the browser", () => {
  expect(
    optionsFromMethods([
      { id: "password", kind: "form" },
      { id: "passkey", kind: "form" },
      {
        id: "ldap",
        kind: "form",
        instances: [{ id: "1", label: "Corp LDAP" }],
      },
      {
        id: "oidc",
        kind: "redirect",
        instances: [
          { id: "g", label: "Google", autoStart: true },
          { id: "k", label: "Keycloak" },
        ],
      },
    ]),
  ).toEqual([
    { kind: "password" },
    { kind: "form", methodId: "ldap", instanceId: "1", label: "Corp LDAP" },
    {
      kind: "redirect",
      methodId: "oidc",
      instanceId: "g",
      label: "Google",
      autoStart: true,
    },
    { kind: "redirect", methodId: "oidc", instanceId: "k", label: "Keycloak" },
    { kind: "browser", passkey: true },
  ]);
});

test("without passkeys on the server the browser option is a plain one", () => {
  expect(optionsFromMethods([{ id: "password", kind: "form" }])).toEqual([
    { kind: "password" },
    { kind: "browser" },
  ]);
});

test("callback errors and a closed browser read in plain words", () => {
  expect(callbackErrorText("no_token")).toMatch(/26.10.6/);
  expect(callbackErrorText("user_not_allowed")).toMatch(/isn't allowed/);
  expect(callbackErrorText("Some other text")).toBe("Some other text");
  expect(browserCanceled("cancel")).toBe(true);
  expect(browserCanceled("dismiss")).toBe(true);
  expect(browserCanceled("success")).toBe(false);
});

test("a 2.9+ server is read from its method list", async () => {
  const { client } = fakeClient({
    "/users/auth/methods": json({
      methods: [{ id: "password", kind: "form" }],
      rememberDevice: false,
    }),
    "/users/setup-required": json({ setup_required: false }),
    "/users/registration-allowed": json({ allowed: true }),
  });
  expect(await readSignIn(client)).toEqual({
    reachable: true,
    proxyGate: false,
    setupRequired: false,
    registrationAllowed: true,
    rememberDevice: false,
    options: [{ kind: "password" }, { kind: "browser" }],
  });
});

test("an older server falls back to the old routes", async () => {
  const { client } = fakeClient({
    "/users/setup-required": json({ setup_required: true }),
    "/users/registration-allowed": json({ allowed: false }),
    "/users/password-login-allowed": json({ allowed: true }),
    "/users/oidc-config": json({ client_id: "x" }),
  });
  const found = await readSignIn(client);
  expect(found.setupRequired).toBe(true);
  expect(found.options).toEqual([
    { kind: "password" },
    { kind: "redirect", methodId: "oidc", label: "SSO", legacy: true },
    { kind: "browser" },
  ]);
});

test("a login proxy and a dead server are told apart", async () => {
  const html = () => ({
    body: "<!doctype html><p>login</p>",
    type: "text/html",
  });
  const gate = fakeClient({ "/users": html }).client;
  expect(await readSignIn(gate)).toMatchObject({
    reachable: true,
    proxyGate: true,
    options: [],
  });
  const { client: dead, raw } = fakeClient({});
  raw.fetch.mockRejectedValue(new Error("Network request failed"));
  expect(await readSignIn(dead)).toMatchObject({ reachable: false });
});

test("a form login saves the token, or asks for a second factor", async () => {
  const { client, seen, raw } = fakeClient({
    "/users/auth/ldap/verify": json({ success: true, token: "T".repeat(30) }),
  });
  const result = await signInWithForm(
    client,
    { kind: "form", methodId: "ldap", instanceId: "1", label: "LDAP" },
    " me ",
    "pw",
  );
  expect(result).toEqual({ kind: "signedIn" });
  expect(raw.setToken).toHaveBeenCalledWith("T".repeat(30));
  expect(seen[0].path).toBe("/users/auth/ldap/verify?instance=1");
  expect(JSON.parse(String(seen[0].init.body))).toMatchObject({
    username: "me",
    password: "pw",
    rememberMe: true,
  });
  expect((seen[0].init.headers as Record<string, string>)["User-Agent"]).toBe(
    "Termix-Mobile/iOS",
  );

  expect(
    await finishLoginAnswer(client, 200, {
      requires_totp: true,
      temp_token: "tmp",
      second_factors: [{ id: "totp" }, { id: "security-key" }],
    }),
  ).toEqual({
    kind: "secondFactor",
    step: { tempToken: "tmp", factors: ["totp", "security-key"] },
  });
  await expect(
    finishLoginAnswer(client, 401, { error: "Invalid credentials" }),
  ).rejects.toThrow("Invalid credentials");
});

test("redirect logins get their address, old servers use the old route", async () => {
  const { client, seen } = fakeClient({
    "/users/auth/oidc/start": json({ redirectUrl: "https://idp/x" }),
  });
  expect(
    await redirectStartUrl(client, {
      kind: "redirect",
      methodId: "oidc",
      instanceId: "k",
      label: "Keycloak",
    }),
  ).toBe("https://idp/x");
  expect(seen[0].path).toBe(
    `/users/auth/oidc/start?appCallbackUrl=${encodeURIComponent(APP_CALLBACK_URL)}&instance=k`,
  );
  expect(
    await redirectStartUrl(client, {
      kind: "redirect",
      methodId: "oidc",
      label: "SSO",
      legacy: true,
    }),
  ).toBe("https://idp/legacy");
  expect(browserSignInUrl(client)).toBe(
    `https://t.example/?return_to=${encodeURIComponent(APP_CALLBACK_URL)}`,
  );
  expect(browserSignInUrl(client, "abc12345")).toBe(
    `https://t.example/?return_to=${encodeURIComponent(`${APP_CALLBACK_URL}/abc12345`)}`,
  );
});

test("a TOTP code finishes the login, with the old route on old servers", async () => {
  const { client } = fakeClient({
    "/users/auth/second-factor/totp/verify": json({
      success: true,
      token: "S".repeat(30),
    }),
  });
  const step = { tempToken: "tmp", factors: ["totp"] };
  expect(await verifySecondFactor(client, step, "totp", " 123456 ")).toEqual({
    kind: "signedIn",
  });
  const old = fakeClient({});
  expect(await verifySecondFactor(old.client, step, "totp", "1")).toEqual({
    kind: "signedIn",
  });
  expect(old.raw.api.totp.verifyTOTPLogin).toHaveBeenCalledWith("tmp", "1");
  expect(typedFactor({ tempToken: "t", factors: ["security-key"] })).toBeNull();
});

test("the app link back from the browser is read by hand", () => {
  expect(parseCallback("https://x")).toBeNull();
  expect(parseCallback(`${APP_CALLBACK_URL}?token=abc%3D`)).toEqual({
    kind: "token",
    token: "abc=",
    flow: null,
  });
  expect(
    parseCallback(
      `${APP_CALLBACK_URL}?second_factor=1&temp_token=t&second_factors=totp,security-key`,
    ),
  ).toEqual({
    kind: "secondFactor",
    step: { tempToken: "t", factors: ["totp", "security-key"] },
    flow: null,
  });
  expect(parseCallback(`${APP_CALLBACK_URL}?error=Denied+here`)).toEqual({
    kind: "error",
    message: "Denied here",
    flow: null,
  });
  expect(parseCallback(APP_CALLBACK_URL)).toMatchObject({ kind: "error" });
});
