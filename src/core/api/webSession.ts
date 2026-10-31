import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AccountClient } from "./AccountClient";

// Behind a reverse-proxy auth gate (e.g. Pangolin) the sign-in WebView keeps the
// proxy's session cookie, so the next sign-in would skip the proxy login. We
// reset it with pure JS (no native cookie module / no rebuild): flag that the
// next sign-in WebView must use an ephemeral (incognito) cookie store, which
// starts with no proxy cookie and therefore shows the proxy login again.
// Per server, so signing out of one never makes another forget its SSO login.
const freshKey = (accountId: string) => `freshWebViewSession.${accountId}`;

export async function requestFreshWebSession(accountId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(freshKey(accountId), "1");
  } catch {
    // Non-fatal: worst case the WebView reuses the previous proxy session.
  }
}

export async function consumeFreshWebSession(
  accountId: string,
): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(freshKey(accountId));
    if (v) {
      await AsyncStorage.removeItem(freshKey(accountId));
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/** Full session reset: token + force a fresh (incognito) proxy login next time. */
export async function clearSession(
  client: AccountClient | null,
): Promise<void> {
  await client?.clearToken();
  if (client) await requestFreshWebSession(client.accountId);
}
