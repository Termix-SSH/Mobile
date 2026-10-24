import type { AccountClient } from "../AccountClient";
import { createAiApi } from "./ai";
import { createTailscaleApi } from "./tailscale";
import { createHostsApi } from "./hosts";
import { createRemoteDesktopApi } from "./remoteDesktop";
import { createTunnelsApi } from "./tunnels";
import { createFilesApi } from "./files";
import { createTerminalApi } from "./terminal";
import { createMetricsApi } from "./metrics";
import { createAuthApi } from "./auth";
import { createUsersApi } from "./users";
import { createTotpApi } from "./totp";
import { createAlertsApi } from "./alerts";
import { createServerApi } from "./server";
import { createCredentialsApi } from "./credentials";
import { createFoldersApi } from "./folders";
import { createKeysApi } from "./keys";
import { createSnippetsApi } from "./snippets";
import { createHomepageApi } from "./homepage";
import { createOpenTabsApi } from "./openTabs";
import { createDockerApi } from "./docker";
import { createWakeOnLanApi } from "./wakeOnLan";
import { createApiKeysApi } from "./apiKeys";
import { createSessionSharingApi } from "./sessionSharing";

export function createModules(c: AccountClient) {
  return {
    ai: createAiApi(c),
    tailscale: createTailscaleApi(c),
    hosts: createHostsApi(c),
    remoteDesktop: createRemoteDesktopApi(c),
    tunnels: createTunnelsApi(c),
    files: createFilesApi(c),
    terminal: createTerminalApi(c),
    metrics: createMetricsApi(c),
    auth: createAuthApi(c),
    users: createUsersApi(c),
    totp: createTotpApi(c),
    alerts: createAlertsApi(c),
    server: createServerApi(c),
    credentials: createCredentialsApi(c),
    folders: createFoldersApi(c),
    keys: createKeysApi(c),
    snippets: createSnippetsApi(c),
    homepage: createHomepageApi(c),
    openTabs: createOpenTabsApi(c),
    docker: createDockerApi(c),
    wakeOnLan: createWakeOnLanApi(c),
    apiKeys: createApiKeysApi(c),
    sessionSharing: createSessionSharingApi(c),
  };
}

export type ApiModules = ReturnType<typeof createModules>;
