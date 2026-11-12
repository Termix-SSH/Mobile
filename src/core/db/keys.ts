import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { AppError } from "@/core/errors";
import { secureOptionsFor } from "@/core/storage/kv";

export const keyName = (accountId: string) =>
  `db.key.${accountId.replace(/[^A-Za-z0-9._-]/g, "_")}`;

const DEVICE = "local";

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * With App Lock on, this device's key is sealed by App Lock and lives only
 * here, in memory, while the app is unlocked.
 */
let deviceSealed = false;
let deviceKey: string | null = null;

/** App Lock reports whether the key is sealed and, while unlocked, the key. */
export function setDeviceKeyState(sealed: boolean, key: string | null): void {
  deviceSealed = sealed;
  deviceKey = sealed ? key : null;
}

/** Forgets the unlocked key. Called when the app locks. */
export function dropDeviceKey(): void {
  deviceKey = null;
}

export function isDeviceKeySealed(): boolean {
  return deviceSealed;
}

/** The unlocked device key, for App Lock to reseal or put back. */
export function unlockedDeviceKey(): string | null {
  return deviceKey;
}

/**
 * The account's database key, made on first use. 32 random bytes as hex.
 * A linked server's key stays readable after the first unlock, so background
 * sync can open its copy. This device's key never is, and with App Lock on
 * it only comes from App Lock.
 */
export async function getDbKey(accountId: string): Promise<string> {
  if (accountId === DEVICE && deviceSealed) {
    if (!deviceKey) throw new AppError("Unlock Termix first.", "APP_LOCKED");
    return deviceKey;
  }
  return getPlainDbKey(accountId);
}

/** The key as stored in the Keychain/Keystore, made when missing. */
export async function getPlainDbKey(accountId: string): Promise<string> {
  const name = keyName(accountId);
  const options = secureOptionsFor(accountId);
  const existing = await SecureStore.getItemAsync(name, options);
  if (existing && /^[0-9a-f]{64}$/.test(existing)) return existing;
  const key = toHex(Crypto.getRandomBytes(32));
  await SecureStore.setItemAsync(name, key, options);
  return key;
}

/** Puts this device's key back in the clear, when App Lock turns off. */
export async function restorePlainDeviceKey(key: string): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(key)) {
    throw new AppError("That is not a database key.", "BAD_KEY");
  }
  await SecureStore.setItemAsync(
    keyName(DEVICE),
    key,
    secureOptionsFor(DEVICE),
  );
  const back = await SecureStore.getItemAsync(
    keyName(DEVICE),
    secureOptionsFor(DEVICE),
  );
  if (back !== key) {
    throw new AppError("Could not save the database key.", "BAD_KEY");
  }
}

/** Removes the plain copy once App Lock has sealed it. */
export async function removePlainDeviceKey(): Promise<void> {
  await SecureStore.deleteItemAsync(keyName(DEVICE), secureOptionsFor(DEVICE));
}

export async function deleteDbKey(accountId: string): Promise<void> {
  const options = secureOptionsFor(accountId);
  await SecureStore.deleteItemAsync(keyName(accountId), options).catch(
    () => {},
  );
}
