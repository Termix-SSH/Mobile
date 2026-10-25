import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { SSHHost } from "@/types";
import { router } from "expo-router";
import { useAppContext } from "@/contexts/AppContext";
import { toast } from "@/utils/toast";
import { accounts, clientFor, useActiveAccount } from "@/core/accounts";
import type { AccountClient } from "@/core/api/AccountClient";
import type { OpenTabRecord } from "@/core/api/types";
import type {
  Blocked,
  ConnectionOrigin,
  TransportKind,
} from "@/core/transport";
import { noteSessions, trackTabOpened } from "@/core/analytics";
import { checkOpen, features } from "@/core/features";
import { recordRecent } from "@/core/hosts/recent";
import { asServerHost, isSynced, serverHostId } from "@/core/sync";
import { isSshHost } from "@/utils/hosts";
import { useLocalStoreState } from "@/core/data/hooks";
import { tunnelRunner, tunnelStateText } from "@/core/tunnels";
import { repositoriesFor } from "@/core/data/repositories";
import {
  backgroundSessions,
  loadSavedTabs,
  restoreTabs,
  saveTabs,
  sessionLifecycle,
  sessionStatus,
  toSavedTab,
  type SavedTab,
} from "@/core/sessions";
import { displayTitle, moveTab } from "./session-tabs";

/** Session tab type. The registry knows which feature owns each one. */
export type SessionType = string;

export interface TerminalSession {
  id: string;
  /** Account that opened the tab. It keeps using it after a switch. */
  accountId: string;
  host: SSHHost;
  title: string;
  isActive: boolean;
  createdAt: Date;
  type: SessionType;
  /** Stable per-tab instance id used for cross-device tab sync (open-tabs API). */
  instanceId: string;
  /** Backend SSH session id this tab is attached to, when resumed/created. */
  backendSessionId?: string | null;
  /** When set, the terminal should attach to this backend session on connect. */
  restoredSessionId?: string | null;
  /** Protocol for tabs that open more than one, like remote desktop. */
  remoteProtocol?: string;
  /** Overrides the host's origin, like a tab reopened from another device. */
  origin?: ConnectionOrigin;
  /** Whether the server lists this tab for other devices (relay only). */
  listed?: boolean;
  /** Which way the tab's connection went. */
  transport?: TransportKind;
  /** A name the user gave the tab. Wins over every other title. */
  customTitle?: string | null;
  /** The title the program set, shown when the host asks for it. */
  shellTitle?: string | null;
  /** Brought back after the app was closed. */
  restored?: boolean;
  /** What the tab saved to pick up again, like its tmux session. */
  resumeData?: Record<string, string> | null;
  /** The tab this one was opened from as a companion, like a terminal. */
  linkedSessionId?: string | null;
}

function getSessionTypeLabel(type: SessionType, remoteProtocol?: string) {
  return features.sessionTab(type)?.titleSuffix({ remoteProtocol }) ?? "";
}

function isSameSessionKind(
  session: Pick<TerminalSession, "host" | "type" | "remoteProtocol">,
  host: SSHHost,
  type: SessionType,
  remoteProtocol?: string,
): boolean {
  if (session.host.id !== host.id || session.type !== type) return false;
  return (session.remoteProtocol ?? null) === (remoteProtocol ?? null);
}

/** open-tabs tabType is shared with the web app. */
function toTabType(
  type: SessionType,
  remoteProtocol: string | undefined,
  client: AccountClient | null,
): string {
  return (
    features.sessionTab(type)?.toServerTabType({ remoteProtocol }, client) ??
    type
  );
}

