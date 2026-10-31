import type { AccountClient } from "@/core/api/AccountClient";

const cached = new Map<string, string>();

/**
 * The signed in user's id on one server, used as `userId` on session based
 * connect, file and docker calls. Cached per account, cleared on sign out.
 */
export async function getCurrentUserId(
  client: AccountClient | null,
): Promise<string | null> {
  if (!client) return null;
  const hit = cached.get(client.accountId);
  if (hit) return hit;
  try {
    const info = await client.api.auth.getUserInfo();
    if (info?.userId) cached.set(client.accountId, info.userId);
    return info?.userId || null;
  } catch {
    return null;
  }
}

export function clearCachedUserId(accountId?: string): void {
  if (accountId) cached.delete(accountId);
  else cached.clear();
}
