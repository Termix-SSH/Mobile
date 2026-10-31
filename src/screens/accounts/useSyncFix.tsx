import { useCallback, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "expo-router";
import { accounts } from "@/core/accounts";
import { sync, type SyncFix } from "@/core/sync";
import { toast } from "@/utils/toast";
import { ProxySignIn } from "./ProxySignIn";

const SYNC_SETTINGS = "/tabs/settings/Sync";

/**
 * The quickest fix for why a server stopped syncing. Returns the handler and
 * an element to render (the proxy sign in view).
 */
export function useSyncFix(
  accountId: string,
  signIn: () => void,
): { fix: (fix: SyncFix) => void; overlay: ReactNode } {
  const router = useRouter();
  const pathname = usePathname();
  const [proxyOpen, setProxyOpen] = useState(false);

  const fix = useCallback(
    (kind: SyncFix) => {
      switch (kind) {
        case "sign_in":
          signIn();
          return;
        case "proxy_sign_in":
          setProxyOpen(true);
          return;
        case "proxy_password":
        case "pick_cert":
        case "check_pin":
          if (pathname !== SYNC_SETTINGS) router.push(SYNC_SETTINGS as never);
          else toast.info("Change it under Proxy below");
          return;
        case "update":
          toast.info("Update Termix Mobile from your app store");
          return;
        case "retry":
          void sync.syncNow(accountId);
      }
    },
    [accountId, pathname, router, signIn],
  );

  const overlay = (
    <ProxySignIn
      client={accounts.client(accountId)}
      open={proxyOpen}
      onClose={() => setProxyOpen(false)}
      onDone={() => void sync.syncNow(accountId)}
    />
  );
  return { fix, overlay };
}
