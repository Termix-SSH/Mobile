import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { Fingerprint, Globe } from "lucide-react-native";
import { Button, Field, Input, Tabs, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import type { AccountClient } from "@/core/api/AccountClient";
import {
  signInWithForm,
  signInWithPassword,
  type LoginResult,
} from "@/core/accounts/link/login";
import type { ServerSignIn, SignInOption } from "@/core/accounts/link/methods";
import {
  biometricName,
  clearSavedLogin,
  hasSavedLogin,
  readSavedLogin,
  type SavedLogin,
} from "@/core/accounts/saved-login";
import { toast } from "@/utils/toast";
import { PasswordInput, StepCard, TextLink, errorText } from "./AccountSteps";

type FormOption = Extract<SignInOption, { kind: "password" | "form" }>;
type RedirectOption = Extract<SignInOption, { kind: "redirect" }>;

const formKey = (o: FormOption) =>
  o.kind === "password" ? "password" : `${o.methodId}:${o.instanceId ?? ""}`;

/** The typed forms first, then one button per provider, then the browser. */
export function splitOptions(options: SignInOption[]) {
  return {
    forms: options.filter(
      (o): o is FormOption => o.kind === "password" || o.kind === "form",
    ),
    redirects: options.filter(
      (o): o is RedirectOption => o.kind === "redirect",
    ),
    browser: options.some((o) => o.kind === "browser"),
    passkey: options.some((o) => o.kind === "browser" && o.passkey),
  };
}

export function SignInStep({
  client,
  signIn,
  onResult,
  onRedirect,
  onBrowser,
  onSignup,
  onReset,
}: {
  client: AccountClient;
  signIn: ServerSignIn;
  /** `login` is set after a password sign in, to offer saving it. */
  onResult: (result: LoginResult, login?: SavedLogin) => void;
  onRedirect: (option: RedirectOption) => void;
  onBrowser: () => void;
  onSignup: () => void;
  onReset: () => void;
}) {
  const color = useThemeColor();
  const { forms, redirects, browser, passkey } = useMemo(
    () => splitOptions(signIn.options),
    [signIn.options],
  );
  const [formId, setFormId] = useState(forms[0] ? formKey(forms[0]) : "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const autoStarted = useRef(false);
  const form = forms.find((f) => formKey(f) === formId) ?? forms[0];
  // A password kept behind Face ID or a fingerprint for this server.
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!forms.some((f) => f.kind === "password")) return;
    let live = true;
    void (async () => {
      try {
        if (!(await hasSavedLogin(client))) return;
        const name = await biometricName();
        if (live) setSaved(name);
      } catch {
        // No saved login.
      }
    })();
    return () => {
      live = false;
    };
  }, [client, forms]);

  const signInSaved = async () => {
    const login = await readSavedLogin(client);
    if (!login) {
      if (!(await hasSavedLogin(client))) setSaved(null);
      return;
    }
    setBusy(true);
    try {
      onResult(
        await signInWithPassword(client, login.username, login.password),
      );
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      if (status === 401 || status === 403) {
        await clearSavedLogin(client);
        setSaved(null);
        toast.error(
          "The saved login no longer works",
          "Sign in with your password.",
        );
      } else {
        toast.error(errorText(e, "Sign in failed"));
      }
    } finally {
      setBusy(false);
    }
  };

  // An admin can make one provider start on its own, like the web login.
  useEffect(() => {
    const auto = redirects.find((r) => r.autoStart);
    if (auto && !autoStarted.current && forms.length === 0) {
      autoStarted.current = true;
      onRedirect(auto);
    }
  }, [redirects, forms.length, onRedirect]);

  const submit = async () => {
    if (!form) return;
    if (!username.trim() || !password) {
      toast.error("Enter your username and password");
      return;
    }
    setBusy(true);
    try {
      const result =
        form.kind === "password"
          ? await signInWithPassword(client, username, password)
          : await signInWithForm(client, form, username, password);
      onResult(
        result,
        form.kind === "password"
          ? { username: username.trim(), password }
          : undefined,
      );
    } catch (e: any) {
      if (e?.code === "PROXY_AUTH_GATE") {
        toast.error(
          "This server is behind a login proxy",
          "Opening its sign in page.",
        );
        onBrowser();
        return;
      }
      toast.error(errorText(e, "Sign in failed"));
    } finally {
      setBusy(false);
    }
  };

  const nothing = forms.length === 0 && redirects.length === 0;
  return (
    <View className="w-full max-w-md gap-4">
      {saved ? (
        <Button
          size="lg"
          loading={busy}
          onPress={() => void signInSaved()}
          icon={<Fingerprint size={16} color={color("primary-foreground")} />}
        >
          {`Sign in with ${saved}`}
        </Button>
      ) : null}
      {form ? (
        <StepCard>
          {forms.length > 1 ? (
            <Field label="Sign in with">
              <Tabs<string>
                value={formKey(form)}
                onChange={setFormId}
                fill={false}
                options={forms.map((f) => ({
                  id: formKey(f),
                  label: f.kind === "password" ? "Password" : f.label,
                }))}
              />
            </Field>
          ) : null}
          <Field label="Username">
            <Input
              value={username}
              onChangeText={setUsername}
              placeholder="username"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              importantForAutofill="yes"
              editable={!busy}
            />
          </Field>
          <Field label="Password">
            <PasswordInput
              value={password}
              onChangeText={setPassword}
              editable={!busy}
              onSubmitEditing={submit}
            />
          </Field>
          <Button size="lg" loading={busy} onPress={submit}>
            Sign in
          </Button>
          <View className="flex-row justify-between">
            {form.kind === "password" ? (
              <TextLink label="Forgot password?" onPress={onReset} />
            ) : (
              <View />
            )}
            {signIn.registrationAllowed ? (
              <TextLink
                label="Make an account"
                tone="brand"
                onPress={onSignup}
              />
            ) : null}
          </View>
        </StepCard>
      ) : null}

      {redirects.length > 0 ? (
        <View className="gap-2">
          {form ? (
            <View className="flex-row items-center gap-3">
              <View className="h-px flex-1 bg-border" />
              <Text className="text-[10px] tracking-[2px] text-muted-foreground">
                OR
              </Text>
              <View className="h-px flex-1 bg-border" />
            </View>
          ) : null}
          {redirects.map((r) => (
            <Button
              key={`${r.methodId}:${r.instanceId ?? ""}`}
              variant="muted"
              size="lg"
              onPress={() => onRedirect(r)}
              icon={<Globe size={16} color={color("foreground")} />}
            >
              {`Continue with ${r.label}`}
            </Button>
          ))}
        </View>
      ) : null}

      {passkey ? (
        <View className="gap-1">
          <Button
            variant="muted"
            size="lg"
            onPress={onBrowser}
            icon={<Fingerprint size={16} color={color("foreground")} />}
          >
            Sign in with a passkey or security key
          </Button>
          <Text className="text-center text-[10px] text-muted-foreground">
            Opens your server&apos;s sign in page in the browser. Face ID,
            fingerprint, NFC and USB keys all work there. Needs Termix 26.10.6
            or newer.
          </Text>
        </View>
      ) : browser ? (
        <View className="gap-1">
          <Button
            variant="ghost"
            size="lg"
            onPress={onBrowser}
            icon={<Globe size={16} color={color("foreground")} />}
          >
            Sign in in the browser
          </Button>
          <Text className="text-center text-[10px] text-muted-foreground">
            Opens your server&apos;s sign in page, for anything the app
            can&apos;t do here. Needs Termix 26.10.6 or newer.
          </Text>
        </View>
      ) : null}

      {nothing ? (
        <StepCard>
          <Text className="text-xs leading-5 text-destructive-text">
            This server has no sign in turned on that the app can use. Ask
            whoever runs it, or try the browser sign in above.
          </Text>
        </StepCard>
      ) : null}
    </View>
  );
}
