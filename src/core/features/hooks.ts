import { useMemo, useSyncExternalStore } from "react";
import { accounts, useAccounts, useClient } from "@/core/accounts";
import { useSessionAccountId } from "@/core/accounts/session";
import { features, isFeatureAvailable } from "./registry";
import type { Capability, FeatureContext } from "./types";

function useRegistryVersion(): number {
  return useSyncExternalStore(
    features.subscribe,
    features.getVersion,
    features.getVersion,
  );
}

function useContextFor(accountId: string): FeatureContext {
  const client = useClient(accountId);
  const version = client?.version ?? -1;
  const registry = useRegistryVersion();
  const account = accounts.find(accountId) ?? accounts.active();
  return useMemo(
    () => ({ account, client }),
    // version and registry change when the plugin list or features change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account, client, version, registry],
  );
}

/** Features as seen by the active account. Re-renders when either changes. */
export function useFeatureContext(): FeatureContext {
  return useContextFor(useAccounts().active.id);
}

/** Whether a registered feature is available to the active account. */
export function useFeatureAvailable(id: string): boolean {
  const ctx = useFeatureContext();
  return useMemo(() => {
    const feature = features.all().find((def) => def.id === id);
    return !!feature && isFeatureAvailable(feature, ctx);
  }, [id, ctx]);
}

/** Features as seen by the account of the surrounding session. */
export function useSessionFeatureContext(): FeatureContext {
  const sessionAccount = useSessionAccountId();
  const active = useAccounts().active.id;
  return useContextFor(sessionAccount ?? active);
}

export function useHostActions() {
  const ctx = useFeatureContext();
  return useMemo(() => ({ ctx, actions: features.hostActions(ctx) }), [ctx]);
}

export function useHostToggles() {
  const ctx = useFeatureContext();
  return useMemo(() => features.hostToggles(ctx), [ctx]);
}

export function useHostBadges() {
  const ctx = useFeatureContext();
  return useMemo(() => features.hostBadges(ctx), [ctx]);
}

export function useHostFilters() {
  const ctx = useFeatureContext();
  return useMemo(() => features.hostFilters(ctx), [ctx]);
}

export function useSettingsLinks() {
  const ctx = useFeatureContext();
  return useMemo(() => features.settingsLinks(ctx), [ctx]);
}

export function useKeyboardTabs() {
  const ctx = useSessionFeatureContext();
  return useMemo(() => features.keyboardTabs(ctx), [ctx]);
}

export function useCapability(capability: Capability): boolean {
  const ctx = useFeatureContext();
  return useMemo(
    () => features.hasCapability(capability, ctx),
    [capability, ctx],
  );
}