function uuid(): string {
  // RN-safe UUID v4 (crypto.randomUUID is not always available).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface TerminalSessionsContextType {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  /** Background tab records that exist server-side but aren't open here. */
  backgroundTabRecords: OpenTabRecord[];
  refreshBackgroundTabs: () => Promise<void>;
  addSession: (
    host: SSHHost,
    type?: SessionType,
    opts?: {
      instanceId?: string;
      restoredSessionId?: string | null;
      remoteProtocol?: string;
      origin?: ConnectionOrigin;
      /** Opens it for this account instead of the active one. */
      accountId?: string;
      /** Opens as the companion of this tab, right after it. */
      linkedSessionId?: string;
    },
  ) => string;
  removeSession: (sessionId: string) => void;
  /** A name for the tab; empty goes back to the host's name. */
  renameSession: (sessionId: string, title: string) => void;
  setShellTitle: (sessionId: string, title: string | null) => void;
  /** Moves a tab to a new place in the tab bar. */
  moveSession: (sessionId: string, toIndex: number) => void;
  /** Another tab of the same kind on the same host. */
  duplicateSession: (sessionId: string) => string | null;
  setActiveSession: (sessionId: string) => void;
  clearAllSessions: () => void;
  /** Ends every session and closes its tab (the notification's Disconnect all). */
  closeAllSessions: () => void;
  /** Saves what a tab needs to pick up again after a restart. */
  setResumeData: (
    sessionId: string,
    data: Record<string, string> | null,
  ) => void;
  /** Persist the backend session id created/attached for a tab (cross-device). */
  setBackendSessionId: (sessionId: string, backendId: string | null) => void;
  /** A tab's connection picked its way; relay tabs get listed for other devices. */
  setSessionTransport: (sessionId: string, kind: TransportKind) => void;
  /** Forget a server-side background tab record. */
  forgetBackgroundTab: (recordId: string) => void;
  /** Opens a tab and the sessions screen. Resolves to why it can't, if it can't. */
  navigateToSessions: (
    host?: SSHHost,
    type?: SessionType,
    opts?: { remoteProtocol?: string; quiet?: boolean },
  ) => Promise<Blocked | null>;
  isCustomKeyboardVisible: boolean;
  toggleCustomKeyboard: () => void;
  lastKeyboardHeight: number;
  setLastKeyboardHeight: (height: number) => void;
  keyboardIntentionallyHiddenRef: React.MutableRefObject<boolean>;
  setKeyboardIntentionallyHidden: (hidden: boolean) => void;
}

const TerminalSessionsContext = createContext<
  TerminalSessionsContextType | undefined
>(undefined);

export const useTerminalSessions = () => {
  const context = useContext(TerminalSessionsContext);
  if (context === undefined) {
    throw new Error(
      "useTerminalSessions must be used within a TerminalSessionsProvider",
    );
  }
  return context;
};

interface TerminalSessionsProviderProps {
  children: ReactNode;
}

export const TerminalSessionsProvider: React.FC<
  TerminalSessionsProviderProps
