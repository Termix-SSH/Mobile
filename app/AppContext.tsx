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
  applyServerTransportMode,
  getLatestGitHubRelease,
  setAuthStateCallback,
  getCurrentServerUrl,
  getDisplayServerUrl,
} from "./main-axios";
import {
  isTailscaleConfigured,
  getLiveTransportUrl,
} from "./utils/tailscaleConnect";
import {
  NetworkModeDialog,
  type NetworkModeChoice,
} from "./components/NetworkModeDialog";
import Constants from "expo-constants";
import { publishSignedOutSnapshot } from "@/app/widgets";

interface Server {
  name: string;
  ip: string;
}

function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = latest.split(".").map(Number);
  const currentParts = current.split(".").map(Number);

  if (
    latestParts.length !== 3 ||
    currentParts.length !== 3 ||
    [...latestParts, ...currentParts].some(Number.isNaN)
  ) {
    return false;
  }

  for (let index = 0; index < latestParts.length; index += 1) {
    if (latestParts[index] !== currentParts[index]) {
      return latestParts[index] > currentParts[index];
    }
  }

  return false;
}

/** Steps the auth flow can be opened directly to. */
export type AuthStep = "server" | "login" | "signup" | "oidc";

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

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;

  if ("status" in error && typeof error.status === "number") {
    return error.status;
  }

  if (
    "response" in error &&
    error.response &&
    typeof error.response === "object"
  ) {
    const response = error.response as { status?: unknown };
    return typeof response.status === "number" ? response.status : undefined;
  }

  return undefined;
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
  const [networkModeVisible, setNetworkModeVisible] = useState(false);
  const [networkModeBusy, setNetworkModeBusy] = useState(false);
  const [networkModeError, setNetworkModeError] = useState<string | null>(null);
  const [networkModeServerLabel, setNetworkModeServerLabel] = useState("");
  const networkModeResolverRef = useRef<
    ((choice: NetworkModeChoice | null) => void) | null
  >(null);
  const networkModeBusyRef = useRef(false);

  const openAuthFlow = useCallback((step: AuthStep = "server") => {
    setAuthFlowInitialStep(step);
    setAuthFlowVisible(true);
  }, []);

  const closeAuthFlow = useCallback(() => {
    setAuthFlowVisible(false);
  }, []);

  const promptNetworkMode = useCallback(
    (serverLabel: string): Promise<NetworkModeChoice | null> => {
      // Resolve a superseded prompt before replacing its resolver. This keeps a
      // restarted provider from leaving the previous startup caller pending.
      networkModeResolverRef.current?.(null);
      networkModeResolverRef.current = null;
      networkModeBusyRef.current = false;
      setNetworkModeServerLabel(serverLabel);
      setNetworkModeError(null);
      setNetworkModeBusy(false);
      setNetworkModeVisible(true);
      return new Promise((resolve) => {
        networkModeResolverRef.current = resolve;
      });
    },
    [],
  );

  const handleNetworkModeChoice = useCallback(
    async (choice: NetworkModeChoice) => {
      if (networkModeBusyRef.current) return;
      networkModeBusyRef.current = true;
      setNetworkModeBusy(true);
      setNetworkModeError(null);
      try {
        const ok = await applyServerTransportMode(choice);
        if (!ok) {
          setNetworkModeError(
            choice === "tailscale"
              ? "Could not start Tailscale for this server. Check the auth key, ACLs, and subnet routes, or choose Direct / LAN to try the saved address."
              : "Could not connect directly to the saved server. Choose Via Tailscale to try the userspace connection instead.",
          );
          return;
        }

        networkModeResolverRef.current?.(choice);
        networkModeResolverRef.current = null;
        setNetworkModeVisible(false);
      } catch {
        setNetworkModeError(
          choice === "tailscale"
            ? "Could not start Tailscale for this server. Check the auth key, ACLs, and subnet routes, or choose Direct / LAN to try the saved address."
            : "Could not connect directly to the saved server. Choose Via Tailscale to try the userspace connection instead.",
        );
      } finally {
        networkModeBusyRef.current = false;
        setNetworkModeBusy(false);
      }
    },
    [],
  );

  const handleNetworkModeDismiss = useCallback(() => {
    // Dismiss = prefer direct for this session, unless another choice is still
    // being applied.
    if (networkModeBusyRef.current) return;
    void handleNetworkModeChoice("direct");
  }, [handleNetworkModeChoice]);

  useEffect(() => {
    return () => {
      // Do not leave startup awaiting a chooser that can no longer resolve after
      // the provider unmounts (for example, during a native root reset).
      networkModeResolverRef.current?.(null);
      networkModeResolverRef.current = null;
      networkModeBusyRef.current = false;
    };
  }, []);

  const checkShouldShowUpdateScreen = async (): Promise<boolean> => {
    try {
      const currentAppVersion = Constants.expoConfig?.version || "1.0.0";

      const latestRelease = await getLatestGitHubRelease();

      if (!latestRelease) {
        return false;
      }

      if (!isNewerVersion(latestRelease.version, currentAppVersion)) {
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

        // Load config WITHOUT network probes (stored LAN URL is unreachable on
        // cellular) and WITHOUT auto-joining Tailscale — we prompt first.
        await initializeServerConfig({
          rehydrateTailscale: false,
          detect: false,
        });

        const serverConfig = await AsyncStorage.getItem("serverConfig");
        const legacyServer = await AsyncStorage.getItem("server");

        const serverConfigured = !!(serverConfig || legacyServer);
        setHasServerConfigured(serverConfigured);

        if (serverConfigured) {
          let displayUrl = getDisplayServerUrl() || getCurrentServerUrl();
          if (!displayUrl && serverConfig) {
            try {
              const parsed = JSON.parse(serverConfig) as {
                displayUrl?: string;
                serverUrl?: string;
              };
              displayUrl = parsed.displayUrl || parsed.serverUrl || null;
            } catch {
              displayUrl = null;
            }
          }

          // If a Tailscale auth key is saved and no live forward exists, ask
          // whether this session should use Tailscale or direct/LAN.
          // This MUST happen before any network calls (getVersionInfo etc.) so
          // cellular users are not blocked by a 30s timeout to an unreachable LAN IP.
          const tsConfigured = await isTailscaleConfigured();
          const live =
            displayUrl && tsConfigured
              ? await getLiveTransportUrl(displayUrl)
              : null;
          if (tsConfigured && displayUrl && !live) {
            await promptNetworkMode(displayUrl);
            // Choice handler already applied transport mode + re-detected. Keep
            // the app loading until the choice resolves so Hosts cannot issue a
            // request against the saved direct URL in the meantime.
          }

          // Best-effort version + update check. Runs after the chooser and never
          // blocks boot: on cellular the LAN /version request would throw, and the
          // GitHub check needs a hard timeout to avoid a multi-minute hang.
          try {
            const [versionRes, shouldShowUpdate] = await Promise.all([
              getVersionInfo().catch(() => null),
              checkShouldShowUpdateScreen(),
            ]);
            void versionRes;
            if (shouldShowUpdate) setShowUpdateScreen(true);
          } catch {
            // never block boot on update checks
          }

          let authStatus = false;

          const jwtToken = await AsyncStorage.getItem("jwt");

          if (jwtToken) {
            authStatus = true;
            try {
              const { getUserInfo } = await import("./main-axios");
              const meRes = await getUserInfo();
              authStatus = !!meRes?.username;
            } catch (e) {
              console.error("[AppContext] Auto-login failed:", e);
              if (getErrorStatus(e) === 401) {
                authStatus = false;
                await AsyncStorage.removeItem("jwt");
              }
            }
          }

          let serverInfo: Server | null = null;
          if (legacyServer) {
            serverInfo = JSON.parse(legacyServer);
          } else {
            serverInfo = {
              name: "Server",
              ip: getDisplayServerUrl() || getCurrentServerUrl() || "Server",
            };
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
  }, [openAuthFlow, promptNetworkMode]);

  useEffect(() => {
    setAuthStateCallback((authed: boolean) => {
      if (!authed) {
        // Token expired / 401: drop to the empty-state shell. Tabs render
        // their "no server connected" prompt; the user re-authenticates.
        setAuthenticated(false);
      }
    });
  }, []);

  // Losing authentication (sign-out elsewhere, expired token, server change)
  // must also empty the home-screen widgets — they would otherwise keep showing
  // host names the user can no longer reach.
  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    void publishSignedOutSnapshot();
  }, [isAuthenticated, isLoading]);

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

          if (!userInfo?.username) {
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
      <NetworkModeDialog
        visible={networkModeVisible}
        busy={networkModeBusy}
        error={networkModeError ?? undefined}
        serverLabel={networkModeServerLabel}
        onChoose={(mode) => {
          void handleNetworkModeChoice(mode);
        }}
        onDismiss={handleNetworkModeDismiss}
      />
    </AppContext.Provider>
  );
};
