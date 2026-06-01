import { useEffect, useState } from "react";
import { View } from "react-native";
import { ShieldCheck, KeyRound, Lock } from "lucide-react-native";
import { Dialog, Input, Button, Text, SegmentedControl } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { SessionAuthOverrides } from "@/types";
import type { SessionConnectState } from "./useSessionConnect";

/**
 * AuthDialogs — the shared interactive-auth surface for session-based connects.
 * Driven entirely by the connect state machine from useSessionConnect: it shows
 * the TOTP dialog in the "totp" state, the Warpgate dialog in "warpgate", and an
 * interactive password/key/passphrase dialog in "auth". Wire it once per session
 * type and it handles every auth method the backend can demand.
 */
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
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (state !== "totp") {
      setCode("");
      setBusy(false);
    }
  }, [state]);

  const submitTotp = async () => {
    if (code.trim().length < 6) return;
    setBusy(true);
    try {
      await onSubmitTotp(code.trim());
    } catch {
      // error surfaced via errorMessage; keep dialog open
    } finally {
      setBusy(false);
    }
  };

  // --- Warpgate ---
  const [wgUrl, setWgUrl] = useState("");
  const [wgKey, setWgKey] = useState("");
  useEffect(() => {
    if (state !== "warpgate") {
      setWgUrl("");
      setWgKey("");
    }
  }, [state]);

  // --- Interactive auth (password / key / passphrase) ---
  const [authMethod, setAuthMethod] = useState<"password" | "key">("password");
  const [authPassword, setAuthPassword] = useState("");
  const [authKey, setAuthKey] = useState("");
  const [authKeyPassword, setAuthKeyPassword] = useState("");
  useEffect(() => {
    if (state !== "auth") {
      setAuthPassword("");
      setAuthKey("");
      setAuthKeyPassword("");
    }
  }, [state]);

  const submitAuth = () => {
    if (authMethod === "password") {
      onSubmitAuth({ userProvidedPassword: authPassword });
    } else {
      onSubmitAuth({
        userProvidedSshKey: authKey,
        userProvidedKeyPassword: authKeyPassword || undefined,
      });
    }
  };

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
              loading={busy}
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
              onPress={() => onSubmitWarpgate?.(wgUrl, wgKey || undefined)}
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
