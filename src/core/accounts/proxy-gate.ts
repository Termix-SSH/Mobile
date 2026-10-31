import type { AccountClient } from "@/core/api/AccountClient";
import { isServerAccount, type Account } from "./types";

/**
 * True when the proxy in front of this server wants its own sign in again:
 * it answered instead of Termix, or a saved proxy cookie ran out. The Termix
 * session itself is still good, so the account is never signed out for it.
 */
export function needsProxySignIn(
  account: Account,
  client: AccountClient | null,
  now = Date.now(),
): boolean {
  if (!isServerAccount(account) || !client) return false;
  if (account.status === "signed_out") return false;
  if (account.lastError === "proxy_login") return true;
  return client.proxyCookies().length > 0 && client.proxyCookiesExpired(now);
}
