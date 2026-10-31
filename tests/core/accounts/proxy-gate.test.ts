import { needsProxySignIn } from "@/core/accounts/proxy-gate";
import type { ServerAccount } from "@/core/accounts";
import { AccountClient } from "@/core/api/AccountClient";
import { accountStorage } from "@/core/storage/kv";
import { resetStorage } from "../../helpers/http";
import { clearFakeNet, fakeNet } from "../../helpers/net";

beforeEach(resetStorage);
afterEach(clearFakeNet);

const account = (patch: Partial<ServerAccount> = {}): ServerAccount => ({
  id: "s1",
  kind: "server",
  serverUrl: "https://termix.example",
  serverName: null,
  serverVersion: null,
  username: "luke",
  remoteUserId: null,
  isAdmin: false,
  status: "idle",
  lastError: null,
  linkedAt: "2026-10-01T00:00:00Z",
  lastSyncAt: null,
  disabledTypes: [],
  options: {},
  ...patch,
});

const client = () =>
  new AccountClient({
    accountId: "s1",
    serverUrl: "https://termix.example",
    storage: accountStorage("s1"),
  });

test("asks when the proxy answered instead of Termix", () => {
  expect(
    needsProxySignIn(
      account({ status: "error", lastError: "proxy_login" }),
      client(),
    ),
  ).toBe(true);
});

test("asks when a saved proxy cookie ran out", async () => {
  fakeNet();
  const c = client();
  await c.setProxyCookies([
    { name: "CF_Authorization", value: "a", expires: 10 },
  ]);
  expect(needsProxySignIn(account(), c, 9)).toBe(false);
  expect(needsProxySignIn(account(), c, 10)).toBe(true);
});

test("never asks for This device, a signed out server or a server with no proxy", () => {
  expect(needsProxySignIn({ id: "local", kind: "local" }, client())).toBe(
    false,
  );
  expect(
    needsProxySignIn(
      account({ status: "signed_out", lastError: "proxy_login" }),
      client(),
    ),
  ).toBe(false);
  expect(needsProxySignIn(account(), client())).toBe(false);
  expect(needsProxySignIn(account({ lastError: "proxy_login" }), null)).toBe(
    false,
  );
});
