import type { AccountClient } from "@/core/api/AccountClient";
import { clearSession } from "@/core/api/webSession";
import { clearCachedUserId } from "@/utils/user";
import { resetWidgets } from "@/widgets";
import { apiOf } from "./index";

/**
 * Ends the session on the server and on this phone. Host names must not
 * linger on the home screen, so widgets are wiped too. The caller flips the
 * signed-in flag.
 */
export async function signOutClient(client: AccountClient | null) {
  try {
    await apiOf(client).auth.logoutUser();
  } catch {
    // The session may already be gone.
  }
  await clearSession(client);
  clearCachedUserId(client?.accountId);
  await resetWidgets();
}

export async function changeServerPassword(
  client: AccountClient | null,
  current: string,
  next: string,
) {
  await apiOf(client).users.changePassword(current, next);
}

export async function deleteServerAccount(
  client: AccountClient | null,
  password: string,
) {
  await apiOf(client).users.deleteAccount(password);
  await signOutClient(client);
}
