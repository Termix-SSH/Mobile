import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useRef,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getVersionInfo,
  initializeServerConfig,
  isAuthenticated as checkAuthStatus,
  getLatestGitHubRelease,
  setAuthStateCallback,
  clearServerConfig,
} from "./main-axios";
import Constants from "expo-constants";

interface Server {
  name: string;
  ip: string;
}

interface AppContextType {
  showServerManager: boolean;
  setShowServerManager: (show: boolean) => void;
  showLoginForm: boolean;
  setShowLoginForm: (show: boolean) => void;
  selectedServer: Server | null;
  setSelectedServer: (server: Server | null) => void;
  isAuthenticated: boolean;
  setAuthenticated: (auth: boolean) => void;
  showUpdateScreen: boolean;
  setShowUpdateScreen: (show: boolean) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
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
  const [showServerManager, setShowServerManager] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [isAuthenticated, setAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [showUpdateScreen, setShowUpdateScreen] = useState<boolean>(false);

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

        const version = await getVersionInfo();

        const shouldShowUpdateScreen = await checkShouldShowUpdateScreen();
        setShowUpdateScreen(shouldShowUpdateScreen);

        if (serverConfig || legacyServer) {
          let authStatus = false;

          const jwtToken = await AsyncStorage.getItem("jwt");

          if (jwtToken) {
            try {
              const { getUserInfo } = await import("./main-axios");
              const meRes = await getUserInfo();
              if (meRes && meRes.username) {
                if (meRes.data_unlocked === false) {
                  authStatus = false;
                } else {
                  authStatus = true;
                }
              } else {
              }
            } catch (e) {
              console.error("[AppContext] Auto-login failed:", e);
              authStatus = false;
              await AsyncStorage.removeItem("jwt");
            }
          } else {
          }

          let serverInfo = null;
          if (legacyServer) {
            serverInfo = JSON.parse(legacyServer);
          } else if (serverConfig) {
            const config = JSON.parse(serverConfig);
            serverInfo = {
              name: "Server",
              ip: config.serverUrl,
            };
          }

          if (authStatus) {
            setAuthenticated(true);
            setShowServerManager(false);
            setShowLoginForm(false);
            setSelectedServer(serverInfo);
          } else {
            setAuthenticated(false);
            setShowServerManager(false);
            setShowLoginForm(true);
            setSelectedServer(serverInfo);
          }
        } else {
          setAuthenticated(false);
          setShowServerManager(true);
          setShowLoginForm(false);
        }
      } catch (error) {
        setAuthenticated(false);
        setShowServerManager(true);
        setShowLoginForm(false);
      } finally {
        setIsLoading(false);
      }
    };

    initializeApp();
  }, []);

  useEffect(() => {
    setAuthStateCallback(async (isAuthenticated: boolean) => {
      if (!isAuthenticated) {
        setAuthenticated(false);
        setShowLoginForm(true);
        setShowServerManager(false);
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
          }
        } catch (error) {
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

  return (
    <AppContext.Provider
      value={{
        showServerManager,
        setShowServerManager,
        showLoginForm,
        setShowLoginForm,
        selectedServer,
        setSelectedServer,
        isAuthenticated,
        setAuthenticated,
        showUpdateScreen,
        setShowUpdateScreen,
        isLoading,
        setIsLoading,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
