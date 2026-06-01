import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ExpoLinking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import {
  Server,
  ShieldAlert,
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  User as UserIcon,
  RefreshCw,
  Globe,
  X,
} from "lucide-react-native";
import { WebView, WebViewNavigation } from "react-native-webview";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text, Input, Button, Label } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { toast } from "@/app/utils/toast";
import { useAppContext } from "../AppContext";
import {
  saveServerConfig,
  getCurrentServerUrl,
  initializeServerConfig,
  setCookie,
  getUserInfo,
  loginUser,
  registerUser,
  verifyTOTPLogin,
  initiatePasswordReset,
  verifyPasswordResetCode,
  completePasswordReset,
  getSetupRequired,
  getRegistrationAllowed,
  getPasswordLoginAllowed,
  getOIDCConfig,
  getOIDCAuthorizeUrl,
  isReverseProxyAuthGate,
} from "../main-axios";

type Step = "server" | "login" | "totp" | "signup" | "reset" | "oidc";

/** Server capabilities probed after the server URL is set. */
interface ServerCaps {
  setupRequired: boolean;
  passwordLoginAllowed: boolean;
  registrationAllowed: boolean;
  oidcAvailable: boolean;
}

function errMessage(e: any, fallback: string): string {
  return e?.response?.data?.error || e?.message || fallback;
}

