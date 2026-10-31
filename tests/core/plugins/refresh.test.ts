import { accounts } from "@/core/accounts";
import { refreshPluginLists } from "@/core/plugins/refresh";
import { fakeServer, resetStorage } from "../../helpers/http";

beforeEach(resetStorage);

afterEach(async () => {
  await accounts.setActive("local");
  for (const a of accounts.list()) {
    if (a.kind === "server") await accounts.remove(a.id);
  }
});

test("every signed in linked server reloads its plugins, except the skipped one", async () => {
  const asked: string[] = [];
  fakeServer((req) => {
    if (req.url.endsWith("/plugins")) {
      asked.push(new URL(req.url).host);
      return { data: [{ id: "alerts", enabled: false, state: "disabled" }] };
    }
    return { data: {} };
  });
  const one = await accounts.add("https://one.example");
  const two = await accounts.add("https://two.example");
  const three = await accounts.add("https://three.example");
  for (const a of [one, two, three]) {
    const c = accounts.client(a.id)!;
    await c.load();
    await c.storage.data.set("apiGeneration", "plugin");
    c.apiGeneration = "plugin";
  }
  await accounts.client(one.id)!.setToken("t1");
  await accounts.client(two.id)!.setToken("t2");

  await refreshPluginLists(two.id);

  expect(asked).toEqual(["one.example"]);
  expect(accounts.client(one.id)!.isPluginEnabled("alerts")).toBe(false);
});
