import type { AccountClient } from "../AccountClient";
import { createTailscaleApi } from "./tailscale";
import { createVaultApi } from "./vault";
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
import { createServicesApi } from "./services";

export function createModules(c: AccountClient) {
  return {
    tailscale: createTailscaleApi(c),
    vault: createVaultApi(c),
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
    services: createServicesApi(c),
  };
}

export type ApiModules = ReturnType<typeof createModules>;
