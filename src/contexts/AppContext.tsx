import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { publishSignedOutSnapshot } from "@/widgets";
import {
  accounts,
  accountLabel,
  isServerAccount,
  useActiveAccount,
  type ServerAccount,
} from "@/core/accounts";
import {
  moveLegacyData,
  moveServerSecretsForBackground,
} from "@/core/db/legacy-move";
import type { AccountClient } from "@/core/api/AccountClient";
import { refreshPluginLists } from "@/core/plugins/refresh";
import { getLatestGitHubRelease, isNewerVersion } from "@/core/updates";
import {
  linkAccount,
  sync,
  SyncError,
  thisDeviceHasData,
  type LinkOutcome,
} from "@/core/sync";
import {
  alreadySetUp,
  markOnboardingDone,
  onboardingDone,
  shouldWelcome,
} from "@/core/onboarding";
import { APP_LOCK_ENABLED_KEY } from "@/contexts/AppLockContext";
import { updateBackgroundSync } from "@/core/sync/background";

interface Server {
  name: string;
  ip: string;
}

/** Steps the auth flow can be opened directly to. */
export type AuthStep = "server" | "login" | "signup" | "oidc";

interface AppContextType {
  /** The active linked server, or null on This device. */
  selectedServer: Server | null;
  /** Signed in to the active linked server. */
  isAuthenticated: boolean;
  setAuthenticated: (auth: boolean) => void;
  showUpdateScreen: boolean;
  setShowUpdateScreen: (show: boolean) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  /** Whether the active account is a linked server (drives empty states). */
  hasServerConfigured: boolean;

  /**
   * Call once the active account has a session: links it for sync. Null
   * when nothing was linked.
   */
  finishSignIn: () => Promise<LinkOutcome | null>;

  /** Account switcher sheet. */
  accountSwitcherVisible: boolean;
  openAccountSwitcher: () => void;
  closeAccountSwitcher: () => void;