> = ({ children }) => {
  const { isAuthenticated } = useAppContext();
  const activeAccountId = useActiveAccount().id;
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [backgroundTabRecords, setBackgroundTabRecords] = useState<
    OpenTabRecord[]
  >([]);
  const [isCustomKeyboardVisible, setIsCustomKeyboardVisible] = useState(false);
  const [lastKeyboardHeight, setLastKeyboardHeight] = useState(300);
  const keyboardIntentionallyHiddenRef = useRef(false);
  const [, forceUpdate] = useState({});

  const refreshBackgroundTabs = useCallback(async () => {
    const client = accounts.activeClient();
    setBackgroundTabRecords(
      client ? await client.api.openTabs.getOpenTabs() : [],
    );
  }, []);

  const addSession = useCallback(
    (
      host: SSHHost,
      type: SessionType = features.defaultSessionType(),
      opts?: {
        instanceId?: string;
        restoredSessionId?: string | null;
        remoteProtocol?: string;
        origin?: ConnectionOrigin;
        accountId?: string;
        /** Opens as the companion of this tab, right after it. */
        linkedSessionId?: string;
      },
    ): string => {
      const instanceId = opts?.instanceId ?? uuid();
      const accountId = opts?.accountId ?? accounts.active().id;
      const client = clientFor(accountId);
      const sessionId = `${host.id}-${type}-${Date.now()}`;
      if (!opts?.restoredSessionId) trackTabOpened(type);

      setSessions((prev) => {
        const existingSessions = prev.filter((session) =>
          isSameSessionKind(session, host, type, opts?.remoteProtocol),
        );

        const typeLabel = getSessionTypeLabel(type, opts?.remoteProtocol);
        let title = typeLabel ? `${host.name} - ${typeLabel}` : host.name;
        if (existingSessions.length > 0) {
          title = typeLabel
            ? `${host.name} - ${typeLabel} (${existingSessions.length + 1})`
            : `${host.name} (${existingSessions.length + 1})`;
        }

        const newSession: TerminalSession = {
          id: sessionId,
          accountId,
          host,
          title,
          isActive: true,
          createdAt: new Date(),
          type,
          instanceId,
          backendSessionId: opts?.restoredSessionId ?? null,
          restoredSessionId: opts?.restoredSessionId ?? null,
          remoteProtocol: opts?.remoteProtocol,
          // A server session from another device can only attach through it.
          origin:
            opts?.origin ?? (opts?.restoredSessionId ? "server" : undefined),
          linkedSessionId: opts?.linkedSessionId ?? null,
        };

        // Persist this tab server-side for cross-device awareness.
        // Server-only tabs are listed for other devices right away. A shell
        // waits until it knows whether it goes through the server.
        if (client && features.serverOnly(type)) {
          newSession.listed = true;
          client.api.openTabs.addOpenTab({
            id: instanceId,
            tabType: toTabType(type, opts?.remoteProtocol, client),
            hostId: host.id,
            label: title,
            tabOrder: prev.length,
            backendSessionId: opts?.restoredSessionId ?? null,
          });
        }

        const updatedSessions = prev.map((session) => ({
          ...session,
          isActive: false,
        }));
        const after = opts?.linkedSessionId
          ? updatedSessions.findIndex((s) => s.id === opts.linkedSessionId)
          : -1;
        if (after >= 0) {
          updatedSessions.splice(after + 1, 0, newSession);
          return updatedSessions;
        }
        return [...updatedSessions, newSession];
      });

      setActiveSessionId(sessionId);
      return sessionId;
    },
    [],
  );

  const removeSession = useCallback((sessionId: string) => {
    // All reads of activeSessionId happen inside the setSessions updater so we
    // always see the latest state regardless of how quickly sessions are removed.
    setSessions((prev) => {
      const sessionToRemove = prev.find((session) => session.id === sessionId);
      if (!sessionToRemove) return prev;

      // Forget the server-side record for this tab.
      if (sessionToRemove.listed) {
        clientFor(sessionToRemove.accountId)?.api.openTabs.deleteOpenTab(
          sessionToRemove.instanceId,
        );
      }

      let updatedSessions = prev.filter((session) => session.id !== sessionId);

      // Re-number sibling sessions of the same host/type.
      const sessionType = sessionToRemove.type;
      const remoteProtocol = sessionToRemove.remoteProtocol;
      const sameHostSessions = updatedSessions.filter((session) =>
        isSameSessionKind(
          session,
          sessionToRemove.host,
          sessionType,
          remoteProtocol,
        ),
      );

      if (sameHostSessions.length > 0) {
        sameHostSessions.sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );
        sameHostSessions.forEach((session, index) => {
          const sessionIndex = updatedSessions.findIndex(
            (s) => s.id === session.id,
          );
          if (sessionIndex !== -1) {
            const typeLabel = getSessionTypeLabel(
              session.type,
              session.remoteProtocol,
            );
            const baseName = typeLabel
              ? `${session.host.name} - ${typeLabel}`
              : session.host.name;
            updatedSessions[sessionIndex] = {
              ...session,
              title: index === 0 ? baseName : `${baseName} (${index + 1})`,
            };
          }
        });
      }

      // Check whether the removed session was the active one - and if so pick a
      // new active session. Using setActiveSessionId inside a setSessions updater
      // is safe: React batches these in the same flush.
      const removedWasActive = !updatedSessions.some((s) => s.isActive);
      if (removedWasActive) {
        if (updatedSessions.length > 0) {
          const newActive = updatedSessions[updatedSessions.length - 1];
          setActiveSessionId(newActive.id);
          updatedSessions = updatedSessions.map((s) => ({
            ...s,
            isActive: s.id === newActive.id,
          }));
        } else {
          setActiveSessionId(null);
        }
      }

      return updatedSessions;
    });
  }, []);

  const renameSession = useCallback((sessionId: string, title: string) => {
    setSessions((prev) => {
      const target = prev.find((s) => s.id === sessionId);
      if (!target) return prev;
      const customTitle = title.trim() || null;
      const next = { ...target, customTitle };
      if (target.listed) {
        clientFor(target.accountId)?.api.openTabs.patchOpenTab(
          target.instanceId,
          { label: displayTitle(next) },
        );
      }
      return prev.map((s) => (s.id === sessionId ? next : s));
    });
  }, []);

  const setShellTitle = useCallback(
    (sessionId: string, title: string | null) => {
      setSessions((prev) =>
        prev.some((s) => s.id === sessionId && s.shellTitle !== title)
          ? prev.map((s) =>
              s.id === sessionId ? { ...s, shellTitle: title } : s,
            )
          : prev,
      );
    },
    [],
  );

  const moveSession = useCallback((sessionId: string, toIndex: number) => {
    setSessions((prev) => {
      const next = moveTab(prev, sessionId, toIndex);
      if (next === prev) return prev;
      // Other devices list tabs in the same order.
      next.forEach((s, i) => {
        if (s.listed && prev.indexOf(s) !== i) {
          clientFor(s.accountId)?.api.openTabs.patchOpenTab(s.instanceId, {
            tabOrder: i,
          });
        }
      });
      return next;
    });
  }, []);

  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const duplicateSession = useCallback(
    (sessionId: string) => {
      const source = sessionsRef.current.find((s) => s.id === sessionId);
      if (!source) return null;
      return addSession(source.host, source.type, {
        remoteProtocol: source.remoteProtocol,
        origin: source.origin,
        accountId: source.accountId,
      });
    },
    [addSession],
  );

  const setActiveSession = useCallback(
    (sessionId: string) => {
      setSessions((prev) => {
        const newSession = prev.find((s) => s.id === sessionId);

        if (
          !features.sessionHas(newSession?.type, "terminal-input") &&
          isCustomKeyboardVisible
        ) {
          setIsCustomKeyboardVisible(false);
        }

        return prev.map((session) => ({
          ...session,
          isActive: session.id === sessionId,
        }));
      });
      setActiveSessionId(sessionId);
    },
    [isCustomKeyboardVisible],
  );

  const setBackendSessionId = useCallback(
    (sessionId: string, backendId: string | null) => {
      setSessions((prev) => {
        const target = prev.find((s) => s.id === sessionId);
        if (!target) return prev;
        if (target.listed) {
          clientFor(target.accountId)?.api.openTabs.patchOpenTab(
            target.instanceId,
            { backendSessionId: backendId },
          );
        }
        return prev.map((s) =>
          s.id === sessionId
            ? { ...s, backendSessionId: backendId, restoredSessionId: null }
            : s,
        );
      });
    },
    [],
  );

  const setSessionTransport = useCallback(
    (sessionId: string, kind: TransportKind) => {
      setSessions((prev) => {
        const target = prev.find((s) => s.id === sessionId);
        if (!target) return prev;
        const client = clientFor(target.accountId);
        const listed = kind === "relay" && !!client;
        if (listed === !!target.listed) {
          return target.transport === kind
            ? prev
            : prev.map((s) =>
                s.id === sessionId ? { ...s, transport: kind } : s,
              );
        }
        if (client && listed) {
          const record = {
            id: target.instanceId,
            tabType: toTabType(target.type, target.remoteProtocol, client),
            label: target.title,
            tabOrder: prev.indexOf(target),
            backendSessionId: target.backendSessionId ?? null,
          };
          // Other devices know the host by the server's id.
          void serverHostId(target.accountId, target.host)
            .catch(() => target.host.id)
            .then((hostId) =>
              client.api.openTabs.addOpenTab({ ...record, hostId }),
            );
        } else {
          client?.api.openTabs.deleteOpenTab(target.instanceId);
        }
        return prev.map((s) =>
          s.id === sessionId ? { ...s, listed, transport: kind } : s,
        );
      });
    },
    [],
  );

  const forgetBackgroundTab = useCallback((recordId: string) => {
    setBackgroundTabRecords((prev) => prev.filter((r) => r.id !== recordId));
  }, []);

  const navigateToSessions = useCallback(
    async (
      host?: SSHHost,
      type: SessionType = features.defaultSessionType(),
      opts?: { remoteProtocol?: string; quiet?: boolean },
    ): Promise<Blocked | null> => {
      if (host) {
        const accountId = accounts.active().id;
        const ctx = {
          account: accounts.active(),
          client: accounts.activeClient(),
        };
        const remoteProtocol = opts?.remoteProtocol ?? host.connectionType;
        if (!features.canOpen(type, { remoteProtocol }, ctx)) {
          const blocked = {
            reason: "This feature is turned off on the server.",
          };
          if (!opts?.quiet) toast.error(blocked.reason);
          return blocked;
        }
        const check = await checkOpen(accountId, host, isSshHost(host), type);
        if (check.blocked) {
          if (!opts?.quiet) toast.error(check.blocked.reason);
          return check.blocked;
        }
        void recordRecent(accountId, host);
        // Server features act on the server's host, by the server's id.
        const sessionHost =
          features.serverOnly(type) && isSynced(accountId)
            ? await asServerHost(accountId, host).catch(() => host)
            : host;
        addSession(sessionHost, type, {
          remoteProtocol: opts?.remoteProtocol,
        });
      }
      router.push("/(tabs)/sessions");
      return null;
    },
    [addSession],
  );

  const toggleCustomKeyboard = useCallback(() => {
    setIsCustomKeyboardVisible((prev) => !prev);
  }, []);

  const setKeyboardIntentionallyHidden = useCallback((hidden: boolean) => {
    keyboardIntentionallyHiddenRef.current = hidden;
    forceUpdate({});
  }, []);

  const clearAllSessions = useCallback(() => {
    setSessions([]);
    setActiveSessionId(null);
    setBackgroundTabRecords([]);
    setIsCustomKeyboardVisible(false);
    keyboardIntentionallyHiddenRef.current = false;
  }, []);

  const closeAllSessions = useCallback(() => {
    setSessions((prev) => {
      for (const s of prev) {
        if (s.listed) {
          clientFor(s.accountId)?.api.openTabs.deleteOpenTab(s.instanceId);
        }
      }
      return [];
    });
    setActiveSessionId(null);
    setIsCustomKeyboardVisible(false);
  }, []);

  const setResumeData = useCallback(
    (sessionId: string, data: Record<string, string> | null) => {
      setSessions((prev) =>
        prev.some(
          (s) =>
            s.id === sessionId &&
            JSON.stringify(s.resumeData ?? null) !== JSON.stringify(data),
        )
          ? prev.map((s) =>
              s.id === sessionId ? { ...s, resumeData: data } : s,
            )
          : prev,
      );
    },
    [],
  );

  // App wide lifecycle and the background service, for as long as the app runs.
  useEffect(() => {
    sessionLifecycle.start();
    backgroundSessions.start(() => {
      tunnelRunner.stopAll();
      closeAllSessions();
    });
    const sendTunnels = () =>
      backgroundSessions.setTunnels(
        tunnelRunner
          .active()
          .map((t) => `${t.hostName} | ${tunnelStateText(t.status?.status)}`),
      );
    const unwatch = tunnelRunner.subscribe(sendTunnels);
    return () => {
      unwatch();
      backgroundSessions.stop();
    };
  }, [closeAllSessions]);

  useEffect(() => {
    sessionStatus.retain(sessions.map((s) => s.id));
    void noteSessions(sessions.length).catch(() => {});
    backgroundSessions.setTabs(
      sessions.map((s) => ({ id: s.id, title: displayTitle(s) })),
    );
  }, [sessions]);

  // Tabs come back after the app was closed. Hosts are read again from their
  // account's store, so nothing secret is saved with the tab list.
  const { available: storeAvailable, unlocked } = useLocalStoreState();
  const restoreStage = useRef<"idle" | "running" | "done">("idle");
  const laterTabs = useRef<SavedTab[]>([]);
  const runRestore = useCallback(async (saved: SavedTab[]) => {
    const result = await restoreTabs(saved, {
      accountExists: (id) => !!accounts.find(id),
      findHost: async (tab) => {
        const account = accounts.find(tab.accountId);
        if (!account) return null;
        const repos = repositoriesFor(account, accounts.client(account.id));
        const host = await repos.hosts.get(tab.hostId);
        if (!host) return null;
        return tab.serverHost
          ? await asServerHost(tab.accountId, host).catch(() => host)
          : host;
      },
    });
    laterTabs.current = result.later;
    if (result.missing.length) {
      toast.info(
        result.missing.length === 1
          ? "A tab was not reopened because its host is gone"
          : `${result.missing.length} tabs were not reopened because their hosts are gone`,
      );
    }
    if (!result.restored.length) return;
    setSessions((prev) => {
      const open = new Set(prev.map((s) => s.instanceId));
      const back: TerminalSession[] = result.restored
        .filter(({ saved: t }) => !open.has(t.instanceId))
        .map(({ saved: t, host }) => ({
          id: t.id,
          accountId: t.accountId,
          host,
          title: t.title,
          isActive: false,
          createdAt: new Date(t.createdAt),
          type: t.type,
          instanceId: t.instanceId,
          backendSessionId: t.backendSessionId,
          restoredSessionId:
            t.transport === "relay" ? t.backendSessionId : null,
          remoteProtocol: t.remoteProtocol,
          // A server session can only be picked up through the server.
          origin:
            t.origin ??
            (t.transport === "relay" && t.backendSessionId
              ? "server"
              : undefined),
          listed: t.listed,
          transport: t.transport,
          customTitle: t.customTitle,
          restored: true,
          resumeData: t.resumeData,
        }));
      if (!back.length) return prev;
      const next = [...back, ...prev];
      if (prev.some((s) => s.isActive)) return next;
      const wanted =
        result.restored.find((r) => r.saved.active)?.saved.id ?? back[0].id;
      setActiveSessionId(wanted);
      return next.map((s) => ({ ...s, isActive: s.id === wanted }));
    });
  }, []);

  useEffect(() => {
    if (!storeAvailable) {
      restoreStage.current = "done";
      return;
    }
    if (!unlocked || restoreStage.current !== "idle") return;
    restoreStage.current = "running";
    void loadSavedTabs()
      .then(runRestore)
      .catch(() => {})
      .finally(() => {
        restoreStage.current = "done";
      });
  }, [storeAvailable, unlocked, runRestore]);

  useEffect(() => {
    if (restoreStage.current !== "done" || !laterTabs.current.length) return;
    if (!isAuthenticated) return;
    const later = laterTabs.current;
    laterTabs.current = [];
    void runRestore(later);
  }, [isAuthenticated, runRestore]);

  useEffect(() => {
    if (!storeAvailable || restoreStage.current !== "done") return;
    const timer = setTimeout(() => {
      void saveTabs([...sessions.map(toSavedTab), ...laterTabs.current]);
    }, 400);
    return () => clearTimeout(timer);
  }, [sessions, storeAvailable]);

  useEffect(() => {
    if (isAuthenticated) {
      // Hydrate background tab records (e.g. tabs opened on another device).
      refreshBackgroundTabs();
      return;
    }
    setBackgroundTabRecords([]);
    // Only a real sign out closes tabs. Switching accounts keeps them open.
    const client = clientFor(activeAccountId);
    if (client && !client.isAuthenticated()) {
      setSessions((prev) => {
        const kept = prev.filter((s) => s.accountId !== activeAccountId);
        if (kept.length === prev.length) return prev;
        if (!kept.some((s) => s.isActive)) {
          const last = kept[kept.length - 1];
          setActiveSessionId(last?.id ?? null);
          return kept.map((s) => ({ ...s, isActive: s.id === last?.id }));
        }
        return kept;
      });
    }
  }, [isAuthenticated, activeAccountId, refreshBackgroundTabs]);

  // Every terminal and the tab bar read this; keep it stable between renders.
  const value = useMemo(
    () => ({
      sessions,
      activeSessionId,
      backgroundTabRecords,
      refreshBackgroundTabs,
      addSession,
      removeSession,
      renameSession,
      setShellTitle,
      moveSession,
      duplicateSession,
      setActiveSession,
      clearAllSessions,
      closeAllSessions,
      setResumeData,
      setBackendSessionId,
      setSessionTransport,
      forgetBackgroundTab,
      navigateToSessions,
      isCustomKeyboardVisible,
      toggleCustomKeyboard,
      lastKeyboardHeight,
      setLastKeyboardHeight,
      keyboardIntentionallyHiddenRef,
      setKeyboardIntentionallyHidden,
    }),
    [
      sessions,
      activeSessionId,
      backgroundTabRecords,
      refreshBackgroundTabs,
      addSession,
      removeSession,
      renameSession,
      setShellTitle,
      moveSession,
      duplicateSession,
      setActiveSession,
      clearAllSessions,
      closeAllSessions,
      setResumeData,
      setBackendSessionId,
      setSessionTransport,
      forgetBackgroundTab,
      navigateToSessions,
      isCustomKeyboardVisible,
      toggleCustomKeyboard,
      lastKeyboardHeight,
      setLastKeyboardHeight,
      keyboardIntentionallyHiddenRef,
      setKeyboardIntentionallyHidden,
    ],
  );

  return (
    <TerminalSessionsContext.Provider value={value}>
      {children}
    </TerminalSessionsContext.Provider>
  );
};
