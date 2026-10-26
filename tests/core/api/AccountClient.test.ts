import { AccountClient } from "@/core/api/AccountClient";
import { ApiError } from "@/core/api/errors";
import { leftServer } from "@/core/api/http";
import { accountStorage } from "@/core/storage/kv";
import { fakeServer, resetStorage } from "../../helpers/http";
import { clearFakeNet, fakeNet } from "../../helpers/net";

beforeEach(resetStorage);
afterEach(clearFakeNet);

function client(id = "a1", serverUrl = "https://termix.example/") {
  return new AccountClient({
    accountId: id,
    serverUrl,
    storage: accountStorage(id),
  });
}

test("sends the account's token, proxy headers and user agent", async () => {
  const seen = fakeServer(() => ({ data: { username: "luke" } }));
  const c = client();
  await c.setToken("tok-1");
  await c.setProxy({ customHeaders: [{ name: "X-Proxy", value: "yes" }] });
  await c.api.auth.getUserInfo();
  expect(seen[0].url).toBe("https://termix.example/users/me");
  expect(seen[0].headers.Authorization).toBe("Bearer tok-1");
  expect(seen[0].headers["X-Proxy"]).toBe("yes");
  expect(String(seen[0].headers["User-Agent"])).toMatch(/^Termix-Mobile\//);
});

test("two accounts never share a token", async () => {
  const seen = fakeServer(() => ({ data: {} }));
  const a = client("a", "https://one.example");
  const b = client("b", "https://two.example");
  await a.setToken("token-a");
  await b.setToken("token-b");
  await a.api.auth.getUserInfo();
  await b.api.auth.getUserInfo();
  expect(seen.map((r) => [r.url, r.headers.Authorization])).toEqual([
    ["https://one.example/users/me", "Bearer token-a"],
    ["https://two.example/users/me", "Bearer token-b"],
  ]);
});

test("the token survives a restart through secure storage", async () => {
  const first = client();
  await first.setToken("kept");
  const second = client();
  await second.load();
  expect(second.token()).toBe("kept");
  expect(second.isAuthenticated()).toBe(true);
});

test("a 401 on a critical endpoint signs the account out", async () => {
  fakeServer(() => ({ status: 401, data: { error: "expired" } }));
  const c = client();
  await c.setToken("old");
  const lost = jest.fn();
  c.onAuthLost(lost);
  await expect(c.api.auth.getUserInfo()).rejects.toBeInstanceOf(ApiError);
  await c.authChecked();
  expect(lost).toHaveBeenCalledTimes(1);
  expect(c.token()).toBeNull();
});

test("a 401 caused by a stray jwt cookie keeps the session", async () => {
  let calls = 0;
  // The first request carries the stale cookie; the check after it works.
  fakeServer(() =>
    calls++ === 0
      ? { status: 401, data: { error: "expired" } }
      : { data: { userId: "u1" } },
  );
  const c = client();
  await c.setToken("good");
  const lost = jest.fn();
  c.onAuthLost(lost);
  await expect(c.api.auth.getUserInfo()).rejects.toBeInstanceOf(ApiError);
  await c.authChecked();
  expect(lost).not.toHaveBeenCalled();
  expect(c.token()).toBe("good");
});

test("detects a 2.9 server and rewrites old paths to plugin routes", async () => {
  const seen = fakeServer((req) => {
    if (req.url.endsWith("/plugins/public-manifest")) return { data: {} };
    if (req.url.endsWith("/plugins")) {
      return { data: [{ id: "snippets", enabled: true, state: "active" }] };
    }
    return { data: [] };
  });
  const c = client();
  await c.setToken("t");
  await c.refreshServerApi();
  expect(c.isPluginApi()).toBe(true);
  expect(c.supports({ plugin: "snippets" })).toBe(true);
  expect(c.supports({ plugin: "docker" })).toBe(false);
  await c.api.snippets.getSnippets();
  expect(seen[seen.length - 1].url).toBe(
    "https://termix.example/plugin-api/snippets",
  );
});

test("a server that answers the manifest with HTML is pre 2.9", async () => {
  fakeServer((req) =>
    req.url.endsWith("/plugins/public-manifest")
      ? { data: "<!doctype html><html></html>" }
      : { data: { version: "2.8.0" } },
  );
  const c = client();
  await c.refreshServerApi();
  expect(c.isPluginApi()).toBe(false);
  // Older servers have every feature built in.
  expect(c.supports({ plugin: "docker" })).toBe(true);
  expect(c.supports({ plugin: "tailscale", pluginApiOnly: true })).toBe(false);
});

test("the cached generation and plugin list load before the network", async () => {
  fakeServer((req) =>
    req.url.endsWith("/plugins")
      ? { data: [{ id: "docker", enabled: true, state: "active" }] }
      : { data: {} },
  );
  const first = client();
  await first.refreshServerApi();
  const again = client();
  await again.load();
  expect(again.isPluginApi()).toBe(true);
  expect(again.isPluginEnabled("docker")).toBe(true);
  expect(again.isPluginEnabled("tunnels")).toBe(false);
});

test("the server's plugins that are off are kept for Settings, not for features", async () => {
  fakeServer((req) =>
    req.url.endsWith("/plugins")
      ? {
          data: [
            { id: "docker", enabled: true, state: "active" },
            { id: "tunnels", enabled: false, state: "disabled" },
          ],
        }
      : { data: {} },
  );
  const first = client();
  await first.refreshServerApi();
  expect(first.serverPlugins?.map((p) => [p.id, p.active])).toEqual([
    ["docker", true],
    ["tunnels", false],
  ]);
  expect(first.supports({ plugin: "tunnels" })).toBe(false);
  const again = client();
  await again.load();
  expect(again.serverPlugins).toEqual(first.serverPlugins);
  expect(again.enabledPlugins?.map((p) => p.id)).toEqual(["docker"]);
});

test("socket URLs follow the server generation", async () => {
  fakeServer(() => ({ data: {} }));
  const c = client("a", "https://termix.example/ssh");
  expect(c.terminalWebSocketUrl("t")).toBe(
    "wss://termix.example/ssh/websocket/?token=t",
  );
  expect(c.remoteDesktopWebSocketUrl("t", 10, 20)).toBe(
    "wss://termix.example/guacamole/websocket/?token=t&width=10&height=20",
  );
  expect(c.remoteDesktopWebSocketUrl("t", 10, 20, 192)).toBe(
    "wss://termix.example/guacamole/websocket/?token=t&width=10&height=20&dpi=192",
  );
  await c.refreshServerApi();
  expect(c.terminalWebSocketUrl("t")).toBe(
    "wss://termix.example/plugin-ws/ssh-terminal/terminal",
  );
  expect(c.dockerConsoleWebSocketUrl("t")).toBe(
    "wss://termix.example/plugin-ws/docker/console",
  );
});

test("a client certificate goes to the native store, not to secure storage", async () => {
  const net = fakeNet();
  const c = client();
  const info = await c.setClientCert({
    base64: "AAAA",
    passphrase: "pw",
    name: "me.p12",
  });
  expect(info).toEqual({ name: "me.p12", subject: "CN=phone", notAfter: null });
  expect(net.certs.get("a1")).toBe("termix.example");
  const again = client();
  await again.load();
  expect(again.clientCert()).toEqual(info);
  expect(
    JSON.stringify(await again.storage.secrets.getJson("clientCert")),
  ).not.toContain("AAAA");
});

test("a certificate saved by an older build is ignored", async () => {
  await accountStorage("a1").secrets.setJson("clientCert", {
    pfx: "A",
    passphrase: "",
    name: null,
  });
  const c = client();
  await c.load();
  expect(c.clientCert()).toBeNull();
});

test("basic auth is sent, and the session moves to the jwt cookie", async () => {
  const seen = fakeServer(() => ({ data: {} }));
  const c = client();
  await c.setToken("tok");
  await c.setProxy({ basicAuth: { username: "u", password: "p" } });
  await c.api.auth.getUserInfo();
  expect(seen[0].headers.Authorization).toBe("Basic dTpw");
  expect(seen[0].headers.Cookie).toBe("jwt=tok");
});

test("proxy cookies never keep a jwt cookie and go back in the jar on load", async () => {
  const net = fakeNet();
  const c = client();
  await c.setProxyCookies([
    { name: "CF_Authorization", value: "cf" },
    { name: "jwt", value: "old" },
  ]);
  expect(c.proxyCookies()).toEqual([{ name: "CF_Authorization", value: "cf" }]);
  net.cookies.clear();
  const again = client();
  await again.load();
  expect(net.cookies.get("https://termix.example")).toEqual([
    { name: "CF_Authorization", value: "cf" },
  ]);
});

test("a redirect to a proxy login page asks for the proxy, not a new session", async () => {
  fakeServer(() => ({
    data: "<!doctype html><title>Sign in</title>",
    responseURL: "https://team.cloudflareaccess.com/cdn-cgi/access/login",
  }));
  const c = client();
  await c.setToken("tok");
  const lost = jest.fn();
  c.onAuthLost(lost);
  await expect(c.api.auth.getUserInfo()).rejects.toMatchObject({
    code: "PROXY_LOGIN",
  });
  expect(lost).not.toHaveBeenCalled();
  expect(c.token()).toBe("tok");
});

test("only a redirect to another host counts as leaving the server", () => {
  const config = { baseURL: "https://termix.example", url: "/users/me" };
  expect(leftServer(config, "https://termix.example/login")).toBe(false);
  expect(leftServer(config, "https://auth.example/login")).toBe(true);
  expect(leftServer(config, undefined)).toBe(false);
  expect(
    leftServer({ url: "https://termix.example/x" }, "https://sso.example/"),
  ).toBe(true);
});

test("load never puts an old proxy cookie over a renewed one", async () => {
  const net = fakeNet();
  const c = client();
  await c.setProxyCookies([
    { name: "authelia_session", value: "old", expires: 9e12 },
  ]);
  net.cookies.clear();
  net.jarCookies = [{ name: "authelia_session", value: "renewed" }];
  const again = client();
  await again.load();
  expect(net.cookies.size).toBe(0);
  expect(again.proxyCookies()).toEqual([
    { name: "authelia_session", value: "renewed", expires: 9e12 },
  ]);
  const third = client();
  await third.load();
  expect(third.proxyCookies()[0].value).toBe("renewed");
});

test("only cookies the jar lost go back in", async () => {
  const net = fakeNet();
  net.jarCookies = [{ name: "kept", value: "1" }];
  const c = client();
  await c.setProxyCookies([
    { name: "kept", value: "1" },
    { name: "lost", value: "2" },
  ]);
  expect(net.cookies.get("https://termix.example")).toEqual([
    { name: "lost", value: "2" },
  ]);
});

test("says when a saved proxy cookie ran out", async () => {
  fakeNet();
  const c = client();
  await c.setProxyCookies([
    { name: "CF_Authorization", value: "a", expires: 50 },
  ]);
  expect(c.proxyCookiesExpired(49)).toBe(false);
  expect(c.proxyCookiesExpired(50)).toBe(true);
});

test("a new token clears the login cookie the server would read first", async () => {
  const net = fakeNet();
  const c = client();
  await c.setToken("device");
  expect(net.cleared).toEqual([["https://termix.example", "jwt"]]);
  await c.setToken("device");
  expect(net.cleared).toHaveLength(1);
});

test("on iOS with a certificate, requests go through the native module", async () => {
  const net = fakeNet({ nativeRequests: true });
  net.reply = () => ({
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "luke" }),
    url: "",
  });
  fakeServer(() => ({ data: { username: "wrong path" } }));
  const c = client();
  await c.setToken("tok");
  await c.setClientCert({ base64: "AAAA", passphrase: "pw", name: null });
  expect(c.usesNativeNetwork()).toBe(true);
  const me = await c.api.auth.getUserInfo();
  expect(me.username).toBe("luke");
  expect(net.requests[0].url).toBe("https://termix.example/users/me");
  expect(net.requests[0].headers.Authorization).toBe("Bearer tok");
});

