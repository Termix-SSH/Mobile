import { useEffect } from "react";
import { AppState } from "react-native";
import { accounts, activeClient } from "@/core/accounts";
import { useLocalStoreState, useRepositories } from "@/core/data/hooks";
import type { Snippet, SSHHost } from "@/types";
import { publishHostSnapshot } from "./publish";
import { publishPowerWidget } from "./power";

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

/**
 * Keeps the Power widget's devices and server access current: on start, when
 * accounts or a session change, and each time the app comes to the front.
 */
export function usePowerWidgetSync() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void publishPowerWidget();
      }, 1500);
    };
    const clientStops = new Map<string, () => void>();
    const watchClients = () => {
      for (const account of accounts.list()) {
        if (clientStops.has(account.id)) continue;
        const client = accounts.client(account.id);
        if (client) clientStops.set(account.id, client.subscribe(schedule));
      }
    };
    watchClients();
    schedule();
    const stopAccounts = accounts.subscribe(() => {
      watchClients();
      schedule();
    });
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") schedule();
    });
    return () => {
      if (timer) clearTimeout(timer);
      stopAccounts();
      appState.remove();
      clientStops.forEach((stop) => stop());
    };
  }, []);
}
