import type { AccountClient } from "@/core/api/AccountClient";
import type { Snippet } from "@/types";
import type { SnippetRepository } from "./types";

// How long the server's shared list counts as fresh.
const FETCH_EVERY_MS = 60 * 1000;

/**
 * Sync only brings down the user's own snippets, so a synced server adds the
 * ones shared with them from the live list. They are read only and get
 * negative ids, so they never collide with a local row.
 */
export function withSharedSnippets(
  local: SnippetRepository,
  getClient: () => AccountClient | null,
  now: () => number = Date.now,
): SnippetRepository {
  let shared: Snippet[] = [];
  let fetchedAt = -Infinity;
  const listeners = new Set<() => void>();

  const refresh = async () => {
    const client = getClient();
    if (!client || !client.isPluginEnabled("snippets")) return;
    if (now() - fetchedAt < FETCH_EVERY_MS) return;
    fetchedAt = now();
    try {
      const list = await client.api.snippets.getSnippets();
      const next: Snippet[] = (Array.isArray(list) ? list : [])
        .filter((s: { isShared?: boolean }) => s.isShared)
        .map((s: Snippet) => ({ ...s, id: -Math.abs(s.id), isShared: true }));
      const changed = JSON.stringify(next) !== JSON.stringify(shared);
      shared = next;
      if (changed) listeners.forEach((l) => l());
    } catch {
      fetchedAt = -Infinity;
    }
  };

  const readOnly = async (): Promise<never> => {
    throw new Error("This snippet is shared with you and can't be changed.");
  };

  return {
    ...local,
    subscribe(listener) {
      listeners.add(listener);
      const stop = local.subscribe(listener);
      return () => {
        listeners.delete(listener);
        stop();
      };
    },
    async list() {
      void refresh();
      return [...(await local.list()), ...shared];
    },
    async get(id) {
      if (id < 0) return shared.find((s) => s.id === id) ?? null;
      return local.get(id);
    },
    async update(id, draft) {
      return id < 0 ? readOnly() : local.update(id, draft);
    },
    async remove(id) {
      return id < 0 ? readOnly() : local.remove(id);
    },
    async reorder(items) {
      return local.reorder(items.filter((item) => item.id > 0));
    },
  };
}
