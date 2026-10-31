import { AccountClient } from "@/core/api/AccountClient";
import { accountStorage } from "@/core/storage/kv";
import { fakeServer, resetStorage } from "../../../helpers/http";

beforeEach(resetStorage);
afterEach(() => jest.restoreAllMocks());

async function client() {
  const c = new AccountClient({
    accountId: "a1",
    serverUrl: "https://termix.example",
    storage: accountStorage("a1"),
  });
  await c.setToken("tok");
  return c;
}

function spyLogs() {
  return [
    jest.spyOn(console, "error").mockImplementation(() => {}),
    jest.spyOn(console, "warn").mockImplementation(() => {}),
  ];
}

test("logging activity on a server without the feed stays quiet", async () => {
  fakeServer(() => ({
    status: 404,
    data: { error: "Recent activity is not available" },
  }));
  const c = await client();
  const logs = spyLogs();
  await expect(
    c.api.homepage.logActivity("terminal", 1, "web"),
  ).rejects.toMatchObject({ response: { status: 404 } });
  for (const log of logs) expect(log).not.toHaveBeenCalled();
});

test("other activity failures are still reported", async () => {
  fakeServer(() => ({ status: 500, data: { error: "broken" } }));
  const c = await client();
  const [error] = spyLogs();
  await expect(
    c.api.homepage.logActivity("terminal", 1, "web"),
  ).rejects.toMatchObject({ status: 500 });
  expect(error).toHaveBeenCalled();
});
