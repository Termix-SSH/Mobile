import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionAccountId } from "@/core/accounts/session";
import { checkOpen } from "@/core/features/open-check";
import { asServerHost, isSynced } from "@/core/sync";
import {
  fromError,
  saveOrigin,
  type ConnectFailure,
  type ConnectionOrigin,
  type Transport,
} from "@/core/transport";
import type { SSHHost } from "@/types";
import { toTerminalHostConfig } from "@/utils/hosts";
import { toast } from "@/utils/toast";
import { createSftpBackend } from "../backend/sftp";
import type { FileBackend } from "../backend/types";

export type FileConnection =
  | { phase: "connecting"; via: Transport["kind"] | null }
  /** The relay connector is mounted and drives the login. */
  | { phase: "relay"; host: SSHHost }
  | { phase: "ready"; backend: FileBackend }
  | { phase: "failed"; failure: ConnectFailure; fix?: ConnectionOrigin };

/** Failures where the next way to connect might still work. */
const FALL_THROUGH = new Set(["network", "proxy", "unavailable"]);

/** Same as the terminal: a try with another way to go gives up sooner. */
const FALLBACK_TIMEOUT_SECS = 8;

/**
 * Connects a files tab the way its host connects: the phone's SFTP first when
 * the plan says so, then the server's File Manager.
 */
export function useFileBackend(
  host: SSHHost,
  type: string,
  active: boolean,
  origin?: ConnectionOrigin,
) {
  const accountId = useSessionAccountId();
  const [state, setState] = useState<FileConnection>({
    phase: "connecting",
    via: null,
  });
  const [override, setOverride] = useState<ConnectionOrigin | undefined>(
    origin,
  );
  const run = useRef(0);
  // Reconnect when the host changes, not when a parent passes a new copy of it.
  const hostRef = useRef(host);
  hostRef.current = host;
  const backendRef = useRef<FileBackend | null>(null);
  const [started, setStarted] = useState(false);

  const closeBackend = () => {
    backendRef.current?.close();
    backendRef.current = null;
  };

  const connect = useCallback(async () => {
    const host = hostRef.current;
    const id = ++run.current;
    const live = () => id === run.current;
    closeBackend();
    setState({ phase: "connecting", via: null });
    const check = await checkOpen(accountId, host, true, type, override);
    if (!live()) return;
    if (check.blocked || !check.attempts.length) {
      setState({
        phase: "failed",
        failure: {
          stage: "unavailable",
          message: check.blocked?.reason ?? "Can't connect.",
          hint: "",
        },
        fix: check.blocked?.fix,
      });
      return;
    }
    let last: ConnectFailure | null = null;
    for (const [i, transport] of check.attempts.entries()) {
      const hasNext = i < check.attempts.length - 1;
      if (transport.kind === "relay") {
        const serverHost =
          accountId && isSynced(accountId)
            ? await asServerHost(accountId, host).catch(() => host)
            : host;
        if (!live()) return;
        setState({ phase: "relay", host: serverHost });
        return;
      }
      setState({ phase: "connecting", via: "local" });
      const backend = createSftpBackend(() => {
        if (!transport.openSession) {
          throw new Error("This way can't open files");
        }
        return transport.openSession(toTerminalHostConfig(host), {
          connectTimeoutSecs: hasNext ? FALLBACK_TIMEOUT_SECS : undefined,
        });
      });
      try {
        await backend.home();
        if (!live()) {
          backend.close();
          return;
        }
        backendRef.current = backend;
        setState({ phase: "ready", backend });
        return;
      } catch (error) {
        backend.close();
        last = { ...fromError(error), origin: "local" };
        if (!live()) return;
        if (!hasNext || !FALL_THROUGH.has(last.stage)) break;
      }
    }
    // The phone can reach the wrong machine at a private address, so a refused
    // login is worth trying through the server too.
    const viaServer =
      last && last.stage !== "cancelled"
        ? await checkOpen(accountId, host, true, type, "server").catch(
            () => null,
          )
        : null;
    if (!live()) return;
    setState({
      phase: "failed",
      failure: last ?? {
        stage: "unavailable",
        message: "Can't connect.",
        hint: "",
      },
      fix: viaServer?.attempts.some((t) => t.kind === "relay")
        ? "server"
        : undefined,
    });
  }, [accountId, host.id, type, override]);

  // Connect the first time the tab shows, not before.
  useEffect(() => {
    if (active && !started) setStarted(true);
  }, [active, started]);

  useEffect(() => {
    if (started) void connect();
  }, [started, connect]);

  useEffect(
    () => () => {
      run.current++;
      closeBackend();
    },
    [],
  );

  const relayReady = useCallback((backend: FileBackend) => {
    backendRef.current = backend;
    setState({ phase: "ready", backend });
  }, []);

  const relayFailed = useCallback((failure: ConnectFailure) => {
    setState({ phase: "failed", failure: { ...failure, origin: "relay" } });
  }, []);

  /** Saves the origin on the host and connects that way. */
  const switchOrigin = useCallback(
    (next: ConnectionOrigin) => {
      setOverride(next);
      saveOrigin(accountId, hostRef.current.id, next).catch((err) =>
        toast.error(
          "Could not save how this host connects",
          err instanceof Error ? err.message : undefined,
        ),
      );
    },
    [accountId],
  );

  return {
    state,
    retry: connect,
    switchOrigin,
    relayReady,
    relayFailed,
  };
}
