import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Server, X } from "lucide-react-native";
import { InlineView, Text } from "@/ui";
import { useConfirm } from "@/ui/Confirm";
import {
  biometricName,
  markOffered,
  saveLogin,
  shouldOfferSave,
  type SavedLogin,
} from "@/core/accounts/saved-login";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useAppContext } from "@/contexts/AppContext";
import { accounts, accountLabel } from "@/core/accounts";
import type { AccountClient } from "@/core/api/AccountClient";
import { checkServerAddress } from "@/core/accounts/link/address";
import type {
  LoginResult,
  SecondFactorStep as Factor,
} from "@/core/accounts/link/login";
import {
  readSignIn,
  type ServerSignIn,
  type SignInOption,
} from "@/core/accounts/link/methods";
import {
  sync,
  SyncError,
  thisDeviceCounts,
  type OwnDataCounts,
} from "@/core/sync";
import { toast } from "@/utils/toast";
import { ProxySettings } from "@/screens/accounts/ProxySettings";
import { ResetStep, SignupStep } from "./AccountSteps";
import { BrowserStep, type BrowserMode } from "./BrowserStep";
import { SignInStep } from "./SignInStep";
import { AddressStep, MergeStep, SecondFactorStep } from "./SmallSteps";

type Step =
  | "address"
  | "checking"
  | "signin"
  | "signup"
  | "reset"
  | "factor"
  | "browser"
  | "merge";

const TITLES: Record<Step, string> = {
  address: "Link a server",
  checking: "Checking the server",
  signin: "Sign in",
  signup: "Make an account",
  reset: "Reset password",
  factor: "One more step",
  browser: "Sign in",
  merge: "Almost done",
};

/**
 * Links a Termix server: the address, then any sign in the server offers,
 * then Merge or Replace on the first link. Opened as an overlay from
 * anywhere through openAuthFlow.
 */
