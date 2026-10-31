import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { changes } from "@/core/db/changes";
import { localStores } from "@/core/db/stores";
import { getTableName } from "drizzle-orm";
import { syncConflicts, syncRecords } from "@/core/db/schema";
import { sync, type AccountSync } from "./manager";
import { SyncBook, type SyncConflict, type SyncRecord } from "./store";

/** One account's live sync status. */
export function useAccountSync(accountId: string): AccountSync {
  const get = useCallback(() => sync.get(accountId), [accountId]);
  return useSyncExternalStore(sync.subscribe, get, get);
}

/** Conflicts and refused changes of one synced account, kept live. */
export function useSyncIssues(accountId: string): {
  conflicts: SyncConflict[];
  rejected: SyncRecord[];
  reload: () => void;
} {
  const [state, setState] = useState<{
    conflicts: SyncConflict[];
    rejected: SyncRecord[];
  }>({ conflicts: [], rejected: [] });

  const reload = useCallback(() => {
    void (async () => {
      try {
        const { db } = await localStores.openForSync(accountId);
        const book = new SyncBook(db);
        setState({ conflicts: book.conflicts(), rejected: book.errors() });
      } catch {
        setState({ conflicts: [], rejected: [] });
      }
    })();
  }, [accountId]);

  useEffect(() => {
    reload();
    const stop = changes.subscribe(
      accountId,
      [getTableName(syncConflicts), getTableName(syncRecords)],
      reload,
    );
    const stopSync = sync.subscribe(reload);
    return () => {
      stop();
      stopSync();
    };
  }, [accountId, reload]);

  return { ...state, reload };
}
