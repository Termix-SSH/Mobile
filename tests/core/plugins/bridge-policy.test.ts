import {
  checkRequest,
  checkSocket,
  pageHeaders,
} from "@/core/plugins/bridge-policy";

const root = "https://termix.example";
const ok = (method: string, path: string, id = "alerts", base = root) =>
  checkRequest(id, base, method, `${base}${path}`).ok;

test("a plugin reaches its own routes and assets", () => {
  expect(ok("GET", "/plugin-api/alerts/items")).toBe(true);
  expect(ok("POST", "/plugin-api/alerts/items/read")).toBe(true);
  expect(ok("DELETE", "/plugin-api/alerts/items/3")).toBe(true);
  expect(ok("GET", "/plugin-api/alerts")).toBe(true);
  expect(ok("GET", "/plugin-assets/alerts/frontend.js")).toBe(true);
  expect(ok("POST", "/plugin-assets/alerts/x.js")).toBe(false);
});

test("another plugin's routes are refused", () => {
  expect(ok("GET", "/plugin-api/vault/secrets")).toBe(false);
  expect(ok("GET", "/plugin-api/alerts-evil/x")).toBe(false);
  expect(ok("GET", "/plugins/vault/settings/admin")).toBe(false);
});

test("its own settings can be read and saved", () => {
  expect(ok("GET", "/plugins/alerts/settings/user")).toBe(true);
  expect(ok("PUT", "/plugins/alerts/settings/admin")).toBe(true);
  expect(ok("PUT", "/plugins/alerts/settings/host/12")).toBe(true);
  expect(ok("DELETE", "/plugins/alerts/settings/user")).toBe(false);
});

test("core reads the SDK makes are allowed, writes are not", () => {
  for (const path of [
    "/host/db/host",
    "/host/db/host/4",
    "/host/folders",
    "/host/status",
    "/host/status/4",
    "/rbac/permissions/me",
    "/users/me",
    "/version",
    "/health",
    "/dashboard/uptime",
    "/dashboard/activity/recent",
    "/credentials",
    "/plugins",
  ]) {
    expect([path, ok("GET", path)]).toEqual([path, true]);
  }
  expect(ok("POST", "/users/ws-ticket")).toBe(true);
  expect(ok("POST", "/dashboard/activity/log")).toBe(true);
  expect(ok("POST", "/host/db/host")).toBe(false);
  expect(ok("DELETE", "/host/db/host/4")).toBe(false);
  expect(ok("GET", "/host/db/host/4/password")).toBe(false);
  expect(ok("GET", "/users/list")).toBe(false);
  expect(ok("POST", "/users/delete")).toBe(false);
  expect(ok("GET", "/credentials/3")).toBe(false);
  expect(ok("PATCH", "/plugins/alerts/state")).toBe(false);
});

test("other servers and tricks to leave the prefix are refused", () => {
  expect(
    checkRequest(
      "alerts",
      root,
      "GET",
      "https://evil.example/plugin-api/alerts/x",
    ).ok,
  ).toBe(false);
  expect(
    checkRequest(
      "alerts",
      root,
      "GET",
      "http://termix.example/plugin-api/alerts",
    ).ok,
  ).toBe(false);
  expect(ok("GET", "/plugin-api/alerts/..%2f..%2fusers/list")).toBe(false);
  expect(ok("GET", "/plugin-api/alerts/%2e%2e/%2e%2e/users")).toBe(false);
  expect(
    checkRequest(
      "alerts",
      root,
      "GET",
      "https://user:pw@termix.example/plugin-api/alerts/x",
    ).ok,
  ).toBe(false);
  // Plain ../ is resolved by the URL parser, so it is checked as /users/list.
  expect(ok("GET", "/plugin-api/alerts/../../users/list")).toBe(false);
});

test("a server under a path prefix keeps its prefix", () => {
  const base = "https://example.com/termix";
  expect(ok("GET", "/plugin-api/alerts/items", "alerts", base)).toBe(true);
  expect(
    checkRequest(
      "alerts",
      base,
      "GET",
      "https://example.com/plugin-api/alerts/items",
    ).ok,
  ).toBe(false);
});

test("sockets only reach the plugin's own socket routes", () => {
  expect(
    checkSocket(
      "kubernetes",
      root,
      "wss://termix.example/plugin-ws/kubernetes/console",
    ).ok,
  ).toBe(true);
  expect(
    checkSocket(
      "kubernetes",
      root,
      "wss://termix.example/plugin-ws/docker/console",
    ).ok,
  ).toBe(false);
  expect(
    checkSocket(
      "kubernetes",
      root,
      "ws://termix.example/plugin-ws/kubernetes/x",
    ).ok,
  ).toBe(false);
  expect(
    checkSocket(
      "kubernetes",
      "http://lan:30001",
      "ws://lan:30001/plugin-ws/kubernetes/x",
    ).ok,
  ).toBe(true);
});

test("the page can't set login, proxy or identity headers", () => {
  expect(
    pageHeaders({
      Accept: "application/json",
      "content-type": "text/plain",
      Authorization: "Bearer stolen",
      Cookie: "jwt=x",
      "CF-Access-Client-Id": "x",
      "X-Termix-Device-ID": "x",
      Host: "evil",
    }),
  ).toEqual({ Accept: "application/json", "content-type": "text/plain" });
});
