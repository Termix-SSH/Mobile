import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionAccountId } from "@/core/accounts/session";
import { checkOpen, type OpenCheck } from "@/core/features/open-check";
import { asServerHost, isSynced } from "@/core/sync";
import {
  saveOrigin,
  type ConnectionOrigin,
  type Transport,
} from "@/core/transport";
import type { DisplayProtocol } from "@/modules/termix-ssh";
import type { SSHHost } from "@/types";
import { isSshHost } from "@/utils/hosts";
import type { RemoteDesktopProtocol } from "./RemoteDesktop";
import { REMOTE_DESKTOP_TAB } from "./telnet";

export type RemoteRoute =
  | { via: "checking" }
  /** The phone opens it: VNC and RDP in the native view, Telnet in the terminal. */
  | { via: "device"; transport: Transport; serverToo: boolean }
  /** The server's Guacamole view, on the server's own host. */
  | { via: "server"; host: SSHHost }
  | { via: "blocked"; reason: string; fix?: ConnectionOrigin };

/** A route before the server's own host id is looked up. */
export type PickedRoute =
  Extract<RemoteRoute, { via: "device" | "blocked" }> | { via: "server" };

/**
 * Which way a remote desktop tab goes, from the host's plan: the phone first
 * when it can dial the protocol, else the server.
 */
export function pickRoute(
  check: OpenCheck,
  protocol: RemoteDesktopProtocol,
  nativeProtocols: DisplayProtocol[],
): PickedRoute {
  const phoneCan = (t: Transport) =>
    t.kind === "local" &&
    t.provides.includes("tcp") &&
    (protocol === "telnet" ||
      (nativeProtocols.includes(protocol) && !!t.openDisplay));
  const relay = check.attempts.find((t) => t.kind === "relay");
  const first = check.attempts[0];
  if (first && phoneCan(first)) {
    return { via: "device", transport: first, serverToo: !!relay };
  }
  if (relay) return { via: "server" };
  const local = check.attempts.find(phoneCan);
  if (local) return { via: "device", transport: local, serverToo: false };
  return {
    via: "blocked",
    reason:
      check.blocked?.reason ??
      "This host can't open a remote desktop from here.",
    fix: check.blocked?.fix,
  };
}

export function useRemoteRoute(
  host: SSHHost,
  protocol: RemoteDesktopProtocol,
  nativeProtocols: DisplayProtocol[],
  origin?: ConnectionOrigin,
) {
  const accountId = useSessionAccountId();
  const [route, setRoute] = useState<RemoteRoute>({ via: "checking" });
  const [override, setOverride] = useState(origin);
  const run = useRef(0);

  useEffect(() => {
    const id = ++run.current;
    void (async () => {
      const check = await checkOpen(
        accountId,
        host,
        isSshHost(host),
        REMOTE_DESKTOP_TAB,
        override,
      );
      if (id !== run.current) return;
      const picked = pickRoute(check, protocol, nativeProtocols);
      if (picked.via !== "server") {
        setRoute(picked);
        return;
      }
      // The server knows the host by its own id.
      const serverHost =
        accountId && isSynced(accountId)
          ? await asServerHost(accountId, host).catch(() => host)
          : host;
      if (id === run.current) setRoute({ via: "server", host: serverHost });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, host.id, protocol, override]);

  /** Uses another way, and saves it on the host when asked. */
  const switchTo = useCallback(
    (next: ConnectionOrigin, save = false) => {
      if (save) saveOrigin(accountId, host.id, next).catch(() => {});
      setOverride(next);
    },
    [accountId, host.id],
  );

  return { route, switchTo };
}
