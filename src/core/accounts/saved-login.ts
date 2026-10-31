import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import type { AccountClient } from "@/core/api/AccountClient";

/**
 * A server's username and password kept behind Face ID or a fingerprint, so a
 * session that ended can sign in again with one look. Only for password
 * sign in, and only when the user says yes.
 */
export interface SavedLogin {
  username: string;
  password: string;
}

const SECRET = "savedLogin";
const FLAG = "savedLoginOn";
const ASKED = "savedLoginAsked";

const keyFor = (accountId: string) =>
  `acct.${accountId}.${SECRET}`.replace(/[^A-Za-z0-9._-]/g, "_");

const OPTIONS: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  authenticationPrompt: "Sign in to Termix",
};

/** False without Face ID, Touch ID or a fingerprint set up. */
export function canSaveLogin(): boolean {
  try {
    return SecureStore.canUseBiometricAuthentication();
  } catch {
    return false;
  }
}

/** What the phone calls its biometrics, for button text. */
export async function biometricName(): Promise<string> {
  const types =
    await LocalAuthentication.supportedAuthenticationTypesAsync().catch(
      () => [] as LocalAuthentication.AuthenticationType[],
    );
  const face = types.includes(
    LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
  );
  if (Platform.OS === "ios") return face ? "Face ID" : "Touch ID";
  return face ? "face unlock" : "fingerprint";
}

/** Ask once per server after a password sign in, unless one is saved. */
export async function shouldOfferSave(client: AccountClient): Promise<boolean> {
  if (!canSaveLogin()) return false;
  if (await hasSavedLogin(client)) return false;
  return (await client.storage.data.get(ASKED)) !== "1";
}

export async function markOffered(client: AccountClient): Promise<void> {
  await client.storage.data.set(ASKED, "1");
}

/** Whether a login is saved. Reads a flag, so it never prompts. */
export async function hasSavedLogin(client: AccountClient): Promise<boolean> {
  return (await client.storage.data.get(FLAG)) === "1";
}

export async function saveLogin(
  client: AccountClient,
  login: SavedLogin,
): Promise<void> {
  await SecureStore.setItemAsync(
    keyFor(client.accountId),
    JSON.stringify({ username: login.username, password: login.password }),
    OPTIONS,
  );
  await client.storage.data.set(FLAG, "1");
}

/**
 * Asks for Face ID or a fingerprint and reads the login. Null when the user
 * backs out. A key the phone dropped (new fingerprint added) is cleared.
 */
export async function readSavedLogin(
  client: AccountClient,
): Promise<SavedLogin | null> {
  let raw: string | null;
  try {
    raw = await SecureStore.getItemAsync(keyFor(client.accountId), OPTIONS);
  } catch (error) {
    if (!isCancel(error)) await clearSavedLogin(client);
    return null;
  }
  if (!raw) {
    await clearSavedLogin(client);
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as SavedLogin;
    if (typeof parsed?.username === "string" && parsed.password) return parsed;
  } catch {
    // Broken, drop it below.
  }
  await clearSavedLogin(client);
  return null;
}

export async function clearSavedLogin(client: AccountClient): Promise<void> {
  await SecureStore.deleteItemAsync(keyFor(client.accountId)).catch(() => {});
  await client.storage.data.remove(FLAG).catch(() => {});
}

function isCancel(error: unknown): boolean {
  const text = String((error as { message?: string })?.message ?? error);
  return /cancel/i.test(text);
}
