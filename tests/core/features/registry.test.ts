import { AccountClient } from "@/core/api/AccountClient";
import { FeatureRegistry } from "@/core/features/registry";
import type { FeatureDef } from "@/core/features/types";
import { accountStorage } from "@/core/storage/kv";
import { resetStorage } from "../../helpers/http";

beforeEach(resetStorage);

const local = {
  account: { id: "local", kind: "local" } as const,
  client: null,
};

async function serverCtx(plugins: unknown[] | null, generation = "plugin") {
  const client = new AccountClient({
    accountId: "s",
    serverUrl: "https://t.example",
    storage: accountStorage("s"),
  });
  await client.storage.data.set("apiGeneration", generation);
  if (plugins) await client.storage.data.setJson("enabledPlugins", plugins);
  await client.load();
  return { account: { id: "s", kind: "server" } as any, client };
}

const Dummy = () => null;

function feature(id: string, extra: Partial<FeatureDef> = {}): FeatureDef {
  return { id, title: id, source: "native", ...extra };
}

test("register returns an unregister, and ids are unique", () => {
  const r = new FeatureRegistry();
  const listener = jest.fn();
  r.subscribe(listener);
  const off = r.register(feature("a"));
  expect(() => r.register(feature("a"))).toThrow(/already registered/);
  expect(r.all()).toHaveLength(1);
  off();
  expect(r.all()).toHaveLength(0);
  expect(listener).toHaveBeenCalledTimes(2);
});

test("server features need their plugin, local ones need availableOn", async () => {
  const r = new FeatureRegistry();
  r.register(feature("needs-docker", { requires: { plugin: "docker" } }));
  r.register(feature("everywhere", { availableOn: ["local", "server"] }));
  r.register(feature("server-only"));

  expect(r.available(local).map((d) => d.id)).toEqual(["everywhere"]);
  const off = await serverCtx([{ id: "ssh-terminal" }]);
  expect(r.available(off).map((d) => d.id)).toEqual([
    "everywhere",
    "server-only",
  ]);
  await resetStorage();
  const on = await serverCtx([{ id: "docker" }]);
  expect(r.available(on).map((d) => d.id)).toContain("needs-docker");
});

test("contributions are merged across features and sorted", async () => {
  const r = new FeatureRegistry();
  const action = (id: string, order: number) => ({
    id,
    label: id,
    icon: Dummy,
    group: "connect" as const,
    order,
    isAvailable: () => true,
    run: () => {},
  });
  r.register(feature("a", { hostActions: [action("late", 50)] }));
  r.register(
    feature("b", {
      hostActions: [action("early", 10)],
      requires: { plugin: "b" },
    }),
  );
  const ctx = await serverCtx(null, "legacy");
  expect(r.hostActions(ctx).map((a) => a.id)).toEqual(["early", "late"]);
});

test("session tabs are found by local and server type, and gated per protocol", async () => {
  const r = new FeatureRegistry();
  r.register(
    feature("rd", {
      requires: { plugin: "rd" },
      sessionTabs: [
        {
          type: "remote",
          icon: Dummy,
          titleSuffix: () => "",
          shortLabel: () => "",
          serverTabTypes: ["rdp", "vnc"],
          toServerTabType: (s) => s.remoteProtocol ?? "rdp",
          fromServerTabType: (t) => ({ remoteProtocol: t }),
          requires: (s) => ({ plugin: "rd", protocol: s.remoteProtocol }),
          capabilities: ["own-keyboard"],
          component: Dummy,
        },
      ],
    }),
  );
  expect(r.sessionTab("remote")).not.toBeNull();
  expect(r.sessionTabForServerType("vnc")?.opts).toEqual({
    remoteProtocol: "vnc",
  });
  expect(r.sessionTabForServerType("files")).toBeNull();
  expect(r.sessionHas("remote", "own-keyboard")).toBe(true);
  expect(r.sessionHas("remote", "terminal-input")).toBe(false);

  const ctx = await serverCtx([{ id: "rd", protocols: ["rdp"] }]);
  expect(r.canOpen("remote", { remoteProtocol: "rdp" }, ctx)).toBe(true);
  expect(r.canOpen("remote", { remoteProtocol: "vnc" }, ctx)).toBe(false);
  expect(r.canOpen("remote", {}, local)).toBe(false);
  expect(r.canOpen("missing", {}, ctx)).toBe(false);
});

