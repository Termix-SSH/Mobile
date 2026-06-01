import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { SSHHost, SessionAuthOverrides } from "@/types";
import { getCurrentUserId } from "@/app/utils/user";
import { extractConnectionLogs } from "@/app/main-axios";
import { useConnectionLog } from "./useConnectionLog";

export type SessionConnectState =
  | "idle"
  | "connecting"
  | "connected"
  | "totp"
  | "warpgate"
  | "auth"
  | "error";

/**
 * The transport-specific calls a session type provides. File manager passes the
 * `connectSSH`/`verifySSHTOTP`/`keepSSHAlive`/`disconnectSSH` family; docker
 * passes its `dockerConnect`/`dockerConnectTOTP`/... family. This lets one
 * connect state machine drive every session-based REST type.
 */
export interface SessionConnectTransport {
  /** sessionId prefix, e.g. "fm" or "docker". */
  prefix: string;
  connect: (
    sessionId: string,
    host: SSHHost,
    userId: string | undefined,
    overrides: SessionAuthOverrides,
  ) => Promise<any>;
  submitTotp: (sessionId: string, code: string) => Promise<any>;
  submitWarpgate?: (
    sessionId: string,
    url: string,
    securityKey?: string,
  ) => Promise<any>;
  keepAlive?: (sessionId: string) => Promise<unknown>;
  disconnect?: (sessionId: string) => Promise<unknown>;
}

/**
 * Drives the shared connect handshake for session-based REST connection types
 * (file manager, docker). Owns: session id generation, the connect call, the
 * TOTP / Warpgate / interactive-auth branches, keepalive, and a connection log.
 * Mirrors the web's connect flow so mobile reaches auth-method parity.
 *
 * UI renders <AuthDialogs> wired to the returned `auth*` props; on success the
 * caller's `onConnected(sessionId)` runs (load the directory, list containers…).
 */
export function useSessionConnect(
  host: SSHHost | null,
  transport: SessionConnectTransport,
  onConnected: (sessionId: string) => void | Promise<void>,
  options?: { keepAliveMs?: number; autoConnect?: boolean },
) {
  const log = useConnectionLog();
  const [state, setState] = useState<SessionConnectState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const sessionIdRef = useRef<string>("");
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const overridesRef = useRef<SessionAuthOverrides>({});
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  const keepAliveMs = options?.keepAliveMs ?? 30000;

  const stopKeepAlive = useCallback(() => {
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
  }, []);

  const startKeepAlive = useCallback(() => {
    if (!transport.keepAlive) return;
    stopKeepAlive();
    keepAliveRef.current = setInterval(() => {
      if (sessionIdRef.current && AppState.currentState === "active") {
        transport.keepAlive?.(sessionIdRef.current).catch(() => {});
      }
    }, keepAliveMs);
  }, [transport, keepAliveMs, stopKeepAlive]);

  const markConnected = useCallback(async () => {
    setState("connected");
    log.append({ level: "success", message: "Connected" });
    startKeepAlive();
    await onConnectedRef.current(sessionIdRef.current);
  }, [log, startKeepAlive]);

  const runConnect = useCallback(
    async (overrides: SessionAuthOverrides) => {
      if (!host) return;
      setState("connecting");
      setErrorMessage("");
      overridesRef.current = overrides;
      try {
        const userId = (await getCurrentUserId()) || undefined;
        const sessionId =
          sessionIdRef.current ||
          `${transport.prefix}-${host.id}-${Date.now()}`;
        sessionIdRef.current = sessionId;

        log.append({ level: "info", message: `Connecting to ${host.name}…` });
        const result = await transport.connect(
          sessionId,
          host,
          userId,
          overrides,
        );
        log.ingest(extractConnectionLogs(result));

        if (result?.requiresTOTP || result?.totpRequired) {
          setState("totp");
          return;
        }
        if (result?.requiresWarpgate || result?.warpgateRequired) {
          setState("warpgate");
          return;
        }
        if (
          result?.requiresAuth ||
          result?.authRequired ||
          result?.code === "AUTH_REQUIRED"
        ) {
          setState("auth");
          return;
        }
        await markConnected();
      } catch (error: any) {
        log.ingest(extractConnectionLogs(error));
        const msg = error?.message || "Failed to connect";
        setErrorMessage(msg);
        log.append({ level: "error", message: msg });
        // Surface auth dialog rather than a dead error when the host needs creds.
        if (error?.status === 401 || error?.code === "AUTH_REQUIRED") {
          setState("auth");
        } else {
          setState("error");
        }
      }
    },
    [host, transport, log, markConnected],
  );

  const connect = useCallback(() => {
    sessionIdRef.current = "";
    log.clear();
    return runConnect({});
  }, [runConnect, log]);

  const retry = useCallback(() => connect(), [connect]);

  const submitTotp = useCallback(
    async (code: string) => {
      setState("connecting");
      try {
        const result = await transport.submitTotp(sessionIdRef.current, code);
        log.ingest(extractConnectionLogs(result));
        await markConnected();
      } catch (error: any) {
        const msg = error?.message || "Invalid code";
        log.append({ level: "error", message: msg });
        setErrorMessage(msg);
        setState("totp");
        throw error;
      }
    },
    [transport, log, markConnected],
  );

  const submitWarpgate = useCallback(
    async (url: string, securityKey?: string) => {
      if (!transport.submitWarpgate) return;
      setState("connecting");
      try {
        const result = await transport.submitWarpgate(
          sessionIdRef.current,
          url,
          securityKey,
        );
        log.ingest(extractConnectionLogs(result));
        await markConnected();
      } catch (error: any) {
        const msg = error?.message || "Warpgate authentication failed";
        log.append({ level: "error", message: msg });
        setErrorMessage(msg);
        setState("warpgate");
        throw error;
      }
    },
    [transport, log, markConnected],
  );

  const submitAuth = useCallback(
    (overrides: SessionAuthOverrides) => runConnect(overrides),
    [runConnect],
  );

  const cancelAuth = useCallback(() => {
    setState("error");
    setErrorMessage("Authentication cancelled");
  }, []);

  const disconnect = useCallback(() => {
    stopKeepAlive();
    if (sessionIdRef.current) {
      transport.disconnect?.(sessionIdRef.current).catch(() => {});
    }
    sessionIdRef.current = "";
    setState("idle");
  }, [transport, stopKeepAlive]);

  useEffect(() => {
    if (options?.autoConnect && host && state === "idle") {
      connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host?.id, options?.autoConnect]);

  useEffect(() => stopKeepAlive, [stopKeepAlive]);

  return {
    state,
    errorMessage,
    sessionId: sessionIdRef,
    logEntries: log.entries,
    logClear: log.clear,
    connect,
    retry,
    disconnect,
    // Auth dialog wiring
    submitTotp,
    submitWarpgate,
    submitAuth,
    cancelAuth,
  };
}
