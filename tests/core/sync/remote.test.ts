import { AxiosError } from "axios";
import { AccountClient } from "@/core/api/AccountClient";
import { classifyRemoteError, SyncError } from "@/core/sync/errors";
import { reasonOf } from "@/core/sync/reasons";
import { SyncRemote } from "@/core/sync/remote";
import { accountStorage } from "@/core/storage/kv";
import { fakeServer, resetStorage } from "../../helpers/http";
import { exchange } from "../../helpers/syncServer";

beforeEach(resetStorage);

function remote(token: string | null = "dev") {
  const client = new AccountClient({
    accountId: "a1",
    serverUrl: "https://termix.example",
    storage: accountStorage("a1"),
  });
  if (token) void client.setToken(token);
  return { client, remote: new SyncRemote(client) };
}

/** Serves the recorded answer for each request, by name. */
function replay(names: Record<string, string>) {
  return fakeServer((req) => {
    const path = req.url.replace("https://termix.example", "");
    const name = names[`${req.method} ${path}`];
    if (!name) return { status: 404, data: { error: "Not found" } };
    const { response } = exchange(name);
    return {
      status: response.status,
      data: response.body,
      headers: { "content-type": response.contentType ?? "" },
    };
  });
}

test("info, link and refresh read the server's real answers", async () => {
  const seen = replay({
    "GET /sync/v2/info": "info",
    "POST /sync/v2/link": "link-phone",
    "POST /sync/v2/session/refresh": "refresh",
  });
  const { remote: r } = remote();
  expect(await r.info()).toMatchObject({ termix: true, protocol: 1 });
  expect(seen[0].headers.Authorization).toBeUndefined();
  expect(seen[0].params).toEqual({ clientType: "mobile" });

  const linked = await r.link("login-tok", {
    deviceName: "Phone",
    deviceId: "mobile-1234",
  });
  expect(linked).toMatchObject({
    token: "<device-token-phone>",
    user: { username: "fixture" },
  });
  expect(seen[1].headers.Authorization).toBe("Bearer login-tok");
  expect(seen[1].data).toEqual({
    deviceName: "Phone",
    deviceId: "mobile-1234",
    clientType: "mobile",
  });

  expect(await r.refresh()).toBeNull();
});

test("changes pages, push results and host ids parse as recorded", async () => {
  const seen = replay({
    "GET /sync/v2/changes": "changes-0",
    "POST /sync/v2/push": "push-phone-mixed",
    "GET /sync/v2/hosts/44444444-4444-4444-8444-444444444444": "host-id",
    "GET /sync/v2/hosts/not-a-host": "host-id-missing",
  });
  const { remote: r } = remote();
  const page = await r.changes(0, { limit: 4, types: ["hosts", "snippets"] });
  expect(page.hasMore).toBe(true);
  expect(page.entityTypes.find((t) => t.type === "hosts")?.order).toBe(50);
  expect(seen[0].params).toEqual({
    cursor: "0",
    limit: "4",
    types: "hosts,snippets",
  });

  const results = await r.push([]);
  expect(results.map((x) => x.status)).toEqual([
    "conflict",
    "rejected",
    "rejected",
    "ok",
  ]);

  expect(await r.hostId("44444444-4444-4444-8444-444444444444")).toBe(2);
  expect(await r.hostId("not-a-host")).toBeNull();
});

test("a revoked session is a signed out error with the server's reason", async () => {
  replay({ "GET /sync/v2/changes": "changes-after-unlink" });
  const { remote: r } = remote();
  const error = await r.changes(0).catch((e) => e);
  expect(error).toBeInstanceOf(SyncError);
  expect(error).toMatchObject({
    kind: "signed_out",
    serverMessage: "Invalid token",
  });
  expect(reasonOf(error)).toBe("revoked");
});

test("a newer protocol or a server without sync is said so", async () => {
  fakeServer(() => ({ data: { termix: true, protocol: 2 } }));
  await expect(remote().remote.info()).rejects.toMatchObject({
    kind: "version_mismatch",
  });

  // Termix with the Sync plugin off answers Express's own 404 page.
  fakeServer(() => ({
    status: 404,
    data: "<!DOCTYPE html><html><body><pre>Cannot GET /sync/v2/info</pre></body></html>",
    headers: { "content-type": "text/html; charset=utf-8" },
  }));
  await expect(remote().remote.info()).rejects.toMatchObject({
    kind: "no_sync",
  });
});

test("a proxy login page is not mistaken for a signed out session", async () => {
  fakeServer(() => ({
    data: "<html><title>Sign in</title></html>",
    headers: { "content-type": "text/html" },
  }));
  await expect(remote().remote.changes(0)).rejects.toMatchObject({
    kind: "proxy_login",
  });
});

test("behind basic auth the session goes as the jwt cookie", async () => {
  const seen = fakeServer(() => ({
    data: { token: "dev", user: { id: "u" } },
  }));
  const { client, remote: r } = remote(null);
  await client.setProxy({ basicAuth: { username: "a", password: "b" } });
  await r.link("login-tok", { deviceName: "P", deviceId: "mobile-1234" });
  expect(seen[0].headers.Authorization).toBe("Basic YTpi");
  expect(seen[0].headers.Cookie).toBe("jwt=login-tok");
});

describe("classifyRemoteError", () => {
  const httpError = (status: number, data: unknown, headers = {}) =>
    new AxiosError("x", "ERR", { headers: {} } as any, null, {
      status,
      data,
      headers,
      statusText: "",
      config: {} as any,
    });

  test.each([
    [httpError(401, { error: "Session has expired" }), "signed_out"],
    [
      httpError(401, "nope", { "www-authenticate": 'Basic realm="x"' }),
      "basic_auth",
    ],
    [httpError(401, "<html></html>"), "proxy_login"],
    [httpError(302, ""), "proxy_login"],
    [httpError(404, { error: "Not found" }), "no_sync"],
    [httpError(500, { error: "boom" }), "server"],
    [new AxiosError("Network Error", "ERR_NETWORK"), "offline"],
    [
      new AxiosError(
        "SSL handshake failed: certificate required",
        "ERR_NETWORK",
      ),
      "client_cert",
    ],
    [
      new AxiosError(
        "The certificate for this server is invalid",
        "ERR_NETWORK",
      ),
      "tls",
    ],
  ])("%#", (error, kind) => {
    expect(classifyRemoteError(error).kind).toBe(kind);
  });

  test("an expired session reads as expired", () => {
    const error = classifyRemoteError(
      httpError(401, { error: "Session has expired" }),
    );
    expect(reasonOf(error)).toBe("expired");
  });
});
