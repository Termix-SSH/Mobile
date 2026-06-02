import { useEffect, useState } from "react";
import { View } from "react-native";
import { ShieldCheck, KeyRound, Lock, Clock } from "lucide-react-native";
import { Dialog, Input, Button, Text, SegmentedControl } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { SessionAuthOverrides } from "@/types";
import type { SessionConnectState } from "./useSessionConnect";

function useTotpCountdown() {
  const [secondsLeft, setSecondsLeft] = useState(
    () => 30 - (Math.floor(Date.now() / 1000) % 30),
  );
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft(30 - (Math.floor(Date.now() / 1000) % 30));
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  return secondsLeft;
}

export function AuthDialogs({
  state,
  errorMessage,
  onSubmitTotp,
  onSubmitWarpgate,
  onSubmitAuth,
  onCancel,
}: {
  state: SessionConnectState;
  errorMessage?: string;
  onSubmitTotp: (code: string) => Promise<void>;
  onSubmitWarpgate?: (url: string, securityKey?: string) => Promise<void>;
  onSubmitAuth: (overrides: SessionAuthOverrides) => void;
  onCancel: () => void;
}) {
  const color = useThemeColor();

  // --- TOTP ---
  const [code, setCode] = useState("");
  const [totpBusy, setTotpBusy] = useState(false);
  const totpCountdown = useTotpCountdown();
  useEffect(() => {
    if (state !== "totp") {
      setCode("");
      setTotpBusy(false);
    }
  }, [state]);

  const submitTotp = async () => {
    if (code.trim().length < 6) return;
    setTotpBusy(true);
    try {
      await onSubmitTotp(code.trim());
    } catch {
      // error surfaced via errorMessage; keep dialog open
    } finally {
      setTotpBusy(false);
    }
  };

  // --- Warpgate ---
  const [wgUrl, setWgUrl] = useState("");
  const [wgKey, setWgKey] = useState("");
  const [wgBusy, setWgBusy] = useState(false);
  useEffect(() => {
    if (state !== "warpgate") {
      setWgUrl("");
      setWgKey("");
      setWgBusy(false);
    }
  }, [state]);

  const submitWarpgate = async () => {
    if (!wgUrl.trim()) return;
    setWgBusy(true);
    try {
      await onSubmitWarpgate?.(wgUrl, wgKey || undefined);
    } catch {
      // error surfaced via errorMessage
    } finally {
      setWgBusy(false);
    }
  };

  // --- Interactive auth (password / key / passphrase) ---
  const [authMethod, setAuthMethod] = useState<"password" | "key">("password");
  const [authPassword, setAuthPassword] = useState("");
  const [authKey, setAuthKey] = useState("");
  const [authKeyPassword, setAuthKeyPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  useEffect(() => {
    if (state !== "auth") {
      setAuthPassword("");
      setAuthKey("");
      setAuthKeyPassword("");
      setAuthBusy(false);
    }
  }, [state]);

  const submitAuth = () => {
    setAuthBusy(true);
    if (authMethod === "password") {
      onSubmitAuth({ userProvidedPassword: authPassword });
    } else {
      onSubmitAuth({
        userProvidedSshKey: authKey,
        userProvidedKeyPassword: authKeyPassword || undefined,
      });
    }
    // authBusy is reset when state leaves "auth" (via the useEffect above)
  };

  const totpExpiringSoon = totpCountdown <= 5;

  return (
    <>
      {/* TOTP */}
      <Dialog
        visible={state === "totp"}
        onClose={onCancel}
        icon={<ShieldCheck size={22} color={color("accent-brand")} />}
        title="Two-Factor Authentication"
        description="Enter the 6-digit code from your authenticator app."
        footer={
          <View className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={onCancel}>
              Cancel
            </Button>
            <Button
              variant="accent"
              className="flex-1"
              onPress={submitTotp}
              loading={totpBusy}
              disabled={code.trim().length < 6}
            >
              Verify
            </Button>
          </View>
        }
      >
        <Input
          value={code}
          onChangeText={(t) => setCode(t.replace(/[^0-9]/g, "").slice(0, 6))}
          placeholder="000000"
          keyboardType="number-pad"
          autoFocus
          maxLength={6}
        />
        <View className="mt-2 flex-row items-center gap-1">
          <Clock
            size={12}
            color={
              totpExpiringSoon
                ? color("destructive")
                : color("muted-foreground")
            }
          />
          <Text
            className={`text-xs ${totpExpiringSoon ? "text-destructive" : "text-muted-foreground"}`}
          >
            {totpExpiringSoon
              ? `Code expires in ${totpCountdown}s — get a fresh code`
              : `${totpCountdown}s remaining`}
          </Text>
        </View>
        {errorMessage ? (
          <Text className="text-xs text-destructive mt-2">{errorMessage}</Text>
        ) : null}
      </Dialog>

      {/* Warpgate */}
      <Dialog
        visible={state === "warpgate"}
        onClose={onCancel}
        icon={<KeyRound size={22} color={color("accent-brand")} />}
        title="Warpgate Authentication"
        description="Confirm the Warpgate authentication URL and security key."
        footer={
          <View className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={onCancel}>
              Cancel
            </Button>
            <Button
              variant="accent"
              className="flex-1"
              onPress={submitWarpgate}
              loading={wgBusy}
              disabled={!wgUrl.trim()}
            >
              Authenticate
            </Button>
          </View>
        }
      >
        <View className="gap-2">
          <Input
            value={wgUrl}
            onChangeText={setWgUrl}
            placeholder="Warpgate URL"
            autoCapitalize="none"
          />
          <Input
            value={wgKey}
            onChangeText={setWgKey}
            placeholder="Security key (optional)"
            autoCapitalize="none"
            secureTextEntry
          />
        </View>
        {errorMessage ? (
          <Text className="text-xs text-destructive mt-2">{errorMessage}</Text>
        ) : null}
      </Dialog>

      {/* Interactive auth */}
      <Dialog
        visible={state === "auth"}
        onClose={onCancel}
        icon={<Lock size={22} color={color("accent-brand")} />}
        title="Authentication Required"
        description="This host needs credentials to connect."
        footer={
          <View className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={onCancel}>
              Cancel
            </Button>
            <Button
              variant="accent"
              className="flex-1"
              onPress={submitAuth}
              loading={authBusy}
              disabled={
                authMethod === "password" ? !authPassword : !authKey.trim()
              }
            >
              Connect
            </Button>
          </View>
        }
      >
        <SegmentedControl<"password" | "key">
          options={[
            { id: "password", label: "Password" },
            { id: "key", label: "SSH Key" },
          ]}
          value={authMethod}
          onChange={setAuthMethod}
          className="mb-3"
        />
        {authMethod === "password" ? (
          <Input
            value={authPassword}
            onChangeText={setAuthPassword}
            placeholder="Password"
            secureTextEntry
            autoCapitalize="none"
            autoFocus
          />
        ) : (
          <View className="gap-2">
            <Input
              value={authKey}
              onChangeText={setAuthKey}
              placeholder="Paste private key"
              multiline
              numberOfLines={4}
              autoCapitalize="none"
              style={{ minHeight: 90, textAlignVertical: "top" }}
            />
            <Input
              value={authKeyPassword}
              onChangeText={setAuthKeyPassword}
              placeholder="Key passphrase (optional)"
              secureTextEntry
              autoCapitalize="none"
            />
          </View>
        )}
        {errorMessage ? (
          <Text className="text-xs text-destructive mt-2">{errorMessage}</Text>
        ) : null}
      </Dialog>
    </>
  );
}