export default function AuthFlow() {
  const {
    authFlowInitialStep,
    closeAuthFlow,
    setAuthenticated,
    setSelectedServer,
  } = useAppContext();
  const insets = useSafeAreaInsets();
  const color = useThemeColor();
  const bg = color("background") ?? "#0c0d0b";
  const accent = color("accent-brand") ?? "#f59145";
  const muted = color("muted-foreground");

  const [step, setStep] = useState<Step>(authFlowInitialStep as Step);
  const [serverUrl, setServerUrl] = useState("");
  const [caps, setCaps] = useState<ServerCaps | null>(null);
  const [busy, setBusy] = useState(false);
  // Carries the TOTP temp token between the login and totp steps.
  const totpTempTokenRef = useRef<string>("");

  // Hostname shown in the shared header.
  const activeHost = (getCurrentServerUrl() ?? serverUrl).replace(
    /^https?:\/\//,
    "",
  );

  useEffect(() => {
    const current = getCurrentServerUrl();
    if (current) setServerUrl(current);
  }, []);

  const finishAuthenticated = useCallback(async () => {
    try {
      await initializeServerConfig();
    } catch {}
    const url = getCurrentServerUrl();
    if (url) setSelectedServer({ name: "Server", ip: url });
    setAuthenticated(true);
    closeAuthFlow();
  }, [closeAuthFlow, setAuthenticated, setSelectedServer]);

  // ── Step: server ────────────────────────────────────────────────────────

  /**
   * Probes the currently-configured server to decide which sign-in affordances
   * to show, then advances to the appropriate step. Returns false on failure
   * (server unreachable) so callers can react.
   */
  const probeServer = useCallback(async (): Promise<boolean> => {
    // If the server sits behind a reverse-proxy auth gate (Cloudflare Access,
    // Authelia, …), API endpoints return the proxy's HTML login page rather
    // than JSON — a native form can't work. Send the user to the browser-based
    // external sign-in instead.
    if (await isReverseProxyAuthGate()) {
      setCaps({
        setupRequired: false,
        passwordLoginAllowed: false,
        registrationAllowed: false,
        oidcAvailable: false,
      });
      setStep("oidc");
      return true;
    }

    const [setupRes, pwRes, regRes, oidcRes] = await Promise.allSettled([
      getSetupRequired(),
      getPasswordLoginAllowed(),
      getRegistrationAllowed(),
      getOIDCConfig(),
    ]);

    // If every probe failed, the server is unreachable — surface that rather
    // than rendering an empty login form.
    if (
      setupRes.status === "rejected" &&
      pwRes.status === "rejected" &&
      regRes.status === "rejected" &&
      oidcRes.status === "rejected"
    ) {
      return false;
    }

    const setupRequired =
      setupRes.status === "fulfilled" && !!setupRes.value?.setup_required;
    const passwordLoginAllowed =
      pwRes.status === "fulfilled" ? pwRes.value?.allowed !== false : true;
    const registrationAllowed =
      regRes.status === "fulfilled" && !!regRes.value?.allowed;
    const oidcAvailable =
      oidcRes.status === "fulfilled" && !!oidcRes.value?.client_id;

    setCaps({
      setupRequired,
      passwordLoginAllowed,
      registrationAllowed,
      oidcAvailable,
    });

    setStep(setupRequired ? "signup" : "login");
    return true;
  }, []);

  const handleConnect = async () => {
    const url = serverUrl.trim().replace(/\/$/, "");
    if (!url) {
      toast.error("Please enter a server address");
      return;
    }
    if (!/^https?:\/\//.test(url)) {
      toast.error("Server address must start with http:// or https://");
      return;
    }

    setBusy(true);
    try {
      await saveServerConfig({
        serverUrl: url,
        lastUpdated: new Date().toISOString(),
      });
      setSelectedServer({ name: "Server", ip: url });

      const ok = await probeServer();
      if (!ok) {
        toast.error("Could not reach that server");
      }
    } catch (e: any) {
      toast.error(errMessage(e, "Could not reach that server"));
    } finally {
      setBusy(false);
    }
  };

  // When the flow is opened directly to login/signup (e.g. "Sign in" after
  // logout, with a server already configured), the server hasn't been probed
  // yet so `caps` is null and no form would render. Probe on mount in that case.
  useEffect(() => {
    if (
      (authFlowInitialStep === "login" || authFlowInitialStep === "signup") &&
      getCurrentServerUrl()
    ) {
      setBusy(true);
      probeServer()
        .then((ok) => {
          if (!ok) {
            toast.error("Could not reach that server");
            setStep("server");
          }
        })
        .catch(() => setStep("server"))
        .finally(() => setBusy(false));
    }
    // Run once on mount for the initial step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToServer = () => {
    setCaps(null);
    setStep("server");
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      {step === "oidc" ? (
        <OidcStep
          bg={bg}
          accent={accent}
          onBack={() =>
            // If there's a usable native login step, return to it; otherwise
            // (pure reverse-proxy case) go back to the server step.
            setStep(
              caps && (caps.passwordLoginAllowed || caps.oidcAvailable)
                ? "login"
                : "server",
            )
          }
          onAuthenticated={finishAuthenticated}
        />
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* Shared header */}
          <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
            {step !== "server" ? (
              <TouchableOpacity
                onPress={goToServer}
                className="flex-row items-center gap-1.5 py-1 pr-2"
                hitSlop={8}
              >
                <ArrowLeft size={18} color={color("foreground")} />
                <Text className="text-xs text-foreground" numberOfLines={1}>
                  {activeHost || "Server"}
                </Text>
              </TouchableOpacity>
            ) : (
              <View className="flex-1" />
            )}
            <TouchableOpacity
              onPress={closeAuthFlow}
              hitSlop={8}
              className="py-1 pl-2"
            >
              <X size={20} color={muted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
            keyboardShouldPersistTaps="handled"
          >
            <View className="items-center px-6 py-10">
              {/* Brand mark */}
              <View className="mb-5 h-16 w-16 items-center justify-center border border-accent-brand/40 bg-accent-brand/10">
                <Server size={30} color={accent} />
              </View>
              <Text
                weight="bold"
                className="text-3xl tracking-[3px] text-foreground"
              >
                TERMIX
              </Text>
              <Text className="mb-8 mt-1 text-xs tracking-[2px] text-muted-foreground">
                {step === "server"
                  ? "CONNECT TO YOUR SERVER"
                  : (activeHost || "").toUpperCase()}
              </Text>

              {step === "server" && (
                <ServerStep
                  serverUrl={serverUrl}
                  setServerUrl={setServerUrl}
                  busy={busy}
                  onConnect={handleConnect}
                  color={color}
                />
              )}

              {step === "login" && caps && (
                <LoginStep
                  caps={caps}
                  color={color}
                  onTotp={(tempToken) => {
                    totpTempTokenRef.current = tempToken;
                    setStep("totp");
                  }}
                  onAuthenticated={finishAuthenticated}
                  onForgot={() => setStep("reset")}
                  onSignup={() => setStep("signup")}
                  onOidc={() => setStep("oidc")}
                />
              )}

              {/* Probe in flight (e.g. opened directly to login after logout). */}
              {step === "login" && !caps && (
                <View className="items-center py-6">
                  <ActivityIndicator size="large" color={accent} />
                  <Text className="mt-4 text-sm text-muted-foreground">
                    Connecting…
                  </Text>
                </View>
              )}

              {step === "totp" && (
                <TotpStep
                  color={color}
                  getTempToken={() => totpTempTokenRef.current}
                  onAuthenticated={finishAuthenticated}
                  onBack={() => setStep("login")}
                />
              )}

              {step === "signup" && (
                <SignupStep
                  color={color}
                  firstUser={!!caps?.setupRequired}
                  onAuthenticated={finishAuthenticated}
                  onBack={() =>
                    setStep(caps?.setupRequired ? "server" : "login")
                  }
                />
              )}

              {step === "reset" && (
                <ResetStep
                  color={color}
                  onDone={() => setStep("login")}
                  onBack={() => setStep("login")}
                />
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

// ── Sub-steps ───────────────────────────────────────────────────────────────

function ServerStep({
  serverUrl,
  setServerUrl,
  busy,
  onConnect,
  color,
}: {
  serverUrl: string;
  setServerUrl: (v: string) => void;
  busy: boolean;
  onConnect: () => void;
  color: ReturnType<typeof useThemeColor>;
}) {
  return (
    <>
      <View className="w-full max-w-md border border-border bg-card p-5">
        <Label>Server Address</Label>
        <View className="mt-2">
          <Input
            placeholder="https://termix.example.com"
            value={serverUrl}
            onChangeText={setServerUrl}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            keyboardType="url"
            editable={!busy}
            leading={<Server size={16} color={color("muted-foreground")} />}
            onSubmitEditing={onConnect}
            returnKeyType="go"
          />
        </View>
        <Text className="mt-2 text-[11px] text-muted-foreground">
          Enter the address of your self-hosted Termix server, including http://
          or https://.
        </Text>
        <Button
          variant="accent"
          size="lg"
          className="mt-5"
          loading={busy}
          onPress={onConnect}
        >
          {busy ? "Connecting…" : "Continue"}
        </Button>
      </View>

      <View className="mt-4 w-full max-w-md flex-row gap-2.5 border border-border bg-card/60 px-3 py-2.5">
        <ShieldAlert
          size={15}
          color={color("muted-foreground")}
          style={{ marginTop: 1 }}
        />
        <Text className="flex-1 text-[10px] leading-4 text-muted-foreground">
          Using a self-signed certificate? Install its root CA on your device
          first. Local HTTP servers are supported.
        </Text>
      </View>
    </>
  );
}

function PasswordInput({
  value,
  onChangeText,
  placeholder,
  editable,
  onSubmitEditing,
  color,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  editable: boolean;
  onSubmitEditing?: () => void;
  color: ReturnType<typeof useThemeColor>;
}) {
  const [show, setShow] = useState(false);
  return (
    <Input
      placeholder={placeholder}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={!show}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="off"
      editable={editable}
      onSubmitEditing={onSubmitEditing}
      returnKeyType="go"
      leading={<KeyRound size={16} color={color("muted-foreground")} />}
      trailing={
        <TouchableOpacity onPress={() => setShow((s) => !s)} hitSlop={8}>
          {show ? (
            <EyeOff size={16} color={color("muted-foreground")} />
          ) : (
            <Eye size={16} color={color("muted-foreground")} />
          )}
        </TouchableOpacity>
      }
    />
  );
}

function LoginStep({
  caps,
  color,
  onTotp,
  onAuthenticated,
  onForgot,
  onSignup,
  onOidc,
}: {
  caps: ServerCaps;
  color: ReturnType<typeof useThemeColor>;
  onTotp: (tempToken: string) => void;
  onAuthenticated: () => void;
  onForgot: () => void;
  onSignup: () => void;
  onOidc: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      toast.error("Enter your username and password");
      return;
    }
    setBusy(true);
    try {
      const res = await loginUser(username.trim(), password);
      if (res?.requires_totp) {
        onTotp(res.temp_token || res.token || "");
        return;
      }
      // loginUser already persisted the JWT.
      await onAuthenticated();
    } catch (e: any) {
      if (e?.code === "PROXY_AUTH_GATE") {
        // The server is behind a login proxy — fall back to the browser flow.
        toast.error(
          "This server uses a login proxy — opening external sign-in",
        );
        onOidc();
        return;
      }
      toast.error(errMessage(e, "Login failed"));
    } finally {
      setBusy(false);
    }
  };

  const showPasswordCard = caps.passwordLoginAllowed;

  return (
    <View className="w-full max-w-md">
      {showPasswordCard ? (
        <View className="border border-border bg-card p-5">
          <Label>Username</Label>
          <View className="mb-4 mt-2">
            <Input
              placeholder="username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              editable={!busy}
              leading={<UserIcon size={16} color={color("muted-foreground")} />}
            />
          </View>
          <Label>Password</Label>
          <View className="mt-2">
            <PasswordInput
              value={password}
              onChangeText={setPassword}
              placeholder="password"
              editable={!busy}
              onSubmitEditing={handleLogin}
              color={color}
            />
          </View>

          <Button
            variant="accent"
            size="lg"
            className="mt-5"
            loading={busy}
            onPress={handleLogin}
          >
            {busy ? "Signing in…" : "Sign in"}
          </Button>

          <View className="mt-4 flex-row justify-between">
            <TouchableOpacity onPress={onForgot} hitSlop={8}>
              <Text className="text-[11px] text-muted-foreground">
                Forgot password?
              </Text>
            </TouchableOpacity>
            {caps.registrationAllowed ? (
              <TouchableOpacity onPress={onSignup} hitSlop={8}>
                <Text className="text-[11px] text-accent-brand">Sign up</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : (
        <View className="border border-border bg-card p-5">
          <Text className="text-sm leading-5 text-muted-foreground">
            Password login is disabled on this server. Use external sign-in
            below.
          </Text>
        </View>
      )}

      {caps.oidcAvailable ? (
        <>
          {showPasswordCard ? (
            <View className="my-4 flex-row items-center gap-3">
              <View className="h-px flex-1 bg-border" />
              <Text className="text-[10px] tracking-[2px] text-muted-foreground">
                OR
              </Text>
              <View className="h-px flex-1 bg-border" />
            </View>
          ) : (
            <View className="h-4" />
          )}
          <Button
            variant="outline"
            size="lg"
            onPress={onOidc}
            icon={<Globe size={16} color={color("foreground")} />}
          >
            Continue with SSO
          </Button>
        </>
      ) : null}

      {!showPasswordCard && !caps.oidcAvailable ? (
        <View className="mt-3 border border-destructive/40 bg-card p-4">
          <Text className="text-xs leading-5 text-destructive">
            This server has no available sign-in methods (password login is
            disabled and no SSO provider is configured). Check the server
            configuration.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function TotpStep({
  color,
  getTempToken,
  onAuthenticated,
  onBack,
}: {
  color: ReturnType<typeof useThemeColor>;
  getTempToken: () => string;
  onAuthenticated: () => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const handleVerify = async () => {
    const c = code.trim();
    if (!c) {
      toast.error("Enter your authentication code");
      return;
    }
    setBusy(true);
    try {
      await verifyTOTPLogin(getTempToken(), c);
      await onAuthenticated();
    } catch (e: any) {
      toast.error(errMessage(e, "Invalid code"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="w-full max-w-md border border-border bg-card p-5">
      <Label>Two-Factor Code</Label>
      <View className="mt-2">
        <Input
          placeholder="123456"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          onSubmitEditing={handleVerify}
          returnKeyType="go"
          leading={<KeyRound size={16} color={color("muted-foreground")} />}
        />
      </View>
      <Text className="mt-2 text-[11px] text-muted-foreground">
        Enter the 6-digit code from your authenticator app, or one of your
        backup codes.
      </Text>
      <Button
        variant="accent"
        size="lg"
        className="mt-5"
        loading={busy}
        onPress={handleVerify}
      >
        {busy ? "Verifying…" : "Verify"}
      </Button>
      <TouchableOpacity
        onPress={onBack}
        hitSlop={8}
        className="mt-4 self-center"
      >
        <Text className="text-[11px] text-muted-foreground">
          Back to sign in
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function SignupStep({
  color,
  firstUser,
  onAuthenticated,
  onBack,
}: {
  color: ReturnType<typeof useThemeColor>;
  firstUser: boolean;
  onAuthenticated: () => void;
  onBack: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSignup = async () => {
    if (!username.trim() || !password) {
      toast.error("Enter a username and password");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await registerUser(username.trim(), password);
      // Auto sign-in after creating the account.
      await loginUser(username.trim(), password);
      await onAuthenticated();
    } catch (e: any) {
      toast.error(errMessage(e, "Could not create account"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="w-full max-w-md border border-border bg-card p-5">
      <Label>{firstUser ? "Create Admin Account" : "Create Account"}</Label>
      {firstUser ? (
        <Text className="mb-3 mt-1 text-[11px] text-muted-foreground">
          This is the first account on the server and will be an administrator.
        </Text>
      ) : (
        <View className="mb-3" />
      )}

      <View className="mb-4">
        <Input
          placeholder="username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          leading={<UserIcon size={16} color={color("muted-foreground")} />}
        />
      </View>
      <View className="mb-4">
        <PasswordInput
          value={password}
          onChangeText={setPassword}
          placeholder="password"
          editable={!busy}
          color={color}
        />
      </View>
      <View>
        <PasswordInput
          value={confirm}
          onChangeText={setConfirm}
          placeholder="confirm password"
          editable={!busy}
          onSubmitEditing={handleSignup}
          color={color}
        />
      </View>

      <Button
        variant="accent"
        size="lg"
        className="mt-5"
        loading={busy}
        onPress={handleSignup}
      >
        {busy ? "Creating…" : "Create account"}
      </Button>
      <TouchableOpacity
        onPress={onBack}
        hitSlop={8}
        className="mt-4 self-center"
      >
        <Text className="text-[11px] text-muted-foreground">
          {firstUser ? "Back" : "Already have an account? Sign in"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function ResetStep({
  color,
  onDone,
  onBack,
}: {
  color: ReturnType<typeof useThemeColor>;
  onDone: () => void;
  onBack: () => void;
}) {
  const [phase, setPhase] = useState<"request" | "code" | "password">(
    "request",
  );
  const [username, setUsername] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [tempToken, setTempToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const requestCode = async () => {
    if (!username.trim()) {
      toast.error("Enter your username");
      return;
    }
    setBusy(true);
    try {
      await initiatePasswordReset(username.trim());
      toast.success("Reset code generated — check the server logs");
      setPhase("code");
    } catch (e: any) {
      toast.error(errMessage(e, "Could not start password reset"));
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!resetCode.trim()) {
      toast.error("Enter the reset code");
      return;
    }
    setBusy(true);
    try {
      const res = await verifyPasswordResetCode(
        username.trim(),
        resetCode.trim(),
      );
      setTempToken(res?.tempToken || "");
      setPhase("password");
    } catch (e: any) {
      toast.error(errMessage(e, "Invalid reset code"));
    } finally {
      setBusy(false);
    }
  };

  const setNew = async () => {
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    try {
      await completePasswordReset(username.trim(), tempToken, newPassword);
      toast.success("Password reset — you can sign in now");
      onDone();
    } catch (e: any) {
      toast.error(errMessage(e, "Could not reset password"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="w-full max-w-md border border-border bg-card p-5">
      <Label>Reset Password</Label>

      {phase === "request" && (
        <>
          <Text className="mb-3 mt-1 text-[11px] text-muted-foreground">
            Enter your username. A reset code will be generated and printed to
            the server&apos;s logs.
          </Text>
          <Input
            placeholder="username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            leading={<UserIcon size={16} color={color("muted-foreground")} />}
          />
          <Button
            variant="accent"
            size="lg"
            className="mt-5"
            loading={busy}
            onPress={requestCode}
          >
            {busy ? "Sending…" : "Send reset code"}
          </Button>
        </>
      )}

      {phase === "code" && (
        <>
          <Text className="mb-3 mt-1 text-[11px] text-muted-foreground">
            Enter the 6-digit reset code from the server logs.
          </Text>
          <Input
            placeholder="123456"
            value={resetCode}
            onChangeText={setResetCode}
            keyboardType="number-pad"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            leading={<KeyRound size={16} color={color("muted-foreground")} />}
          />
          <Button
            variant="accent"
            size="lg"
            className="mt-5"
            loading={busy}
            onPress={verifyCode}
          >
            {busy ? "Verifying…" : "Verify code"}
          </Button>
        </>
      )}

      {phase === "password" && (
        <>
          <Text className="mb-3 mt-1 text-[11px] text-muted-foreground">
            Choose a new password.
          </Text>
          <PasswordInput
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="new password"
            editable={!busy}
            onSubmitEditing={setNew}
            color={color}
          />
          <Button
            variant="accent"
            size="lg"
            className="mt-5"
            loading={busy}
            onPress={setNew}
          >
            {busy ? "Saving…" : "Set new password"}
          </Button>
        </>
      )}

      <TouchableOpacity
        onPress={onBack}
        hitSlop={8}
        className="mt-4 self-center"
      >
        <Text className="text-[11px] text-muted-foreground">
          Back to sign in
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── OIDC / reverse-proxy sign-in ─────────────────────────────────────────────
// OIDC opens in the system browser so provider-side captcha/passkey checks work.
// Reverse-proxy auth still falls back to the embedded web view.

function OidcStep({
  bg,
  accent,
  onBack,
  onAuthenticated,
}: {
  bg: string;
  accent: string;
  onBack: () => void;
  onAuthenticated: () => void;
}) {
  const color = useThemeColor();
  const webViewRef = useRef<WebView>(null);
  const [source, setSource] = useState<{ uri: string } | null>(null);
  const [url, setUrl] = useState("");
  const [authenticating, setAuthenticating] = useState(false);
  const [browserAuthUrl, setBrowserAuthUrl] = useState<string | null>(null);
  const [openingBrowser, setOpeningBrowser] = useState(false);
  const [webViewKey, setWebViewKey] = useState(() => String(Date.now()));

  const completeNativeAuth = useCallback(
    async (token: string) => {
      if (authenticating) return;
      setAuthenticating(true);
      try {
        await setCookie("jwt", token);
        const saved = await AsyncStorage.getItem("jwt");
        if (!saved) {
          Alert.alert("Error", "Failed to save authentication token.");
          return;
        }
        await initializeServerConfig();
        const me = await getUserInfo();
        if (!me?.username) return;
        await onAuthenticated();
      } catch {
        Alert.alert("Error", "Could not complete sign-in.");
      } finally {
        setAuthenticating(false);
      }
    },
    [authenticating, onAuthenticated],
  );

  const handleCallbackUrl = useCallback(
    async (callbackUrl: string) => {
      if (!callbackUrl.startsWith("termix-mobile://oidc-callback")) return;

      let parsed: URL;
      try {
        parsed = new URL(callbackUrl);
      } catch {
        return;
      }

      const error = parsed.searchParams.get("error");
      if (error) {
        Alert.alert("Sign in failed", error);
        return;
      }

      const token = parsed.searchParams.get("token");
      if (!token) {
        Alert.alert("Sign in failed", "The server did not return a token.");
        return;
      }

      await completeNativeAuth(token);
    },
    [completeNativeAuth],
  );

  const openBrowser = useCallback(
    async (authUrl: string) => {
      setOpeningBrowser(true);
      try {
        const callbackUrl = ExpoLinking.createURL("oidc-callback", {
          scheme: "termix-mobile",
        });
        // openAuthSessionAsync uses ASWebAuthenticationSession on iOS and
        // Chrome Custom Tabs on Android — both support WebAuthn/passkeys (RFC 8252).
        const result = await WebBrowser.openAuthSessionAsync(
          authUrl,
          callbackUrl,
        );
        if (result.type === "success" && result.url) {
          await handleCallbackUrl(result.url);
        }
        // result.type === "cancel" means user dismissed — no error needed
      } catch {
        Alert.alert("Error", "Could not open the authentication browser.");
      } finally {
        setOpeningBrowser(false);
      }
    },
    [handleCallbackUrl],
  );

  // Pre-warm Chrome Custom Tab on Android for faster open
  useEffect(() => {
    if (Platform.OS === "android") void WebBrowser.warmUpAsync();
    return () => {
      if (Platform.OS === "android") void WebBrowser.coolDownAsync();
    };
  }, []);

  useEffect(() => {
    const subscription = Linking.addEventListener("url", (event) => {
      void handleCallbackUrl(event.url);
    });
    void Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) void handleCallbackUrl(initialUrl);
    });
    return () => subscription.remove();
  }, [handleCallbackUrl]);

  useEffect(() => {
    const init = async () => {
      const callbackUrl = ExpoLinking.createURL("oidc-callback", {
        scheme: "termix-mobile",
      });
      try {
        const res = await getOIDCAuthorizeUrl(callbackUrl);
        if (res?.auth_url) {
          setBrowserAuthUrl(res.auth_url);
          setUrl(res.auth_url);
          await openBrowser(res.auth_url);
          return;
        }
      } catch {
        // ignore — fall back to the server root, which renders the web login
        // (covers reverse-proxy login forms).
      }

      const fallbackUrl = getCurrentServerUrl();
      if (fallbackUrl) {
        setSource({ uri: fallbackUrl });
        setUrl(fallbackUrl);
      }
    };
    init();
  }, [openBrowser]);

  const handleNav = (navState: WebViewNavigation) => {
    if (!navState.loading) setUrl(navState.url);
  };

  const handleError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    if (
      nativeEvent.description?.includes("SSL") ||
      nativeEvent.description?.includes("certificate") ||
      nativeEvent.description?.includes("ERR_CERT")
    ) {
      Alert.alert(
        "SSL Certificate Error",
        "Unable to verify the server's SSL certificate. Install your self-signed certificate's root CA on the device (as a CA certificate) and rebuild the app.\n\nError: " +
          (nativeEvent.description || "Unknown SSL error"),
        [{ text: "OK" }],
      );
    }
  };

  const onMessage = async (event: any) => {
    if (authenticating) return;
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "AUTH_SUCCESS" && data.token) {
        await completeNativeAuth(data.token);
      }
    } catch {
      setAuthenticating(false);
    }
  };

  const injectedJavaScript = `
    (function() {
      const isCallback = window.location.href.includes('/oidc/callback') ||
                         window.location.href.includes('?success=') ||
                         window.location.href.includes('?error=');

      let hasNotified = false;
      let initialCheckComplete = false;

      const notifyAuth = (token) => {
        if (hasNotified || !token || token.length < 20) return;
        if (!isCallback && !initialCheckComplete) return;
        hasNotified = true;
        try {
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: 'AUTH_SUCCESS', token: token })
          );
        } catch (e) {}
      };

      const checkAuth = () => {
        try {
          const ls = localStorage.getItem('jwt');
          if (ls) { notifyAuth(ls); return true; }
          const ss = sessionStorage.getItem('jwt');
          if (ss) { notifyAuth(ss); return true; }
          const m = document.cookie.split('; ').find(r => r.startsWith('jwt='));
          if (m) { notifyAuth(m.split('=')[1]); return true; }
        } catch (e) {}
        return false;
      };

      const origSet = localStorage.setItem;
      localStorage.setItem = function(k, v) {
        origSet.apply(this, arguments);
        if (k === 'jwt' && v && !hasNotified) checkAuth();
      };

      const id = setInterval(() => {
        if (hasNotified) { clearInterval(id); return; }
        if (checkAuth()) clearInterval(id);
      }, 500);
      checkAuth();
      setTimeout(() => { initialCheckComplete = true; }, 1000);
      setTimeout(() => clearInterval(id), 120000);
    })();
    true;
  `;

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between border-b border-border px-3 py-2.5">
        <TouchableOpacity
          onPress={onBack}
          className="flex-row items-center gap-1.5 py-1 pr-2"
          hitSlop={8}
        >
          <ArrowLeft size={18} color={color("foreground")} />
          <Text weight="medium" className="text-sm text-foreground">
            Sign in
          </Text>
        </TouchableOpacity>
        <View className="mx-3 flex-1">
          <Text
            className="text-center text-xs text-muted-foreground"
            numberOfLines={1}
          >
            {url.replace(/^https?:\/\//, "")}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            setWebViewKey(String(Date.now()));
            webViewRef.current?.reload();
          }}
          hitSlop={8}
          className="py-1 pl-2"
        >
          <RefreshCw size={18} color={color("foreground")} />
        </TouchableOpacity>
      </View>

      {browserAuthUrl ? (
        <View className="flex-1 items-center justify-center bg-background px-6">
          <Globe size={38} color={accent} />
          <Text weight="medium" className="mt-4 text-lg text-foreground">
            Complete sign-in in your browser
          </Text>
          <Text className="mt-2 text-center text-sm leading-5 text-muted-foreground">
            Return to Termix after your identity provider finishes signing you
            in.
          </Text>
          <Button
            variant="accent"
            size="lg"
            className="mt-6 w-full max-w-xs"
            loading={openingBrowser || authenticating}
            onPress={() => openBrowser(browserAuthUrl)}
          >
            {authenticating ? "Signing in..." : "Open browser"}
          </Button>
        </View>
      ) : source ? (
        <WebView
          key={webViewKey}
          ref={webViewRef}
          source={source}
          userAgent={
            Platform.OS === "android"
              ? "Termix-Mobile/Android"
              : "Termix-Mobile/iOS"
          }
          style={{ flex: 1, backgroundColor: bg }}
          containerStyle={{ backgroundColor: bg }}
          onNavigationStateChange={handleNav}
          onMessage={onMessage}
          onError={handleError}
          injectedJavaScript={injectedJavaScript}
          injectedJavaScriptBeforeContentLoaded={`
            document.body && (document.body.style.backgroundColor = '${bg}');
            document.documentElement.style.backgroundColor = '${bg}';
          `}
          incognito={false}
          cacheEnabled={false}
          cacheMode="LOAD_NO_CACHE"
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          {...(Platform.OS === "android" && {
            mixedContentMode: "always" as const,
            allowFileAccess: false,
          })}
          {...(Platform.OS === "ios" && {
            allowsBackForwardNavigationGestures: false,
          })}
          renderLoading={() => (
            <View
              style={{
                backgroundColor: bg,
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <ActivityIndicator size="large" color={accent} />
            </View>
          )}
        />
      ) : (
        <View className="flex-1 items-center justify-center bg-background">
          <ActivityIndicator size="large" color={accent} />
        </View>
      )}
    </View>
  );
}
