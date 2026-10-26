import { serverRepositories } from "@/core/data/server";
import type { SSHHost } from "@/types";

const host = { id: 4, syncId: "s4", name: "web" } as SSHHost;

function fakeClient() {
  const api = {
    hosts: {
      getSSHHosts: jest.fn(async () => [host]),
      createSSHHost: jest.fn(async () => host),
      updateSSHHost: jest.fn(async () => host),
      deleteSSHHost: jest.fn(async () => ({})),
      reorderHosts: jest.fn(async () => ({})),
      bulkUpdateHosts: jest.fn(async () => ({})),
      setConnectFrom: jest.fn(async () => true),
    },
    credentials: {
      getSSHHostWithCredentials: jest.fn(async () => null),
      getCredentials: jest.fn(async () => ({ credentials: [{ id: 1 }] })),
      getCredentialDetails: jest.fn(async () => ({ id: 1 })),
      createCredential: jest.fn(async () => ({ id: 2 })),
      updateCredential: jest.fn(async () => ({ id: 2 })),
      deleteCredential: jest.fn(async () => ({})),
    },
    snippets: {
      getSnippets: jest.fn(async () => [
        { id: 1, name: "a" },
        { id: 2, name: "b" },
      ]),
      createSnippet: jest.fn(async () => ({ id: 3 })),
      updateSnippet: jest.fn(async () => ({ id: 3 })),
      deleteSnippet: jest.fn(async () => ({})),
      reorderSnippets: jest.fn(async () => ({})),
      getSnippetFolders: jest.fn(async () => ({ folders: [{ name: "ops" }] })),
      createSnippetFolder: jest.fn(async () => ({})),
      renameSnippetFolder: jest.fn(async () => ({})),
      deleteSnippetFolder: jest.fn(async () => ({})),
    },
    folders: {
      getFoldersWithStats: jest.fn(async () => ({
        folders: [{ name: "prod", color: "#f00" }, { color: "#0f0" }],
      })),
    },
    terminal: {
      getCommandHistory: jest.fn(async () => ["ls"]),
      saveCommandToHistory: jest.fn(async () => ({})),
      deleteCommandFromHistory: jest.fn(async () => ({})),
      clearCommandHistory: jest.fn(async () => ({})),
    },
  };
  return { api, client: { api } as never };
}

function memoryKV() {
  const map = new Map<string, string>();
  return {
    map,
    get: async (k: string) => map.get(k) ?? null,
    set: async (k: string, v: string) => void map.set(k, v),
    remove: async (k: string) => void map.delete(k),
    getJson: async <T>(k: string) =>
      map.has(k) ? (JSON.parse(map.get(k)!) as T) : null,
    setJson: async (k: string, v: unknown) =>
      void map.set(k, JSON.stringify(v)),
  };
}

test("each write tells its own list to reload, and only after it is done", async () => {
  const { client } = fakeClient();
  const repos = serverRepositories(client);
  const hosts = jest.fn();
  const snippets = jest.fn();
  repos.hosts.subscribe(hosts);
  repos.snippets.subscribe(snippets);
  await repos.hosts.update(4, {} as never);
  await repos.hosts.remove(4);
  await repos.hosts.reorder([{ id: 4, sortOrder: 0 }]);
  await repos.hosts.bulkUpdate([4], { pin: true });
  expect(hosts).toHaveBeenCalledTimes(4);
  expect(snippets).not.toHaveBeenCalled();
  await repos.snippets.remove(1);
  await repos.snippetFolders.rename("ops", "dev");
  expect(snippets).toHaveBeenCalledTimes(2);
});

test("lists accept a bare array or one inside an object", async () => {
  const { client } = fakeClient();
  const repos = serverRepositories(client);
  expect(await repos.credentials.list()).toEqual([{ id: 1 }]);
  expect(await repos.snippetFolders.list()).toEqual([{ name: "ops" }]);
  expect(await repos.snippets.get(2)).toEqual({ id: 2, name: "b" });
  expect(await repos.snippets.get(9)).toBeNull();
  // Folders with no name are dropped.
  expect(await repos.hostFolders.list()).toEqual([
    { name: "prod", color: "#f00", icon: undefined },
  ]);
});

test("host prefs live on the phone, keyed by the host's sync id", async () => {
  const { client } = fakeClient();
  const kv = memoryKV();
  const repos = serverRepositories(client, kv as never);
  await repos.hostPrefs.set(host, "font", "14");
  expect(kv.map.get("hostPref.s4.font")).toBe("14");
  expect(await repos.hostPrefs.get(host, "font")).toBe("14");
  await repos.hostPrefs.set(host, "font", null);
  expect(await repos.hostPrefs.get(host, "font")).toBeNull();
});

test("metric samples keep one a minute and drop those older than a week", async () => {
  const { client } = fakeClient();
  const repos = serverRepositories(client);
  const day = 24 * 60 * 60_000;
  await repos.metricSamples.append(host, { ts: 0 } as never);
  await repos.metricSamples.append(host, { ts: 30_000 } as never);
  await repos.metricSamples.append(host, { ts: 8 * day } as never);
  expect((await repos.metricSamples.range(host, 0)).map((p) => p.ts)).toEqual([
    8 * day,
  ]);
});

test("history goes to the server and the activity feed stays empty", async () => {
  const { api, client } = fakeClient();
  const repos = serverRepositories(client);
  expect(await repos.commandHistory.list(host)).toEqual(["ls"]);
  await repos.commandHistory.add(host, "pwd");
  await repos.commandHistory.remove(host, "pwd");
  await repos.commandHistory.clear(host);
  expect(api.terminal.saveCommandToHistory).toHaveBeenCalledWith(4, "pwd");
  expect(api.terminal.clearCommandHistory).toHaveBeenCalledWith(4);
  await repos.recentActivity.add({} as never);
  expect(await repos.recentActivity.list()).toEqual([]);
});

test("an origin the server can't keep is kept on the phone", async () => {
  const { api, client } = fakeClient();
  const kv = memoryKV();
  const repos = serverRepositories(client, kv as never);
  api.hosts.setConnectFrom.mockResolvedValueOnce(false);
  await repos.origins.set(4, "device");
  expect(await kv.getJson("hostOrigins")).toEqual({ "4": "device" });
  // A fresh copy reads the phone's saved choice.
  const again = serverRepositories(client, kv as never);
  expect(await again.origins.get({ id: 4 } as SSHHost)).toBe("device");
  expect(
    await again.origins.get({ id: 5, connectFrom: "server" } as SSHHost),
  ).toBe("server");
});
