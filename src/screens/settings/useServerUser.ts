import { useEffect, useState } from "react";
import { apiOf, useActiveClient } from "@/core/accounts";
import { useAppContext } from "@/contexts/AppContext";

export interface ServerUser {
  username: string;
  isAdmin: boolean;
  totpEnabled: boolean;
  version: string;
}

const NONE: ServerUser = {
  username: "",
  isAdmin: false,
  totpEnabled: false,
  version: "",
};

/** Who is signed in on the active server. Empty on This device. */
export function useServerUser(): ServerUser {
  const client = useActiveClient();
  const { isAuthenticated, authFlowVisible } = useAppContext();
  const [user, setUser] = useState<ServerUser>(NONE);

  // Look again when the sign in flow closes, the account may have changed.
  useEffect(() => {
    if (authFlowVisible) return;
    if (!client || !isAuthenticated) {
      setUser(NONE);
      return;
    }
    let live = true;
    apiOf(client)
      .auth.getUserInfo()
      .then((u) => {
        if (!live) return;
        setUser((prev) => ({
          ...prev,
          username: u.username ?? "",
          isAdmin: !!u.is_admin,
          totpEnabled: !!u.totp_enabled,
        }));
      })
      .catch(() => {});
    apiOf(client)
      .server.getVersionInfo()
      .then((v) => {
        if (live) {
          setUser((prev) => ({
            ...prev,
            version: v?.localVersion ?? v?.version ?? "",
          }));
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [client, isAuthenticated, authFlowVisible]);

  return user;
}
