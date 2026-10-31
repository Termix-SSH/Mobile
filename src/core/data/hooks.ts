import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useAccounts, useClient } from "@/core/accounts";
import { useSessionAccountId } from "@/core/accounts/session";
import { localStores, type StoreState } from "@/core/db/stores";
import { repositoriesFor } from "./repositories";
import type { DataRepositories, Watchable } from "./types";

export function useLocalStoreState(): StoreState {
  return useSyncExternalStore(
    localStores.subscribe,
    localStores.getState,
    localStores.getState,
  );
}

/** The active account's repositories. Changes with the account. */
export function useRepositories(): DataRepositories {
  const { active } = useAccounts();
  const client = useClient(active.kind === "server" ? active.id : null);
  useLocalStoreState();
  return repositoriesFor(active, client);
}

/** The repositories of the account that opened the surrounding session. */
export function useSessionRepositories(): DataRepositories {
  const { accounts, active } = useAccounts();
  const id = useSessionAccountId();
  const account = accounts.find((a) => a.id === id) ?? active;
  const client = useClient(account.kind === "server" ? account.id : null);
  useLocalStoreState();
  return repositoriesFor(account, client);
}

export interface LiveList<T> {
  data: T[];
  loading: boolean;
  error: unknown;
  refresh(): Promise<void>;
}

/**
 * Loads a list and reloads it whenever its source says it changed. Bursts of
 * changes in one tick reload once.
 */
export function useLiveList<T>(
  source: Watchable | null,
  load: () => Promise<T[]>,
  deps: readonly unknown[] = [],
): LiveList<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const run = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    const id = ++run.current;
    try {
      const next = await loadRef.current();
      if (id !== run.current) return;
      setData(next);
      setError(null);
    } catch (e) {
      if (id === run.current) setError(e);
    } finally {
      if (id === run.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh();
    if (!source) return;
    let queued = false;
    const unsubscribe = source.subscribe(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        void refresh();
      });
    });
    return () => {
      unsubscribe();
      run.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, refresh, ...deps]);

  return { data, loading, error, refresh };
}
