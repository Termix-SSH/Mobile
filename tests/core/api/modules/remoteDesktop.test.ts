import { AccountClient } from "@/core/api/AccountClient";
import { accountStorage } from "@/core/storage/kv";
import { fakeServer, resetStorage } from "../../../helpers/http";

beforeEach(resetStorage);

test("prompted credentials are sent as typed, empty domain included", async () => {
  const seen = fakeServer(() => ({ data: { token: "test-token" } }));
  const c = new AccountClient({
    accountId: "a",
    serverUrl: "https://termix.example",
    storage: accountStorage("a"),
  });
  await c.api.remoteDesktop.getGuacamoleTokenFromHost(7, "rdp", {
    username: "user",
    password: " test password ",
    domain: "",
  });
  expect(seen[0].url).toBe("https://termix.example/guacamole/connect-host/7");
  expect(seen[0].data).toMatchObject({
    promptedUsername: "user",
    promptedPassword: " test password ",
    promptedDomain: "",
  });

  await c.api.remoteDesktop.getGuacamoleTokenFromHost(7, "vnc");
  expect(Object.keys(seen[1].data as object)).toEqual(["protocol"]);
  await c.api.remoteDesktop.getGuacamoleTokenFromHost(7);
  expect(seen[2].data ?? {}).toEqual({});
});
