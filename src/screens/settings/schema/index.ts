import { useMemo } from "react";
import { Platform } from "react-native";
import { useAppContext } from "@/contexts/AppContext";
import {
  isServerAccount,
  useActiveAccount,
  useActiveClient,
} from "@/core/accounts";
import { useAppLock } from "@/contexts/AppLockContext";
import { useSettingsLinks } from "@/core/features";
import { isWidgetSupported } from "@/widgets";
import { useServerUser } from "../useServerUser";
import { buildSettingsGroups } from "./build";
import type { SettingsEnv, SettingsGroup } from "./types";

export * from "./types";
export { buildSettingsGroups, linkToItem } from "./build";
export { searchSettings, type SettingsHit } from "./search";
export { SETTINGS_ITEMS } from "./items";
export { SETTINGS_SECTIONS } from "./sections";

/** The settings to show right now, grouped by section. */
export function useSettingsGroups(): SettingsGroup[] {
  const account = useActiveAccount();
  const client = useActiveClient();
  const { isAuthenticated } = useAppContext();
  const { isAdmin } = useServerUser();
  const links = useSettingsLinks();
  const appLock = useAppLock().enabled;
  const plugins = (client?.enabledPlugins ?? []).map((p) => p.id).join(",");

  return useMemo(() => {
    const hasServer = isServerAccount(account);
    const env: SettingsEnv = {
      hasServer,
      signedIn: hasServer && isAuthenticated,
      isAdmin,
      os: Platform.OS,
      widgets: isWidgetSupported,
      appLock,
      plugins: plugins ? plugins.split(",") : [],
    };
    return buildSettingsGroups(env, links);
  }, [account, isAuthenticated, isAdmin, links, plugins, appLock]);
}
