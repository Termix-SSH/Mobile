import type { AccountClient } from "@/core/api/AccountClient";
import type { SSHHost } from "@/types";
import type { CommandHistoryRepository } from "./types";

// How long a host's server history counts as fresh after a merge.
const MERGE_EVERY_MS = 5 * 60 * 1000;

/**
 * A synced server's history: the phone's copy first, then the server's
 * ssh-terminal history in the background, so the web app sees commands
 * typed here and the phone sees commands typed there. Server calls are best
 * effort and never fail the local write.
 */
export function withServerHistory(
  local: CommandHistoryRepository,
  getClient: () => AccountClient | null,
  now: () => number = Date.now,
): CommandHistoryRepository {
  const merged = new Map<string, number>();

  const server = (host: SSHHost) => {
    const client = getClient();
    const id = Number(host.serverId);
    if (!client || !Number.isFinite(id) || id <= 0) return null;
    if (!client.isPluginEnabled("ssh-terminal")) return null;
    return { api: client.api.terminal, id };
  };

  const pull = async (host: SSHHost) => {
    const remote = server(host);
    if (!remote) return;
    const key = String(remote.id);
    const last = merged.get(key);
    if (last !== undefined && now() - last < MERGE_EVERY_MS) return;
    merged.set(key, now());
    try {
      const commands = await remote.api.getCommandHistory(remote.id);
      await local.merge(host, commands);
    } catch {
      merged.delete(key);
    }
  };

  return {
    subscribe: local.subscribe,
    merge: local.merge,
    async list(host) {
      void pull(host);
      return local.list(host);
    },
    async add(host, command) {
      await local.add(host, command);
      const remote = server(host);
      if (remote) {
        void remote.api
          .saveCommandToHistory(remote.id, command)
          .catch(() => {});
      }
    },
    async remove(host, command) {
      await local.remove(host, command);
      const remote = server(host);
      if (remote) {
        void remote.api
          .deleteCommandFromHistory(remote.id, command)
          .catch(() => {});
      }
    },
    async clear(host) {
      await local.clear(host);
      const remote = server(host);
      if (remote) {
        void remote.api.clearCommandHistory(remote.id).catch(() => {});
      }
    },
  };
}
