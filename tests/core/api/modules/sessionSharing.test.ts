import { AccountClient } from "@/core/api/AccountClient";
import { guestLink } from "@/core/api/modules/sessionSharing";
import { accountStorage } from "@/core/storage/kv";
import { canShare } from "@/features/session-sharing/register";
import { fakeServer, resetStorage } from "../../../helpers/http";

beforeEach(resetStorage);

async function client() {
  const c = new AccountClient({
    accountId: "a",
    serverUrl: "https://termix.example/base/",
    storage: accountStorage("a"),
  });
  await c.storage.data.set("apiGeneration", "plugin");
  await c.storage.data.setJson("enabledPlugins", [
    { id: "session-sharing", enabled: true, state: "active" },
  ]);
  await c.load();
  return c;
}

test("a link share is made for the live ssh session", async () => {
  const seen = fakeServer(() => ({
    data: { shareId: "s1", linkToken: "tok", expiresAt: null },
  }));
  const c = await client();
  const share = await c.api.sessionSharing.createLink({
    hostId: 4,
    sessionId: "sess",
    tabInstanceId: "tab",
    permissionLevel: "read-only",
    expiryHours: 8,
  });
  expect(share.linkToken).toBe("tok");
  expect(seen[0].url).toBe(
    "https://termix.example/base/plugin-api/session-sharing/create",
  );
  expect(seen[0].data).toEqual({
    hostId: 4,
    sessionId: "sess",
    tabInstanceId: "tab",
    protocol: "ssh",
    shareType: "link",
    permissionLevel: "read-only",
    expiryHours: 8,
  });
});

test("guest links use the admin's public address, else the server's", async () => {
  fakeServer(() => ({ data: { url: "https://public.example" } }));
  const c = await client();
  expect(await c.api.sessionSharing.publicUrl()).toBe("https://public.example");
  fakeServer(() => ({ data: { url: null } }));
  const other = await client();
  expect(await other.api.sessionSharing.publicUrl()).toBe(
    "https://termix.example/base",
  );
});

test("the link matches the web app's", () => {
  expect(guestLink("https://t.example/app?x=1#y", "a b")).toBe(
    "https://t.example/app?view=shared&token=a+b",
  );
  expect(guestLink("file:///index.html", "t")).toBeNull();
  expect(guestLink("not a url", "t")).toBeNull();
});

test("only relay terminal sessions with a server session can be shared", () => {
  const ctx = (over: object) =>
    ({
      session: { type: "terminal", backendSessionId: "s" },
      transport: "relay",
      ...over,
    }) as never;
  expect(canShare(ctx({}))).toBe(true);
  expect(canShare(ctx({ transport: "local" }))).toBe(false);
  expect(
    canShare(ctx({ session: { type: "terminal", backendSessionId: null } })),
  ).toBe(false);
  expect(
    canShare(ctx({ session: { type: "docker", backendSessionId: "s" } })),
  ).toBe(false);
});