export default function LinkFlow() {
  const { authFlowInitialStep, closeAuthFlow, finishSignIn } = useAppContext();
  const insets = useSafeAreaInsets();
  const color = useThemeColor();

  // Signing in again to a server already in the list starts on its client.
  const [client, setClient] = useState<AccountClient | null>(() =>
    authFlowInitialStep === "server" ? null : accounts.activeClient(),
  );
  const [step, setStep] = useState<Step>(() =>
    authFlowInitialStep === "server" || !accounts.activeClient()
      ? "address"
      : authFlowInitialStep === "oidc"
        ? "browser"
        : "checking",
  );
  const [address, setAddress] = useState(client?.serverUrl ?? "");
  const [addressError, setAddressError] = useState<string | null>(null);
  const [signIn, setSignIn] = useState<ServerSignIn | null>(null);
  const [factor, setFactor] = useState<Factor | null>(null);
  const [browserMode, setBrowserMode] = useState<BrowserMode>({
    kind: "browser",
  });
  const [proxyOpen, setProxyOpen] = useState(false);
  const [counts, setCounts] = useState<OwnDataCounts | null>(null);
  // A new server stays pending until it signs in, and is dropped on cancel.
  const pendingId = useRef<string | null>(null);
  const linkedId = useRef<string | null>(null);
  const passwordLogin = useRef<SavedLogin | null>(null);
  const confirm = useConfirm();

  const host = (client?.serverUrl ?? address).replace(/^https?:\/\//, "");

  const close = useCallback(async () => {
    const pending = pendingId.current;
    pendingId.current = null;
    if (pending && pending !== linkedId.current) {
      await accounts.discardPending(pending).catch(() => {});
    }
    closeAuthFlow();
  }, [closeAuthFlow]);

  /** The client for an address: its account if linked, else a pending one. */
  const prepare = useCallback(
    async (url: string): Promise<AccountClient> => {
      if (client && client.serverUrl === url) return client;
      const existing = accounts.findByUrl(url);
      const account =
        existing ??
        accounts.findPending(url) ??
        (await accounts.add(url, { pending: true }));
      const previous = pendingId.current;
      if (previous && previous !== account.id) {
        await accounts.discardPending(previous).catch(() => {});
      }
      pendingId.current = existing ? null : account.id;
      const next = accounts.client(account.id)!;
      await next.load();
      await next.refreshServerApi().catch(() => {});
      setClient(next);
      return next;
    },
    [client],
  );

  const check = useCallback(async (target: AccountClient) => {
    setStep("checking");
    const found = await readSignIn(target);
    setSignIn(found);
    if (!found.reachable) {
      setAddressError(
        "Could not reach that server. Check the address, or set up the proxy or client certificate.",
      );
      setStep("address");
      return;
    }
    if (found.proxyGate) {
      setBrowserMode({ kind: "proxy" });
      setStep("browser");
      return;
    }
    setStep(found.setupRequired ? "signup" : "signin");
  }, []);

  // Opened to sign in again: read the server first.
  useEffect(() => {
    if (step === "checking" && client && !signIn) void check(client);
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onContinue = async () => {
    const parsed = checkServerAddress(address);
    if (!parsed.ok) {
      setAddressError(parsed.message);
      return;
    }
    setAddressError(null);
    setAddress(parsed.url);
    try {
      await check(await prepare(parsed.url));
    } catch (e: any) {
      setAddressError(e?.message || "Could not reach that server");
      setStep("address");
    }
  };

  const openProxy = async () => {
    const parsed = checkServerAddress(address);
    if (!parsed.ok) {
      setAddressError(parsed.message);
      return;
    }
    setAddress(parsed.url);
    await prepare(parsed.url);
    setProxyOpen(true);
  };

  // After a full sign in with a password, offer to keep it behind biometrics.
  const offerSave = useCallback(
    async (target: AccountClient) => {
      const login = passwordLogin.current;
      passwordLogin.current = null;
      if (!login || !(await shouldOfferSave(target).catch(() => false))) return;
      await markOffered(target);
      const name = await biometricName();
      const yes = await confirm({
        title: `Use ${name} to sign in next time?`,
        description: `If this server signs you out, sign in again with ${name} instead of typing your password. The password stays on this phone.`,
        confirmLabel: `Use ${name}`,
        cancelLabel: "Not now",
        destructive: false,
      });
      if (!yes) return;
      try {
        await saveLogin(target, login);
      } catch {
        toast.error("Could not save the login");
      }
    },
    [confirm],
  );

  const signedIn = useCallback(async () => {
    if (!client) return;
    const id = client.accountId;
    linkedId.current = id;
    await accounts.confirm(id);
    pendingId.current = null;
    await accounts.setActive(id);
    let outcome = null;
    try {
      outcome = await finishSignIn();
    } catch (e) {
      if (e instanceof SyncError && e.kind === "different_account") {
        toast.error("That's a different user", e.message);
        setStep("signin");
        return;
      }
      toast.warning(
        "Signed in",
        "Sync could not start yet. It tries again on its own.",
      );
    }
    if (outcome?.synced) {
      const found = outcome.firstLink ? await thisDeviceCounts() : null;
      const any =
        found && found.hosts + found.logins + found.snippets + found.folders;
      if (any) {
        setCounts(found);
        setStep("merge");
        return;
      }
      void sync.firstSync(id, false);
    }
    closeAuthFlow();
    void offerSave(client);
  }, [client, closeAuthFlow, finishSignIn, offerSave]);

  const onResult = (result: LoginResult, login?: SavedLogin) => {
    if (login) passwordLogin.current = login;
    if (result.kind === "secondFactor") {
      setFactor(result.step);
      setStep("factor");
    } else {
      void signedIn();
    }
  };

  const openBrowser = (mode: BrowserMode) => {
    setBrowserMode(mode);
    setStep("browser");
  };

  const back = () => {
    if (step === "signup" && signIn && !signIn.setupRequired) setStep("signin");
    else if (step === "reset" || step === "factor") setStep("signin");
    else if (
      step === "browser" &&
      signIn &&
      !signIn.proxyGate &&
      signIn.options.length
    )
      setStep("signin");
    else setStep("address");
  };

  const chooseMerge = (merge: boolean) => {
    if (linkedId.current) void sync.firstSync(linkedId.current, merge);
    closeAuthFlow();
    if (client) void offerSave(client);
  };

  const serverName = client
    ? accountLabel(accounts.find(client.accountId) ?? accounts.active())
    : host;

  if (step === "browser" && client) {
    return (
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <BrowserStep
          client={client}
          mode={browserMode}
          onBack={back}
          onSignedIn={() => void signedIn()}
          onSecondFactor={(next) => {
            setFactor(next);
            setStep("factor");
          }}
        />
      </View>
    );
  }

  const canGoBack =
    step !== "address" && step !== "merge" && step !== "checking";
  return (
    <View className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1"
        // Edge to edge Android no longer resizes for the keyboard.
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View
          className="flex-row items-center border-b border-border px-1.5"
          style={{ paddingTop: insets.top }}
        >
          {canGoBack ? (
            <Pressable
              onPress={back}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Back"
              className="h-11 flex-row items-center gap-1.5 px-2 active:bg-muted"
            >
              <ArrowLeft size={20} color={color("foreground")} />
            </Pressable>
          ) : (
            <View className="w-11" />
          )}
          <View className="min-w-0 flex-1 py-2">
            <Text weight="bold" className="text-sm text-foreground">
              {TITLES[step]}
            </Text>
            {host && step !== "address" ? (
              <Text
                className="text-meta text-muted-foreground"
                numberOfLines={1}
              >
                {host}
              </Text>
            ) : null}
          </View>
          {step !== "merge" ? (
            <Pressable
              onPress={() => void close()}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="h-11 w-11 items-center justify-center active:bg-muted"
            >
              <X size={20} color={color("muted-foreground")} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: "center",
            padding: 20,
            paddingBottom: insets.bottom + 20,
            gap: 16,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
        >
          {step === "address" ? (
            <>
              <View className="w-full max-w-md gap-1 pt-2">
                <View className="mb-2 h-12 w-12 items-center justify-center border border-accent-brand/40 bg-accent-brand/10">
                  <Server size={24} color={color("accent-brand")} />
                </View>
                <Text weight="bold" className="text-lg text-foreground">
                  Link your Termix server
                </Text>
                <Text className="text-sm leading-5 text-muted-foreground">
                  Your hosts, credentials, snippets and settings sync with it,
                  and you get its plugins. Everything keeps working on this
                  phone when the server is away.
                </Text>
              </View>
              <AddressStep
                address={address}
                onAddress={(v) => {
                  setAddress(v);
                  setAddressError(null);
                }}
                busy={false}
                error={addressError}
                onContinue={() => void onContinue()}
                onProxy={() => void openProxy()}
              />
            </>
          ) : null}

          {step === "checking" ? (
            <View className="flex-1 items-center justify-center gap-3">
              <ActivityIndicator size="large" color={color("accent-brand")} />
              <Text className="text-sm text-muted-foreground">
                Checking {host}...
              </Text>
            </View>
          ) : null}

          {step === "signin" && client && signIn ? (
            <SignInStep
              client={client}
              signIn={signIn}
              onResult={onResult}
              onRedirect={(
                option: Extract<SignInOption, { kind: "redirect" }>,
              ) => openBrowser({ kind: "redirect", option })}
              onBrowser={() => openBrowser({ kind: "browser" })}
              onSignup={() => setStep("signup")}
              onReset={() => setStep("reset")}
            />
          ) : null}

          {step === "signup" && client ? (
            <SignupStep
              client={client}
              firstUser={!!signIn?.setupRequired}
              onSignedIn={() => void signedIn()}
              onBack={back}
            />
          ) : null}

          {step === "reset" && client ? (
            <ResetStep client={client} onDone={() => setStep("signin")} />
          ) : null}

          {step === "factor" && client && factor ? (
            <SecondFactorStep
              client={client}
              step={factor}
              onResult={onResult}
              onBrowser={() => openBrowser({ kind: "browser" })}
              onBack={() => setStep("signin")}
            />
          ) : null}

          {step === "merge" ? (
            <MergeStep
              counts={counts}
              serverName={serverName}
              onChoose={chooseMerge}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <InlineView
        open={proxyOpen}
        onClose={() => setProxyOpen(false)}
        title="Proxy and client certificate"
        subtitle={host}
      >
        {client ? (
          <View className="p-1">
            <ProxySettings key={client.accountId} client={client} />
          </View>
        ) : null}
      </InlineView>
    </View>
  );
}
