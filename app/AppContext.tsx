import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getVersionInfo,
  initializeServerConfig,
  getLatestGitHubRelease,
  setAuthStateCallback,
  getCurrentServerUrl,
} from "./main-axios";
import Constants from "expo-constants";

interface Server {
  name: string;
  ip: string;
}

/** Steps the auth flow can be opened directly to. */
export type AuthStep = "server" | "login" | "signup";

interface AppContextType {
  selectedServer: Server | null;
  setSelectedServer: (server: Server | null) => void;
  isAuthenticated: boolean;
  setAuthenticated: (auth: boolean) => void;
  showUpdateScreen: boolean;
  setShowUpdateScreen: (show: boolean) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  /** Whether a server URL is currently configured (drives empty states). */
  hasServerConfigured: boolean;
  setHasServerConfigured: (has: boolean) => void;

  /** Auth flow overlay control. */
  authFlowVisible: boolean;
  authFlowInitialStep: AuthStep;
  openAuthFlow: (step?: AuthStep) => void;
  closeAuthFlow: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
};

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [isAuthenticated, setAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showUpdateScreen, setShowUpdateScreen] = useState<boolean>(false);
  const [hasServerConfigured, setHasServerConfigured] = useState(false);

  const [authFlowVisible, setAuthFlowVisible] = useState(false);
  const [authFlowInitialStep, setAuthFlowInitialStep] =
    useState<AuthStep>("server");

  const openAuthFlow = useCallback((step: AuthStep = "server") => {
    setAuthFlowInitialStep(step);
    setAuthFlowVisible(true);
  }, []);

  const closeAuthFlow = useCallback(() => {
    setAuthFlowVisible(false);
  }, []);

  const checkShouldShowUpdateScreen = async (): Promise<boolean> => {
    try {
      const currentAppVersion = Constants.expoConfig?.version || "1.0.0";

      const latestRelease = await getLatestGitHubRelease();

      if (!latestRelease) {
        return false;
      }

      if (currentAppVersion === latestRelease.version) {
        return false;
      }

      const dismissedVersion = await AsyncStorage.getItem(
        "dismissedUpdateVersion",
      );

      if (dismissedVersion === latestRelease.version) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  };

  useEffect(() => {
    const initializeApp = async () => {
      try {
        setIsLoading(true);

        await initializeServerConfig();

        const serverConfig = await AsyncStorage.getItem("serverConfig");
        const legacyServer = await AsyncStorage.getItem("server");

        await getVersionInfo();

        const shouldShowUpdateScreen = await checkShouldShowUpdateScreen();
        setShowUpdateScreen(shouldShowUpdateScreen);

        const serverConfigured = !!(serverConfig || legacyServer);
        setHasServerConfigured(serverConfigured);

        if (serverConfigured) {
          let authStatus = false;

          const jwtToken = await AsyncStorage.getItem("jwt");

          if (jwtToken) {
            try {
              const { getUserInfo } = await import("./main-axios");
              const meRes = await getUserInfo();
              if (meRes && meRes.username && meRes.data_unlocked === true) {
                authStatus = true;
              }
            } catch (e) {
              console.error("[AppContext] Auto-login failed:", e);
              authStatus = false;
              await AsyncStorage.removeItem("jwt");
            }
          }

          let serverInfo: Server | null = null;
          if (legacyServer) {
            serverInfo = JSON.parse(legacyServer);
          } else if (serverConfig) {
            const config = JSON.parse(serverConfig);
            serverInfo = { name: "Server", ip: config.serverUrl };
          }
          setSelectedServer(serverInfo);

          setAuthenticated(authStatus);
          // A configured-but-unauthenticated server lands the user on the
          // empty-state shell; they re-open the auth flow themselves.
        } else {
          // Brand-new install: guide the user, but the flow is dismissible.
          setAuthenticated(false);
          openAuthFlow("server");
        }
      } catch (error) {
        setAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    initializeApp();
  }, [openAuthFlow]);

  useEffect(() => {
    setAuthStateCallback((authed: boolean) => {
      if (!authed) {
        // Token expired / 401: drop to the empty-state shell. Tabs render
        // their "no server connected" prompt; the user re-authenticates.
        setAuthenticated(false);
      }
    });
  }, []);

  const lastValidationTimeRef = useRef<number>(0);
  const validationInProgressRef = useRef<boolean>(false);

  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (
        nextAppState === "active" &&
        isAuthenticated &&
        !validationInProgressRef.current
      ) {
        const now = Date.now();
        const timeSinceLastValidation = now - lastValidationTimeRef.current;

        if (timeSinceLastValidation < 2000) {
          return;
        }

        validationInProgressRef.current = true;
        lastValidationTimeRef.current = now;

        try {
          const { getUserInfo } = await import("./main-axios");
          const userInfo = await getUserInfo();

          if (
            !userInfo ||
            !userInfo.username ||
            userInfo.data_unlocked === false
          ) {
            setAuthenticated(false);
          }
        } catch (error) {
          // Network blips shouldn't log the user out; the 401 callback handles
          // genuine auth failures.
        } finally {
          validationInProgressRef.current = false;
        }
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated]);

  // Keep hasServerConfigured in sync whenever the auth flow closes (the user
  // may have just added or changed a server inside it).
  useEffect(() => {
    if (!authFlowVisible) {
      setHasServerConfigured(!!getCurrentServerUrl());
    }
  }, [authFlowVisible]);

  return (
    <AppContext.Provider
      value={{
        selectedServer,
        setSelectedServer,
        isAuthenticated,
        setAuthenticated,
        showUpdateScreen,
        setShowUpdateScreen,
        isLoading,
        setIsLoading,
        hasServerConfigured,
        setHasServerConfigured,
        authFlowVisible,
        authFlowInitialStep,
        openAuthFlow,
        closeAuthFlow,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
