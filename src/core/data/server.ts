import type { AccountClient } from "@/core/api/AccountClient";
import type { JsonKV } from "@/core/storage/kv";
import type { Credential, Snippet, SnippetFolder, SSHHost } from "@/types";
import type { DataRepositories, MetricPoint } from "./types";

const asList = <T>(data: unknown, key: string): T[] => {
  if (Array.isArray(data)) return data as T[];
  const nested = (data as Record<string, unknown> | null)?.[key];
  return Array.isArray(nested) ? (nested as T[]) : [];
};

/** A tiny signal per domain, so lists reload after this app's own writes. */
function signal() {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    after<T>(promise: Promise<T>): Promise<T> {
      return promise.then((value) => {
        listeners.forEach((listener) => listener());
        return value;
      });
    },
  };
}

/** A linked server, read and written live until sync fills its local copy. */
export function serverRepositories(
  client: AccountClient,
  // Keeps an origin the server can't, like an older ssh-terminal plugin.
  phone?: JsonKV,
): DataRepositories {
  const { hosts, credentials, snippets, folders, terminal } = client.api;
  const hostChanges = signal();
  const credentialChanges = signal();
  const snippetChanges = signal();
  const historyChanges = signal();
  const prefChanges = signal();
  const prefKey = (host: SSHHost, key: string) =>
    `hostPref.${host.syncId || host.id}.${key}`;
  const recentOrigins = new Map<number, string>();
  const metricMemory = new Map<number, MetricPoint[]>();

  return {
    source: "server",
    hosts: {
      subscribe: hostChanges.subscribe,
      list: () => hosts.getSSHHosts(),
      // The full host, with its secrets, for the editor.
      get: async (id) =>
        (await credentials.getSSHHostWithCredentials(id)) ?? null,
      create: (draft) => hostChanges.after(hosts.createSSHHost(draft)),
      update: (id, draft) => hostChanges.after(hosts.updateSSHHost(id, draft)),
      remove: (id) => hostChanges.after(hosts.deleteSSHHost(id).then(() => {})),
      reorder: (positions) => hostChanges.after(hosts.reorderHosts(positions)),
      bulkUpdate: (ids, updates) =>
        hostChanges.after(hosts.bulkUpdateHosts(ids, updates)),
    },
    hostFolders: {
      subscribe: hostChanges.subscribe,
      list: async () =>
        asList<{ name?: string; color?: string; icon?: string }>(
          await folders.getFoldersWithStats(),
          "folders",
        )
          .filter((f) => typeof f?.name === "string")
          .map((f) => ({ name: f.name!, color: f.color, icon: f.icon })),
    },
    credentials: {
      subscribe: credentialChanges.subscribe,
      list: async () =>
        asList<Credential>(await credentials.getCredentials(), "credentials"),
      get: async (id) => (await credentials.getCredentialDetails(id)) ?? null,
      create: (draft) =>
        credentialChanges.after(credentials.createCredential(draft)),
      update: (id, draft) =>
        credentialChanges.after(credentials.updateCredential(id, draft)),
      remove: (id) =>
        credentialChanges.after(
          credentials.deleteCredential(id).then(() => {}),
        ),
    },
    snippets: {
      subscribe: snippetChanges.subscribe,
      list: async () =>
        asList<Snippet>(await snippets.getSnippets(), "snippets"),
      get: async (id) =>
        asList<Snippet>(await snippets.getSnippets(), "snippets").find(
          (s) => s.id === id,
        ) ?? null,
      create: (draft) => snippetChanges.after(snippets.createSnippet(draft)),
      update: (id, draft) =>
        snippetChanges.after(snippets.updateSnippet(id, draft)),
      remove: (id) =>
        snippetChanges.after(snippets.deleteSnippet(id).then(() => {})),
      reorder: (items) =>
        snippetChanges.after(snippets.reorderSnippets(items).then(() => {})),
    },
    snippetFolders: {
      subscribe: snippetChanges.subscribe,
      list: async () =>
        asList<SnippetFolder>(await snippets.getSnippetFolders(), "folders"),
      create: (folder) =>
        snippetChanges.after(
          snippets.createSnippetFolder(folder).then(() => {}),
        ),
      rename: (oldName, newName) =>
        snippetChanges.after(
          snippets.renameSnippetFolder(oldName, newName).then(() => {}),
        ),
      remove: (name) =>
        snippetChanges.after(snippets.deleteSnippetFolder(name).then(() => {})),
    },
    hostPrefs: {
      subscribe: prefChanges.subscribe,
      get: async (host, key) => (await phone?.get(prefKey(host, key))) ?? null,
      set: (host, key, value) =>
        prefChanges.after(
          value === null
            ? (phone?.remove(prefKey(host, key)) ?? Promise.resolve())
            : (phone?.set(prefKey(host, key), value) ?? Promise.resolve()),
        ),
    },
    // No local file for a live server, so history lasts until the app closes.
    metricSamples: {
      append: async (host, point) => {
        const list = metricMemory.get(host.id) ?? [];
        const last = list[list.length - 1];
        if (last && point.ts - last.ts < 60_000) return;
        list.push(point);
        const cutoff = point.ts - 7 * 24 * 60 * 60_000;
        metricMemory.set(
          host.id,
          list.filter((p) => p.ts >= cutoff),
        );
      },
      range: async (host, fromTs) =>
        (metricMemory.get(host.id) ?? []).filter((p) => p.ts >= fromTs),
    },
    commandHistory: {
      subscribe: historyChanges.subscribe,
      list: (host) => terminal.getCommandHistory(host.id),
      // The server is the only copy here.
      merge: async () => {},
      add: (host, command) =>
        historyChanges.after(terminal.saveCommandToHistory(host.id, command)),
      remove: (host, command) =>
        historyChanges.after(
          terminal.deleteCommandFromHistory(host.id, command),
        ),
      clear: (host) =>
        historyChanges.after(terminal.clearCommandHistory(host.id)),
    },
    // The server keeps its own activity feed; nothing to record here.
    recentActivity: {
      subscribe: () => () => {},
      list: async () => [],
      add: async () => {},
    },
    origins: {
      async get(host) {
        // A choice made here wins over a host row loaded before it.
        const recent = recentOrigins.get(host.id);
        if (recent) return recent;
        if (host.connectFrom) return host.connectFrom;
        const saved =
          await phone?.getJson<Record<string, string>>("hostOrigins");
        return saved?.[String(host.id)];
      },
      set: (hostId, origin) =>
        hostChanges.after(
          (async () => {
            recentOrigins.set(hostId, origin);
            const kept = await hosts.setConnectFrom(hostId, origin);
            const saved =
              (await phone?.getJson<Record<string, string>>("hostOrigins")) ??
              {};
            if (kept) delete saved[String(hostId)];
            else saved[String(hostId)] = origin;
            await phone?.setJson("hostOrigins", saved);
          })(),
        ),
    },
  };
}
