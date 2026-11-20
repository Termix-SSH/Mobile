import { useState } from "react";
import { Pressable, View } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { Button, Field, Input, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import type { AccountClient } from "@/core/api/AccountClient";
import { toast } from "@/utils/toast";
import { t } from "@/i18n";

export function errorText(e: any, fallback: string): string {
  return e?.response?.data?.error || e?.message || fallback;
}

export function StepCard({ children }: { children: React.ReactNode }) {
  return (
    <View className="w-full max-w-md gap-4 border border-border bg-card p-5">
      {children}
    </View>
  );
}

export function TextLink({
  label,
  onPress,
  tone = "muted",
}: {
  label: string;
  onPress: () => void;
  tone?: "muted" | "brand";
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="min-h-11 justify-center px-1"
    >
      <Text
        className={`text-xs ${tone === "brand" ? "text-accent-text" : "text-muted-foreground"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function PasswordInput({
  value,
  onChangeText,
  placeholder = "Password",
  editable = true,
  onSubmitEditing,
  newPassword,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  editable?: boolean;
  onSubmitEditing?: () => void;
  newPassword?: boolean;
}) {
  const color = useThemeColor();
  const [show, setShow] = useState(false);
  return (
    <Input
      placeholder={placeholder}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={!show}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete={newPassword ? "new-password" : "current-password"}
      textContentType={newPassword ? "newPassword" : "password"}
      importantForAutofill="yes"
      editable={editable}
      onSubmitEditing={onSubmitEditing}
      returnKeyType="go"
      trailing={
        <Pressable
          onPress={() => setShow((s) => !s)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={
            show
              ? t("link.accountSteps.hidePassword")
              : t("link.accountSteps.showPassword")
          }
        >
          {show ? (
            <EyeOff size={16} color={color("muted-foreground")} />
          ) : (
            <Eye size={16} color={color("muted-foreground")} />
          )}
        </Pressable>
      }
    />
  );
}

export function SignupStep({
  client,
  firstUser,
  onSignedIn,
  onBack,
}: {
  client: AccountClient;
  firstUser: boolean;
  onSignedIn: () => void;
  onBack: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password) {
      toast.error(t("link.accountSteps.enterAUsernameAndPassword"));
      return;
    }
    if (password.length < 6) {
      toast.error(t("link.accountSteps.useAtLeast6Characters"));
      return;
    }
    if (password !== confirm) {
      toast.error(t("link.accountSteps.thePasswordsDonTMatch"));
      return;
    }
    setBusy(true);
    try {
      await client.api.auth.registerUser(username.trim(), password);
      await client.api.auth.loginUser(username.trim(), password);
      onSignedIn();
    } catch (e) {
      toast.error(errorText(e, t("link.accountSteps.couldNotMakeTheAccount")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepCard>
      <View className="gap-1">
        <Text weight="medium" className="text-sm text-foreground">
          {firstUser
            ? t("link.accountSteps.makeTheAdminAccount")
            : t("link.accountSteps.makeAnAccount")}
        </Text>
        <Text className="text-meta text-muted-foreground">
          {firstUser
            ? t("link.accountSteps.thisIsTheFirstAccount")
            : t("link.accountSteps.pickAUsernameAndPassword")}
        </Text>
      </View>
      <Field label={t("link.accountSteps.username")}>
        <Input
          value={username}
          onChangeText={setUsername}
          placeholder="username"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          textContentType="username"
          importantForAutofill="yes"
          editable={!busy}
        />
      </Field>
      <Field label={t("link.accountSteps.password")}>
        <PasswordInput
          value={password}
          onChangeText={setPassword}
          editable={!busy}
          newPassword
        />
      </Field>
      <Field label={t("link.accountSteps.passwordAgain")}>
        <PasswordInput
          value={confirm}
          onChangeText={setConfirm}
          editable={!busy}
          onSubmitEditing={submit}
          newPassword
        />
      </Field>
      <Button size="lg" loading={busy} onPress={submit}>
        {t("link.accountSteps.makeAccount")}
      </Button>
      <TextLink
        label={
          firstUser
            ? t("link.accountSteps.back")
            : t("link.accountSteps.haveAnAccountSignIn")
        }
        onPress={onBack}
      />
    </StepCard>
  );
}

export function ResetStep({
  client,
  onDone,
}: {
  client: AccountClient;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<"request" | "code" | "password">(
    "request",
  );
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [tempToken, setTempToken] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<void>, fallback: string) => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      toast.error(errorText(e, fallback));
    } finally {
      setBusy(false);
    }
  };

  const request = () =>
    username.trim()
      ? run(async () => {
          await client.api.auth.initiatePasswordReset(username.trim());
          toast.success(t("link.accountSteps.resetCodeMadeItIs"));
          setPhase("code");
        }, t("link.accountSteps.couldNotStartTheReset"))
      : toast.error(t("link.accountSteps.enterYourUsername"));

  const verify = () =>
    code.trim()
      ? run(async () => {
          const res = await client.api.auth.verifyPasswordResetCode(
            username.trim(),
            code.trim(),
          );
          setTempToken(res?.tempToken || "");
          setPhase("password");
        }, t("link.accountSteps.thatCodeDidnTWork"))
      : toast.error(t("link.accountSteps.enterTheResetCode"));

  const save = () =>
    password.length >= 6
      ? run(async () => {
          await client.api.auth.completePasswordReset(
            username.trim(),
            tempToken,
            password,
          );
          toast.success(t("link.accountSteps.passwordChangedSignInWith"));
          onDone();
        }, t("link.accountSteps.couldNotChangeThePassword"))
      : toast.error(t("link.accountSteps.useAtLeast6Characters"));

  return (
    <StepCard>
      <Text weight="medium" className="text-sm text-foreground">
        {t("link.accountSteps.resetPassword")}
      </Text>
      {phase === "request" ? (
        <>
          <Text className="text-meta text-muted-foreground">
            {t("link.accountSteps.enterYourUsernameTheServer")}
          </Text>
          <Field label={t("link.accountSteps.username")}>
            <Input
              value={username}
              onChangeText={setUsername}
              placeholder="username"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              onSubmitEditing={request}
            />
          </Field>
          <Button size="lg" loading={busy} onPress={request}>
            {t("link.accountSteps.sendResetCode")}
          </Button>
        </>
      ) : phase === "code" ? (
        <>
          <Text className="text-meta text-muted-foreground">
            {t("link.accountSteps.enterThe6DigitCode")}
          </Text>
          <Field label={t("link.accountSteps.resetCode")}>
            <Input
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              keyboardType="number-pad"
              editable={!busy}
              onSubmitEditing={verify}
            />
          </Field>
          <Button size="lg" loading={busy} onPress={verify}>
            {t("link.accountSteps.checkCode")}
          </Button>
        </>
      ) : (
        <>
          <Field label={t("link.accountSteps.newPassword")}>
            <PasswordInput
              value={password}
              onChangeText={setPassword}
              editable={!busy}
              onSubmitEditing={save}
              newPassword
            />
          </Field>
          <Button size="lg" loading={busy} onPress={save}>
            {t("link.accountSteps.saveNewPassword")}
          </Button>
        </>
      )}
      <TextLink label={t("link.accountSteps.backToSignIn")} onPress={onDone} />
    </StepCard>
  );
}
