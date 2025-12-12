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

export interface TerminalSession {
  id: string;
  host: SSHHost;
  title: string;
  isActive: boolean;
  createdAt: Date;
  type: "terminal" | "stats" | "filemanager" | "tunnel";
}

interface TerminalSessionsContextType {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  addSession: (
    host: SSHHost,
    type?: "terminal" | "stats" | "filemanager" | "tunnel",
  ) => string;
  removeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string) => void;
  clearAllSessions: () => void;
  navigateToSessions: (
    host?: SSHHost,
    type?: "terminal" | "stats" | "filemanager" | "tunnel",
  ) => void;
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
  const [isCustomKeyboardVisible, setIsCustomKeyboardVisible] = useState(false);
  const [lastKeyboardHeight, setLastKeyboardHeight] = useState(300);
  const keyboardIntentionallyHiddenRef = useRef(false);
  const [, forceUpdate] = useState({});

  const addSession = useCallback(
    (
      host: SSHHost,
      type: "terminal" | "stats" | "filemanager" | "tunnel" = "terminal",
    ): string => {
      setSessions((prev) => {
        const existingSessions = prev.filter(
          (session) => session.host.id === host.id && session.type === type,
        );

        const typeLabel =
          type === "stats"
            ? "Stats"
            : type === "filemanager"
              ? "Files"
              : type === "tunnel"
                ? "Tunnels"
                : "";
        let title = typeLabel ? `${host.name} - ${typeLabel}` : host.name;
        if (existingSessions.length > 0) {
          title = typeLabel
            ? `${host.name} - ${typeLabel} (${existingSessions.length + 1})`
            : `${host.name} (${existingSessions.length + 1})`;
        }

        const sessionId = `${host.id}-${type}-${Date.now()}`;
        const newSession: TerminalSession = {
          id: sessionId,
          host,
          title,
          isActive: true,
          createdAt: new Date(),
          type,
        };

        const updatedSessions = prev.map((session) => ({
          ...session,
          isActive: false,
        }));

        setActiveSessionId(sessionId);
        return [...updatedSessions, newSession];
      });

      return "";
    },
    [],
  );

  const removeSession = useCallback(
    (sessionId: string) => {
      setSessions((prev) => {
        const sessionToRemove = prev.find(
          (session) => session.id === sessionId,
        );
        if (!sessionToRemove) return prev;

        const updatedSessions = prev.filter(
          (session) => session.id !== sessionId,
        );

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
              const typeLabel =
                session.type === "stats"
                  ? "Stats"
                  : session.type === "filemanager"
                    ? "Files"
                    : session.type === "tunnel"
                      ? "Tunnels"
                      : "";
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

        if (activeSessionId === sessionId) {
          if (updatedSessions.length > 0) {
            const newActiveSession =
              updatedSessions[updatedSessions.length - 1];
            setActiveSessionId(newActiveSession.id);
            updatedSessions[updatedSessions.length - 1] = {
              ...newActiveSession,
              isActive: true,
            };
          } else {
            setActiveSessionId(null);
          }
        }

        return updatedSessions;
      });
    },
    [activeSessionId],
  );

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

  const navigateToSessions = useCallback(
    (
      host?: SSHHost,
      type: "terminal" | "stats" | "filemanager" | "tunnel" = "terminal",
    ) => {
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
    setIsCustomKeyboardVisible(false);
    keyboardIntentionallyHiddenRef.current = false;
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      clearAllSessions();
    }
  }, [isAuthenticated, clearAllSessions]);

  return (
    <TerminalSessionsContext.Provider
      value={{
        sessions,
        activeSessionId,
        addSession,
        removeSession,
        setActiveSession,
        clearAllSessions,
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
