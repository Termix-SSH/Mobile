import { useEffect, useState } from "react";
import type { AccountClient } from "@/core/api/AccountClient";

type PinClient = Pick<AccountClient, "certPins" | "rawAxios" | "rootBase">;

/**
 * Before a web view opens a pinned server, one request through the app's own
 * pinned network makes sure the server shows its pinned key. A web view only
 * checks pins when the system already distrusts the certificate, so this
 * catches a trusted but wrong certificate first.
 */
export async function pinnedServerOk(client: PinClient): Promise<boolean> {
  if (client.certPins().length === 0) return true;
  try {
    // Any answer means the TLS handshake, and with it the pin, passed.
    await client
      .rawAxios({ timeout: 10000, validateStatus: () => true })
      .get(`${client.rootBase()}/version`);
    return true;
  } catch {
    return false;
  }
}

export type PinCheck = "checking" | "ok" | "refused";

export function usePinnedServerCheck(
  client: PinClient | null,
  enabled = true,
): PinCheck {
  const [state, setState] = useState<PinCheck>("checking");
  useEffect(() => {
    if (!client || !enabled) return;
    let live = true;
    setState("checking");
    void pinnedServerOk(client).then((ok) => {
      if (live) setState(ok ? "ok" : "refused");
    });
    return () => {
      live = false;
    };
  }, [client, enabled]);
  return state;
}

export const PIN_REFUSED_TEXT =
  "This server did not show the key it is pinned to, so the page was not opened.";
