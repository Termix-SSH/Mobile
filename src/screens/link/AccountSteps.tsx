import { useState } from "react";
import { Pressable, View } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { Button, Field, Input, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import type { AccountClient } from "@/core/api/AccountClient";
import { toast } from "@/utils/toast";

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
          accessibilityLabel={show ? "Hide password" : "Show password"}
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
      toast.error("Enter a username and password");
      return;
    }
    if (password.length < 6) {
      toast.error("Use at least 6 characters for the password");
      return;
    }
    if (password !== confirm) {
      toast.error("The passwords don't match");
      return;
    }
    setBusy(true);
    try {
      await client.api.auth.registerUser(username.trim(), password);
      await client.api.auth.loginUser(username.trim(), password);
      onSignedIn();
    } catch (e) {
      toast.error(errorText(e, "Could not make the account"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepCard>
      <View className="gap-1">
        <Text weight="medium" className="text-sm text-foreground">
          {firstUser ? "Make the admin account" : "Make an account"}
        </Text>
        <Text className="text-meta text-muted-foreground">
          {firstUser
            ? "This is the first account on the server, so it runs the server."
            : "Pick a username and password for this server."}
        </Text>
      </View>
      <Field label="Username">
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
      <Field label="Password">
        <PasswordInput
          value={password}
          onChangeText={setPassword}
          editable={!busy}
          newPassword
        />
      </Field>
      <Field label="Password again">
        <PasswordInput
          value={confirm}
          onChangeText={setConfirm}
          editable={!busy}
          onSubmitEditing={submit}
          newPassword
        />
      </Field>
      <Button size="lg" loading={busy} onPress={submit}>
        Make account
      </Button>
      <TextLink
        label={firstUser ? "Back" : "Have an account? Sign in"}
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
          toast.success("Reset code made. It is in the server's logs");
          setPhase("code");
        }, "Could not start the reset")
      : toast.error("Enter your username");

  const verify = () =>
    code.trim()
      ? run(async () => {
          const res = await client.api.auth.verifyPasswordResetCode(
            username.trim(),
            code.trim(),
          );
          setTempToken(res?.tempToken || "");
          setPhase("password");
        }, "That code didn't work")
      : toast.error("Enter the reset code");

  const save = () =>
    password.length >= 6
      ? run(async () => {
          await client.api.auth.completePasswordReset(
            username.trim(),
            tempToken,
            password,
          );
          toast.success("Password changed. Sign in with it now");
          onDone();
        }, "Could not change the password")
      : toast.error("Use at least 6 characters for the password");

  return (
    <StepCard>
      <Text weight="medium" className="text-sm text-foreground">
        Reset password
      </Text>
      {phase === "request" ? (
        <>
          <Text className="text-meta text-muted-foreground">
            Enter your username. The server writes a reset code to its logs.
          </Text>
          <Field label="Username">
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
            Send reset code
          </Button>
        </>
      ) : phase === "code" ? (
        <>
          <Text className="text-meta text-muted-foreground">
            Enter the 6 digit code from the server logs.
          </Text>
          <Field label="Reset code">
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
            Check code
          </Button>
        </>
      ) : (
        <>
          <Field label="New password">
            <PasswordInput
              value={password}
              onChangeText={setPassword}
              editable={!busy}
              onSubmitEditing={save}
              newPassword
            />
          </Field>
          <Button size="lg" loading={busy} onPress={save}>
            Save new password
          </Button>
        </>
      )}
      <TextLink label="Back to sign in" onPress={onDone} />
    </StepCard>
  );
}
