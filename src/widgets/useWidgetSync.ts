import { useEffect } from "react";
import { activeClient } from "@/core/accounts";
import { useLocalStoreState, useRepositories } from "@/core/data/hooks";
import type { Snippet, SSHHost } from "@/types";
import { publishHostSnapshot } from "./publish";

/**
 * Keeps the widgets filled from the local store, so they work with no server
 * and before the Hosts screen has been opened. Statuses and metrics still come
 * from the Hosts screen. Mount once at the root.
 */
export function useWidgetSync() {
  const repos = useRepositories();
  // Reload once the store opens after App Lock.
  const storeState = useLocalStoreState();

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const [hosts, snippets] = await Promise.all([
          repos.hosts.list(),
          repos.snippets.list(),
        ]);
        if (!alive || !Array.isArray(hosts)) return;
        await publishHostSnapshot({
          hosts: hosts as SSHHost[],
          snippets: Array.isArray(snippets)
            ? (snippets as Snippet[])
            : undefined,
          serverUrl: activeClient()?.serverUrl ?? null,
          authenticated: true,
        });
      } catch {
        // Locked or not ready yet. The next change or unlock tries again.
      }
    };
    void run();
    const stops = [
      repos.hosts.subscribe(() => void run()),
      repos.snippets.subscribe(() => void run()),
    ];
    return () => {
      alive = false;
      stops.forEach((stop) => stop());
    };
  }, [repos, storeState]);
}
