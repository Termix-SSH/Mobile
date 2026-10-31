import type { AccountStorage, JsonKV } from "@/core/storage/kv";
import type { ServerAccount } from "./types";

// Keys the 1.x app kept for its one server.
const OLD_KEYS = {
  serverConfig: "serverConfig",
  server: "server",
  jwt: "jwt",
};

interface MigrateDeps {
  kv: JsonKV;
  storageFor: (accountId: string) => AccountStorage;
  newId: () => string;
  now: () => string;
}

function oldServerUrl(
  config: { serverUrl?: unknown } | null,
  legacy: { ip?: unknown } | null,
): string | null {
  const url = config?.serverUrl ?? legacy?.ip;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

/**
 * Turns the 1.x single server setup into a linked account. The token moves
 * into secure storage and the old plain keys are removed.
 */
export async function migrateLegacyServer(
  deps: MigrateDeps,
): Promise<ServerAccount | null> {
  const { kv } = deps;
  const [config, legacy, jwt] = await Promise.all([
    kv.getJson<{ serverUrl?: unknown }>(OLD_KEYS.serverConfig),
    kv.getJson<{ ip?: unknown }>(OLD_KEYS.server),
    kv.get(OLD_KEYS.jwt),
  ]);
  const serverUrl = oldServerUrl(config, legacy);
  if (!serverUrl) return null;

  const id = deps.newId();
  const url = serverUrl.replace(/\/+$/, "");
  const storage = deps.storageFor(id);
  if (jwt) await storage.secrets.set("session", jwt);

  // Cached server details were keyed by URL.
  const [generation, plugins] = await Promise.all([
    kv.get(`apiGeneration:${serverUrl}`),
    kv.get(`enabledPlugins:${serverUrl}`),
  ]);
  if (generation) await storage.data.set("apiGeneration", generation);
  if (plugins) await storage.data.set("enabledPlugins", plugins);

  await Promise.all(
    [
      OLD_KEYS.serverConfig,
      OLD_KEYS.server,
      OLD_KEYS.jwt,
      `apiGeneration:${serverUrl}`,
      `enabledPlugins:${serverUrl}`,
    ].map((key) => kv.remove(key).catch(() => {})),
  );

  return {
    id,
    kind: "server",
    serverUrl: url,
    serverName: null,
    serverVersion: null,
    username: null,
    remoteUserId: null,
    isAdmin: false,
    status: jwt ? "idle" : "signed_out",
    lastError: null,
    linkedAt: deps.now(),
    lastSyncAt: null,
    disabledTypes: [],
    options: {},
  };
}