test("capabilities come from available features only", async () => {
  const r = new FeatureRegistry();
  r.register(
    feature("wol", {
      requires: { plugin: "wake-on-lan" },
      capabilities: ["host.quickConnect"],
    }),
  );
  const off = await serverCtx([]);
  expect(r.hasCapability("host.quickConnect", off)).toBe(false);
  await resetStorage();
  const on = await serverCtx([{ id: "wake-on-lan" }]);
  expect(r.hasCapability("host.quickConnect", on)).toBe(true);
});

test("session tabs name their feature and what they need from the transport", () => {
  const r = new FeatureRegistry();
  r.register(
    feature("files", {
      title: "File Manager",
      sessionTabs: [
        {
          type: "fm",
          icon: Dummy,
          titleSuffix: () => "",
          shortLabel: () => "",
          serverTabTypes: [],
          toServerTabType: () => "fm",
          needs: ["server"],
          component: Dummy,
        },
      ],
    }),
  );
  expect(r.sessionFeature("fm")?.title).toBe("File Manager");
  expect(r.sessionNeeds("fm")).toEqual([["server"]]);
  expect(r.sessionFeature("missing")).toBeNull();
  expect(r.sessionNeeds("missing")).toEqual([[]]);
  expect(r.serverOnly("fm")).toBe(true);
  expect(r.serverOnly("missing")).toBe(false);
});

test("a tab that works over SFTP or the server is not server only", () => {
  const r = new FeatureRegistry();
  r.register(
    feature("files", {
      sessionTabs: [
        {
          type: "fm",
          icon: Dummy,
          titleSuffix: () => "",
          shortLabel: () => "",
          serverTabTypes: [],
          toServerTabType: () => "fm",
          needs: ["server"],
          needsOneOf: [["sftp"], ["server"]],
          component: Dummy,
        },
      ],
    }),
  );
  expect(r.sessionNeeds("fm")).toEqual([["sftp"], ["server"]]);
  expect(r.serverOnly("fm")).toBe(false);
});

test("companions are listed per tab type and host, by order", () => {
  const r = new FeatureRegistry();
  const companion = (id: string, order: number, ok = true) => ({
    id,
    title: id,
    icon: Dummy,
    order,
    forTabTypes: ["terminal"],
    isAvailable: () => ok,
    component: Dummy,
  });
  r.register(
    feature("a", {
      availableOn: ["local"],
      companions: [
        companion("b", 2),
        companion("a", 1),
        companion("off", 0, false),
      ],
    }),
  );
  r.register(feature("server-only", { companions: [companion("s", 3)] }));
  const host = { id: 1 } as any;
  expect(r.companionsFor("terminal", host, local).map((c) => c.id)).toEqual([
    "a",
    "b",
  ]);
  expect(r.companionsFor("filemanager", host, local)).toEqual([]);
});

test("dashboard cards come from available features, filtered per host and ordered", () => {
  const r = new FeatureRegistry();
  const card = (id: string, order: number, want: boolean) => ({
    id,
    title: id,
    order,
    tabType: id,
    isAvailable: () => want,
    component: Dummy,
  });
  r.register(
    feature("phone", {
      availableOn: ["local", "server"],
      dashboardCards: [
        card("b", 20, true),
        card("a", 10, true),
        card("off", 5, false),
      ],
    }),
  );
  r.register(feature("server-only", { dashboardCards: [card("s", 1, true)] }));
  const host = { id: 1 } as any;
  expect(r.dashboardCards(host, local).map((c) => c.id)).toEqual(["a", "b"]);
});

test("tools come sorted from available features only", async () => {
  const r = new FeatureRegistry();
  const tool = (id: string, order: number) => ({
    id,
    label: id,
    icon: Dummy,
    order,
  });
  r.register(
    feature("files", {
      availableOn: ["local", "server"],
      tools: [{ ...tool("files", 20), tabType: "files" }],
    }),
  );
  r.register(
    feature("snippets", {
      availableOn: ["local", "server"],
      tools: [{ ...tool("snippets", 10), href: "/snippets" }],
    }),
  );
  r.register(
    feature("docker", {
      requires: { plugin: "docker" },
      tools: [tool("docker", 5)],
    }),
  );

  expect(r.tools(local).map((t) => t.id)).toEqual(["snippets", "files"]);
  const server = await serverCtx([]);
  expect(r.tools(server).map((t) => t.id)).toEqual(["snippets", "files"]);
});
