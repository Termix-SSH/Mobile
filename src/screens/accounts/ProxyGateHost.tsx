import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { accounts, isServerAccount, useAccounts } from "@/core/accounts";
import { needsProxySignIn } from "@/core/accounts/proxy-gate";
import { sync } from "@/core/sync";
import { ProxySignIn } from "./ProxySignIn";

/**
 * Opens the proxy sign in when the proxy in front of the active server asks
 * again (Authelia, Cloudflare Access, ...). Asks once per return to the app,
 * and keeps the server and its session either way.
 */
export function ProxyGateHost() {
  const { active } = useAccounts();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const asked = useRef(new Set<string>());

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        asked.current.clear();
        return;
      }
      // Save any cookie the proxy renewed while the app was open.
      for (const account of accounts.list()) {
        if (!isServerAccount(account)) continue;
        void accounts
          .client(account.id)
          ?.syncCookieJar()
          .catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  const client = accounts.client(active.id);
  const needed = needsProxySignIn(active, client);
  useEffect(() => {
    if (!needed || openFor || asked.current.has(active.id)) return;
    asked.current.add(active.id);
    setOpenFor(active.id);
  }, [active.id, needed, openFor]);

  const done = async () => {
    const id = openFor;
    if (!id) return;
    await accounts.update(id, { status: "idle", lastError: null });
    void sync.syncNow(id);
  };

  return (
    <ProxySignIn
      client={openFor ? accounts.client(openFor) : null}
      open={!!openFor}
      onClose={() => setOpenFor(null)}
      onDone={() => void done()}
    />
  );
}
