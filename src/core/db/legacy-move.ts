import * as SecureStore from "expo-secure-store";
import { SECRET_KEYS } from "@/core/api/AccountClient";
import {
  AFTER_FIRST_UNLOCK,
  DEVICE_ONLY,
  plainStore,
  secureOptionsFor,
  type JsonKV,
} from "@/core/storage/kv";
import { keyName } from "./keys";

export const MOVED_FLAG = "localStore.moved.v1";
export const BACKGROUND_FLAG = "secrets.background.v1";

// 1.x kept its login token in AsyncStorage. The account move takes it when a
// server was set up; anything left after that is stale and must go.
const STRAY_PLAIN_KEYS = ["jwt", "serverConfig", "server"];

const APP_LOCK_PIN = "appLockPin";

interface MoveDeps {
  kv?: JsonKV;
  accountIds: string[];
}

const secureKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, "_");

/**
 * Runs once per install, after accounts load. 1.x never kept hosts, logins or
 * snippets on the phone, so there is nothing to copy into the database. What
 * it does: deletes plain text tokens 1.x left behind, and saves every Keychain
 * item again as device only, since items made before 2.0 could go into iCloud
 * Keychain and phone backups. Device UI settings stay where they are.
 */
export async function moveLegacyData(deps: MoveDeps): Promise<boolean> {
  const kv = deps.kv ?? plainStore;
  if (await kv.get(MOVED_FLAG)) return false;

  await Promise.all(
    STRAY_PLAIN_KEYS.map((key) => kv.remove(key).catch(() => {})),
  );

  const secure: [string, SecureStore.SecureStoreOptions][] = [
    [APP_LOCK_PIN, DEVICE_ONLY],
    ...deps.accountIds.flatMap((id) =>
      SECRET_KEYS.map(
        (name) =>
          [`acct.${id}.${name}`, secureOptionsFor(id)] as [
            string,
            SecureStore.SecureStoreOptions,
          ],
      ),
    ),
  ];
  for (const [key, options] of secure) await resave(secureKey(key), options);

  await kv.set(MOVED_FLAG, "1");
  // Already in the right place, so the background move has nothing to do.
  await kv.set(BACKGROUND_FLAG, "1");
  return true;
}

/**
 * Runs once. Linked servers made before background sync kept their secrets
 * and database key readable only while the phone is unlocked. Saves them again
 * so background sync can read them after the first unlock.
 */
export async function moveServerSecretsForBackground(deps: {
  kv?: JsonKV;
  accountIds: string[];
}): Promise<boolean> {
  const kv = deps.kv ?? plainStore;
  if (await kv.get(BACKGROUND_FLAG)) return false;
  for (const id of deps.accountIds) {
    if (id === "local") continue;
    for (const name of SECRET_KEYS) {
      await resave(secureKey(`acct.${id}.${name}`), AFTER_FIRST_UNLOCK);
    }
    await resave(keyName(id), AFTER_FIRST_UNLOCK);
  }
  await kv.set(BACKGROUND_FLAG, "1");
  return true;
}

async function resave(
  key: string,
  options: SecureStore.SecureStoreOptions,
): Promise<void> {
  try {
    const value = await SecureStore.getItemAsync(key);
    if (value == null) return;
    // An update keeps the old access setting, so delete and add again.
    await SecureStore.deleteItemAsync(key);
    await SecureStore.setItemAsync(key, value, options);
  } catch {}
}
