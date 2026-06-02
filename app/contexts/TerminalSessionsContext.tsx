import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { SSHHost } from "@/types";
import { router } from "expo-router";
import { useAppContext } from "@/app/AppContext";
import {
  addOpenTab,
  deleteOpenTab,
  getOpenTabs,
  patchOpenTab,
  type OpenTabRecord,
} from "@/app/main-axios";

export type SessionType =
  | "terminal"
  | "stats"
  | "filemanager"
  | "tunnel"
  | "docker"
  | "remoteDesktop";

export interface TerminalSession {
  id: string;
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
}

const TYPE_LABELS: Record<SessionType, string> = {
  terminal: "",
  stats: "Stats",
  filemanager: "Files",
  tunnel: "Tunnels",
  docker: "Docker",
  remoteDesktop: "Remote",
};

/** open-tabs tabType is shared with the web app; map our session types to it. */
function toTabType(type: SessionType): string {
  switch (type) {
    case "filemanager":
      return "files";
    case "remoteDesktop":
      return "rdp";
    default:
      return type;
  }
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
    opts?: { instanceId?: string; restoredSessionId?: string | null },
  ) => string;
  removeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string) => void;
  clearAllSessions: () => void;
  /** Persist the backend session id created/attached for a tab (cross-device). */
  setBackendSessionId: (sessionId: string, backendId: string | null) => void;
  /** Forget a server-side background tab record. */
  forgetBackgroundTab: (recordId: string) => void;
  navigateToSessions: (host?: SSHHost, type?: SessionType) => void;
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
    const records = await getOpenTabs();
    setBackgroundTabRecords(records);
  }, []);

  const addSession = useCallback(
    (
      host: SSHHost,
      type: SessionType = "terminal",
      opts?: { instanceId?: string; restoredSessionId?: string | null },
    ): string => {
      const instanceId = opts?.instanceId ?? uuid();
      const sessionId = `${host.id}-${type}-${Date.now()}`;

      setSessions((prev) => {
        const existingSessions = prev.filter(
          (session) => session.host.id === host.id && session.type === type,
        );

        const typeLabel = TYPE_LABELS[type];
        let title = typeLabel ? `${host.name} - ${typeLabel}` : host.name;
        if (existingSessions.length > 0) {
          title = typeLabel
            ? `${host.name} - ${typeLabel} (${existingSessions.length + 1})`
            : `${host.name} (${existingSessions.length + 1})`;
        }

        const newSession: TerminalSession = {
          id: sessionId,
          host,
          title,
          isActive: true,
          createdAt: new Date(),
          type,
          instanceId,
          backendSessionId: opts?.restoredSessionId ?? null,
          restoredSessionId: opts?.restoredSessionId ?? null,
        };

        // Persist this tab server-side for cross-device awareness.
        addOpenTab({
          id: instanceId,
          tabType: toTabType(type),
          hostId: host.id,
          label: title,
          tabOrder: prev.length,
          backendSessionId: opts?.restoredSessionId ?? null,
        });

        const updatedSessions = prev.map((session) => ({
          ...session,
          isActive: false,
        }));
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
      deleteOpenTab(sessionToRemove.instanceId);

      let updatedSessions = prev.filter((session) => session.id !== sessionId);

      // Re-number sibling sessions of the same host/type.
      const hostId = sessionToRemove.host.id;
      const sessionType = sessionToRemove.type;
      const sameHostSessions = updatedSessions.filter(
        (session) =>
          session.host.id === hostId && session.type === sessionType,
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
            const typeLabel = TYPE_LABELS[session.type];
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

      // Check whether the removed session was the active one — and if so pick a
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

  const setActiveSession = useCallback(
    (sessionId: string) => {
      setSessions((prev) => {
        const newSession = prev.find((s) => s.id === sessionId);

        if (newSession?.type !== "terminal" && isCustomKeyboardVisible) {
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
        patchOpenTab(target.instanceId, { backendSessionId: backendId });
        return prev.map((s) =>
          s.id === sessionId
            ? { ...s, backendSessionId: backendId, restoredSessionId: null }
            : s,
        );
      });
    },
    [],
  );

  const forgetBackgroundTab = useCallback((recordId: string) => {
    setBackgroundTabRecords((prev) => prev.filter((r) => r.id !== recordId));
  }, []);

  const navigateToSessions = useCallback(
    (host?: SSHHost, type: SessionType = "terminal") => {
      if (host) {
        addSession(host, type);
      }
      router.push("/(tabs)/sessions");
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

  useEffect(() => {
    if (!isAuthenticated) {
      clearAllSessions();
    } else {
      // Hydrate background tab records (e.g. tabs opened on another device).
      refreshBackgroundTabs();
    }
  }, [isAuthenticated, clearAllSessions, refreshBackgroundTabs]);

  return (
    <TerminalSessionsContext.Provider
      value={{
        sessions,
        activeSessionId,
        backgroundTabRecords,
        refreshBackgroundTabs,
        addSession,
        removeSession,
        setActiveSession,
        clearAllSessions,
        setBackendSessionId,
        forgetBackgroundTab,
        navigateToSessions,
        isCustomKeyboardVisible,
        toggleCustomKeyboard,
        lastKeyboardHeight,
        setLastKeyboardHeight,
        keyboardIntentionallyHiddenRef,
        setKeyboardIntentionallyHidden,
      }}
    >
      {children}
    </TerminalSessionsContext.Provider>
  );
};