test("on iOS with a certificate, relay sockets use the native socket", async () => {
  const net = fakeNet({ nativeRequests: true });
  const c = client();
  await c.setProxy({ customHeaders: [{ name: "X-Proxy", value: "1" }] });
  await c.setClientCert({ base64: "AAAA", passphrase: "pw", name: null });
  c.openSocket("wss://termix.example/plugin-ws/core/ssh-relay", [
    "termix.jwt.t",
  ]);
  const [, url, protocols, headers] = (net.openSocket as jest.Mock).mock
    .calls[0];
  expect(url).toBe("wss://termix.example/plugin-ws/core/ssh-relay");
  expect(protocols).toEqual(["termix.jwt.t"]);
  expect(headers["X-Proxy"]).toBe("1");
});

test("wipe removes every saved secret and the certificate", async () => {
  const net = fakeNet();
  const c = client();
  await c.setToken("t");
  await c.setClientCert({ base64: "A", passphrase: "", name: null });
  await c.wipe();
  const again = client();
  await again.load();
  expect(again.token()).toBeNull();
  expect(again.clientCert()).toBeNull();
  expect(net.certs.size).toBe(0);
});

test("a 401 for a token that was swapped meanwhile keeps the new session", async () => {
  let release: () => void = () => {};
  let sent: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  const reached = new Promise<void>((resolve) => (sent = resolve));
  fakeServer(async () => {
    sent();
    await gate;
    return { status: 401, data: { error: "Session not found" } };
  });
  const c = client();
  await c.setToken("login-token");
  const lost = jest.fn();
  c.onAuthLost(lost);
  const pending = c.api.auth.getUserInfo().catch(() => null);
  await reached;
  await c.setToken("device-token");
  release();
  await pending;
  expect(lost).not.toHaveBeenCalled();
  expect(c.token()).toBe("device-token");

  // The same failure with the current token does end it.
  await c.api.auth.getUserInfo().catch(() => null);
  await c.authChecked();
  expect(lost).toHaveBeenCalledTimes(1);
  expect(c.token()).toBeNull();
});

test("pins go to the native store by host, are kept, and come back on load", async () => {
  const net = fakeNet({ nativeRequests: true });
  const pin = "K".repeat(43) + "=";
  const c = client();
  expect(c.usesNativeNetwork()).toBe(false);
  await c.setCertPins([pin]);
  expect(net.pins.get("termix.example")).toEqual([pin]);
  // On iOS a pinned server's requests go through the module, which checks it.
  expect(c.usesNativeNetwork()).toBe(true);
  net.pins.clear();
  const again = client();
  await again.load();
  expect(again.certPins()).toEqual([pin]);
  expect(net.pins.get("termix.example")).toEqual([pin]);
  await again.setCertPins([]);
  expect(net.pins.size).toBe(0);
  expect(client().certPins()).toEqual([]);
});

test("wipe unpins the server", async () => {
  const net = fakeNet();
  const c = client();
  await c.setCertPins(["K".repeat(43) + "="]);
  await c.wipe();
  expect(net.pins.size).toBe(0);
  expect(c.certPins()).toEqual([]);
});
