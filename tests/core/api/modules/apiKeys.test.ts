import { AccountClient } from "@/core/api/AccountClient";
import { accountStorage } from "@/core/storage/kv";
import { fakeServer, resetStorage } from "../../../helpers/http";

beforeEach(resetStorage);

async function client() {
  const c = new AccountClient({
    accountId: "a",
    serverUrl: "https://termix.example/",
    storage: accountStorage("a"),
  });
  await c.load();
  return c;
}

const created = {
  id: "k1",
  name: "CI",
  tokenPrefix: "tmx_abc",
  token: "tmx_abcdef",
};

test("a new key comes back with its token as the server sends it", async () => {
  const seen = fakeServer(() => ({ status: 201, data: created }));
  const c = await client();
  expect(await c.api.apiKeys.createApiKey("CI", "u1")).toEqual(created);
  expect(seen[0]).toMatchObject({
    method: "POST",
    data: { name: "CI", userId: "u1", expiresAt: null },
  });
});

test("a key wrapped in apiKey is unwrapped", async () => {
  fakeServer(() => ({ status: 201, data: { apiKey: created } }));
  const c = await client();
  expect(await c.api.apiKeys.createApiKey("CI", "u1")).toEqual(created);
});
