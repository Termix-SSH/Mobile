import { useMemo, useSyncExternalStore } from "react";
import { accounts, useClient } from "@/core/accounts";
import { features } from "@/core/features/registry";
import { supportRows, type SupportRow } from "./support";

/** What each plugin does in the app for one account. Re-renders on changes. */
export function useSupportRows(accountId: string): SupportRow[] {
  const client = useClient(accountId);
  const registry = useSyncExternalStore(
    features.subscribe,
    features.getVersion,
    features.getVersion,
  );
  const local = accounts.find(accountId)?.kind === "local";
  const version = client?.version ?? -1;
  return useMemo(
    () =>
      supportRows({
        registry: features,
        local,
        plugins: local ? null : (client?.serverPlugins ?? null),
      }),
    // version and registry change when the plugin list or features change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, local, version, registry],
  );
}
