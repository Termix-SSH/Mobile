import { useEffect, useMemo, useRef } from "react";
import { useSessionClient } from "@/core/accounts/session";
import { isSynced } from "@/core/sync";
import type { ConnectFailure } from "@/core/transport";
import { AuthDialogs, useSessionConnect } from "@/screens/sessions/shared";
import type {
  ConnectionLogEntry,
  SessionAuthOverrides,
  SSHHost,
} from "@/types";
import { createRelayBackend } from "../backend/relay";
import type { FileBackend } from "../backend/types";

export interface RelayStatus {
  connecting: boolean;
  failure: ConnectFailure | null;
  log: ConnectionLogEntry[];
}

/**
 * Opens the server's File Manager session for `host` (the server's own host)
 * and hands back a backend once it is connected. Draws only the login dialogs.
 */
export function RelayConnector({
  host,
  onReady,
  onStatus,
}: {
  host: SSHHost;
  onReady: (backend: FileBackend) => void;
  onStatus: (status: RelayStatus) => void;
}) {
  const client = useSessionClient();
  const files = client.api.files;

  const transport = useMemo(
    () => ({
      prefix: "fm",
      connect: (
        sid: string,
        h: SSHHost,
        userId: string | undefined,
        overrides: SessionAuthOverrides,
      ) => {
        // A synced copy holds phone ids and secrets. Sending them would stop the
        // server loading its own jump hosts, proxy and login for this host.
        const synced = isSynced(client.accountId);
        return files.connectSSH(sid, {
          hostId: h.id,
          syncId: synced ? (h.syncId ?? undefined) : undefined,
          ip: h.ip,
          port: h.port,
          username: h.username,
          password:
            overrides.userProvidedPassword ??
            (!synced && h.authType === "password" ? h.password : undefined),
          sshKey:
            overrides.userProvidedSshKey ??
            (!synced && h.authType === "key" ? h.key : undefined),
          keyPassword:
            overrides.userProvidedKeyPassword ??
            (synced ? undefined : h.keyPassword),
          authType: h.authType,
          credentialId: synced ? undefined : h.credentialId,
          userId,
          forceKeyboardInteractive: h.forceKeyboardInteractive,
          overrideCredentialUsername: h.overrideCredentialUsername,
          jumpHosts: synced ? undefined : h.jumpHosts,
        });
      },
      submitTotp: (sid: string, code: string) => files.verifySSHTOTP(sid, code),
      submitWarpgate: (sid: string, url: string, key?: string) =>
        files.verifySSHWarpgate(sid, url, key),
      keepAlive: (sid: string) => files.keepSSHAlive(sid),
      disconnect: (sid: string) => files.disconnectSSH(sid),
    }),
    [files, client],
  );

  const ready = useRef(onReady);
  ready.current = onReady;
  const conn = useSessionConnect(
    host,
    transport,
    (sid) => {
      ready.current(createRelayBackend(client, () => sid, host.id));
    },
    { autoConnect: true, keepAliveMs: 30000 },
  );

  const status = useRef(onStatus);
  status.current = onStatus;
  const connecting = conn.state === "connecting";
  const failure = conn.state === "error" ? conn.failure : null;
  useEffect(() => {
    status.current({ connecting, failure, log: conn.logEntries });
  }, [connecting, failure?.message, conn.logEntries]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthDialogs
      state={conn.state}
      errorMessage={conn.errorMessage}
      onSubmitTotp={conn.submitTotp}
      onSubmitWarpgate={conn.submitWarpgate}
      browserSignIn={conn.browserSignIn}
      onSubmitAuth={conn.submitAuth}
      onCancel={conn.cancelAuth}
    />
  );
}
