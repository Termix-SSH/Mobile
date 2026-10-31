import type { Account } from "./types";

/**
 * Whether the Hosts and Sessions tabs have something to show: This device
 * and a server that keeps its copy on the phone always do, even signed out.
 * A server read live needs a signed in session.
 */
export function hasUsableData(
  account: Account,
  isAuthenticated: boolean,
): boolean {
  if (account.kind === "local") return true;
  return isAuthenticated || account.options?.sync === true;
}