  /** The welcome screen of a new install. */
  welcomeVisible: boolean;
  /** Closes the welcome screen for good, then does what was picked. */
  finishWelcome: (choice: "standalone" | "link" | "import") => void;

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

async function checkShouldShowUpdateScreen(): Promise<boolean> {
  try {
    const currentAppVersion = Constants.expoConfig?.version || "1.0.0";
    const latestRelease = await getLatestGitHubRelease();
    if (!latestRelease) return false;
    if (!isNewerVersion(latestRelease.version, currentAppVersion)) return false;
    const dismissedVersion = await AsyncStorage.getItem(
      "dismissedUpdateVersion",
    );
    return dismissedVersion !== latestRelease.version;
  } catch {
    return false;
  }
}

const RECHECK_MS = 24 * 60 * 60 * 1000;

/**
 * Signed in servers that never linked for sync (signed in before 2.0) link
 * now, which also swaps their login for a long lived device session.
 */
async function upgradeLogins(): Promise<void> {
  for (const account of accounts.list()) {
    if (!isServerAccount(account) || account.status === "signed_out") continue;
    if (!accounts.client(account.id)?.isAuthenticated()) continue;
    const { sync: linked, syncCheckedAt } = account.options;
    if (linked === true) continue;
    const checked = Date.parse(String(syncCheckedAt ?? ""));
    if (linked === false && Number.isFinite(checked)) {
      if (Date.now() - checked < RECHECK_MS) continue;
    }
    try {
      await linkAccount(account.id);
    } catch {
      // Tried again on the next start.
    }
  }
  void updateBackgroundSync();
}

/** Asks the server who we are. False means the saved session is gone. */
async function validateSession(
  account: ServerAccount,
  client: AccountClient,
): Promise<boolean> {
  if (!client.isAuthenticated()) return false;
  const token = client.token();
  try {
    const me = await client.api.auth.getUserInfo();
    if (!me?.username) return false;
    await accounts.update(account.id, {
      username: me.username,
      remoteUserId: me.userId ?? account.remoteUserId,
      isAdmin: !!me.is_admin,
      status: "idle",
      lastError: null,
    });
    return true;
  } catch (e) {
    // The proxy in front of the server answered, not Termix: the session is
    // still good, the proxy wants its own sign in.
    if ((e as { code?: string })?.code === "PROXY_LOGIN") {
      await accounts.update(account.id, {
        status: "error",
        lastError: "proxy_login",
      });
      return true;
    }
    // Linking for sync may have swapped the token while this ran.
    if (getErrorStatus(e) === 401 && client.token() !== token) return true;
    if (getErrorStatus(e) === 401) {
      await client.clearToken();
      await accounts.update(account.id, { status: "signed_out" });
      return false;
    }
    // Offline is not signed out; keep the session.
    await accounts.update(account.id, { status: "offline" });
    return true;
  }
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const active = useActiveAccount();
  const [isAuthenticated, setAuthenticatedState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showUpdateScreen, setShowUpdateScreen] = useState<boolean>(false);

  const [authFlowVisible, setAuthFlowVisible] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [accountSwitcherVisible, setAccountSwitcherVisible] = useState(false);
  const openAccountSwitcher = useCallback(
    () => setAccountSwitcherVisible(true),
    [],
  );
  const closeAccountSwitcher = useCallback(
    () => setAccountSwitcherVisible(false),
    [],
  );
  const [authFlowInitialStep, setAuthFlowInitialStep] =
    useState<AuthStep>("server");

  const openAuthFlow = useCallback((step: AuthStep = "server") => {
    setAuthFlowInitialStep(step);
    setAuthFlowVisible(true);
  }, []);

  const closeAuthFlow = useCallback(() => {
    setAuthFlowVisible(false);
  }, []);

  const setAuthenticated = useCallback((auth: boolean) => {
    setAuthenticatedState(auth);
    const current = accounts.active();
    if (!auth && isServerAccount(current)) {
      void accounts.update(current.id, { status: "signed_out" });
    }
  }, []);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        setIsLoading(true);
        await accounts.init();
        const accountIds = accounts.list().map((a) => a.id);
        await moveLegacyData({ accountIds }).catch(() => {});
        await moveServerSecretsForBackground({ accountIds }).catch(() => {});
        sync.start();
        void updateBackgroundSync();

        // Network checks run after the first screen shows.
        void checkShouldShowUpdateScreen().then(setShowUpdateScreen);

        const current = accounts.active();
        const client = accounts.activeClient();
        if (isServerAccount(current) && client) {
          // Trust the saved session until the server answers. A configured
          // but signed out server lands on the empty state shell; the user
          // opens the auth flow themselves.
          setAuthenticatedState(
            client.isAuthenticated() && current.status !== "signed_out",
          );
          void validateSession(current, client)
            .then(setAuthenticatedState)
            .catch(() => {})
            // After the check, so its request never races the token swap.
            .finally(() => void upgradeLogins());
        } else {
          void upgradeLogins();
        }
        // A brand new install gets the welcome screen, once.
        const [done, hasLocalData, lockFlag] = await Promise.all([
          onboardingDone(),
          thisDeviceHasData(),
          AsyncStorage.getItem(APP_LOCK_ENABLED_KEY),
        ]);
        const state = {
          done,
          hasServers: accounts.list().length > 1,
          hasLocalData,
          appLockOn: lockFlag === "true",
        };
        if (shouldWelcome(state)) setWelcomeVisible(true);
        else if (alreadySetUp(state)) void markOnboardingDone();
      } catch {
        setAuthenticatedState(false);
      } finally {
        setIsLoading(false);
      }
    };

    initializeApp();
  }, []);

  const finishWelcome = useCallback(
    (choice: "standalone" | "link" | "import") => {
      void markOnboardingDone();
      setWelcomeVisible(false);
      if (choice === "link") openAuthFlow("server");
    },
    [openAuthFlow],
  );

  // Switching accounts re-checks the new one. Open sessions keep running.
  const firstActive = useRef(true);
  useEffect(() => {
    if (firstActive.current) {
      firstActive.current = false;
      return;
    }
    let cancelled = false;
    const client = accounts.client(active.id);
    if (!isServerAccount(active) || !client) {
      setAuthenticatedState(false);
      return;
    }
    void (async () => {
      await client.load();
      const ok = await validateSession(active, client);
      if (!cancelled) setAuthenticatedState(ok);
    })();
    return () => {
      cancelled = true;
    };
    // Only when the account itself changes, not its status fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.id]);

  // A 401 on a critical endpoint signs the active account out.
  useEffect(() => {
    const client = accounts.client(active.id);
    if (!client) return;
    return client.onAuthLost(() => {
      void accounts.update(active.id, { status: "signed_out" });
      if (accounts.active().id === active.id) setAuthenticatedState(false);
    });
  }, [active.id]);

  // 2.9+ servers: the plugin list needs a signed in user, so load it once
  // auth is known.
  useEffect(() => {
    if (isAuthenticated) void accounts.activeClient()?.refreshServerApi();
  }, [isAuthenticated, active.id]);

  // Losing authentication (sign-out elsewhere, expired token, server change)
  // must also empty the home-screen widgets - they would otherwise keep showing
  // host names the user can no longer reach. This device has no sign in, so
  // its widgets stay filled.
  useEffect(() => {
    if (isLoading || isAuthenticated || active.kind !== "server") return;
    void publishSignedOutSnapshot();
  }, [isAuthenticated, isLoading, active.kind]);

  const lastValidationTimeRef = useRef<number>(0);
  const validationInProgressRef = useRef<boolean>(false);

  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (
        nextAppState !== "active" ||
        !isAuthenticated ||
        validationInProgressRef.current
      ) {
        return;
      }
      const now = Date.now();
      if (now - lastValidationTimeRef.current < 2000) return;

      validationInProgressRef.current = true;
      lastValidationTimeRef.current = now;

      // Other linked servers' tabs and screens follow their plugins too.
      void refreshPluginLists(accounts.active().id).catch(() => {});

      try {
        const client = accounts.activeClient();
        const userInfo = await client?.api.auth.getUserInfo();
        if (!userInfo?.username) {
          setAuthenticated(false);
        } else {
          // Plugins may have been turned on or off while we were away.
          void client?.refreshEnabledPlugins();
        }
      } catch {
        // Network blips shouldn't log the user out; the 401 handler covers
        // genuine auth failures.
      } finally {
        validationInProgressRef.current = false;
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [isAuthenticated, setAuthenticated]);

  const finishSignIn = useCallback(async (): Promise<LinkOutcome | null> => {
    const current = accounts.active();
    const client = accounts.activeClient();
    if (!isServerAccount(current) || !client) {
      setAuthenticatedState(true);
      return null;
    }
    await validateSession(current, client);
    try {
      // The login becomes a long lived device session, so no repeated OTP.
      const outcome = await linkAccount(current.id);
      setAuthenticatedState(true);
      void updateBackgroundSync();
      return outcome;
    } catch (error) {
      setAuthenticatedState(
        !(error instanceof SyncError && error.kind === "different_account"),
      );
      throw error;
    }
  }, []);

  const serverName = isServerAccount(active) ? accountLabel(active) : null;
  const serverUrl = isServerAccount(active) ? active.serverUrl : null;
  const selectedServer = useMemo<Server | null>(
    () =>
      serverName !== null && serverUrl !== null
        ? { name: serverName, ip: serverUrl }
        : null,
    [serverName, serverUrl],
  );

  // Every screen reads this; a new object each render re-rendered all of them.
  const value = useMemo(
    () => ({
      selectedServer,
      isAuthenticated,
      setAuthenticated,
      showUpdateScreen,
      setShowUpdateScreen,
      isLoading,
      setIsLoading,
      hasServerConfigured: isServerAccount(active),
      finishSignIn,
      accountSwitcherVisible,
      openAccountSwitcher,
      closeAccountSwitcher,
      welcomeVisible,
      finishWelcome,
      authFlowVisible,
      authFlowInitialStep,
      openAuthFlow,
      closeAuthFlow,
    }),
    [
      selectedServer,
      isAuthenticated,
      setAuthenticated,
      showUpdateScreen,
      isLoading,
      active,
      finishSignIn,
      accountSwitcherVisible,
      openAccountSwitcher,
      closeAccountSwitcher,
      welcomeVisible,
      finishWelcome,
      authFlowVisible,
      authFlowInitialStep,
      openAuthFlow,
      closeAuthFlow,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
