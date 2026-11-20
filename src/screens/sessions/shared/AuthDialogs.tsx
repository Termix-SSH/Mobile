import { useEffect, useState } from "react";
import { View } from "react-native";
import { ShieldCheck, KeyRound, Lock, Clock } from "lucide-react-native";
import { Sheet, SheetBody, Input, Button, Text, Tabs } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { SessionAuthOverrides } from "@/types";
import type { SessionConnectState } from "./useSessionConnect";
import { t as tr } from "@/i18n";

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
  browserSignIn,
}: {
  browserSignIn?: { url: string; securityKey: string } | null;
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
    } else if (browserSignIn) {
      setWgUrl(browserSignIn.url);
      setWgKey(browserSignIn.securityKey);
    }
  }, [state, browserSignIn]);

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
      <Sheet
        scroll
        visible={state === "totp"}
        onClose={onCancel}
        icon={<ShieldCheck size={22} color={color("accent-brand")} />}
        title={tr("sessions.shared.authDialogs.twoFactorAuthentication")}
        description={tr("sessions.shared.authDialogs.enterThe6DigitCode")}
        footer={
          <View className="flex-row gap-2">
            <Button variant="muted" className="flex-1" onPress={onCancel}>
              {tr("sessions.shared.authDialogs.cancel")}
            </Button>
            <Button
              variant="default"
              className="flex-1"
              onPress={submitTotp}
              loading={totpBusy}
              disabled={code.trim().length < 6}
            >
              {tr("sessions.shared.authDialogs.verify")}
            </Button>
          </View>
        }
      >
        <SheetBody>
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
              className={`text-xs ${totpExpiringSoon ? "text-destructive-text" : "text-muted-foreground"}`}
            >
              {totpExpiringSoon
                ? tr("sessions.shared.authDialogs.codeExpiresInSGet", {
                    totpCountdown,
                  })
                : `${totpCountdown}s remaining`}
            </Text>
          </View>
          {errorMessage ? (
            <Text className="mt-2 text-xs text-destructive-text">
              {errorMessage}
            </Text>
          ) : null}
        </SheetBody>
      </Sheet>

      {/* Warpgate */}
      <Sheet
        scroll
        visible={state === "warpgate"}
        onClose={onCancel}
        icon={<KeyRound size={22} color={color("accent-brand")} />}
        title={tr("sessions.shared.authDialogs.warpgateAuthentication")}
        description={tr(
          "sessions.shared.authDialogs.confirmTheWarpgateAuthenticationUrl",
        )}
        footer={
          <View className="flex-row gap-2">
            <Button variant="muted" className="flex-1" onPress={onCancel}>
              {tr("sessions.shared.authDialogs.cancel")}
            </Button>
            <Button
              variant="default"
              className="flex-1"
              onPress={submitWarpgate}
              loading={wgBusy}
              disabled={!wgUrl.trim()}
            >
              {tr("sessions.shared.authDialogs.authenticate")}
            </Button>
          </View>
        }
      >
        <SheetBody>
          <View className="gap-2">
            <Input
              value={wgUrl}
              onChangeText={setWgUrl}
              placeholder={tr("sessions.shared.authDialogs.warpgateUrl")}
              autoCapitalize="none"
            />
            <Input
              value={wgKey}
              onChangeText={setWgKey}
              placeholder={tr(
                "sessions.shared.authDialogs.securityKeyOptional",
              )}
              autoCapitalize="none"
              secureTextEntry
            />
          </View>
          {errorMessage ? (
            <Text className="mt-2 text-xs text-destructive-text">
              {errorMessage}
            </Text>
          ) : null}
        </SheetBody>
      </Sheet>

      {/* Interactive auth */}
      <Sheet
        scroll
        visible={state === "auth"}
        onClose={onCancel}
        icon={<Lock size={22} color={color("accent-brand")} />}
        title={tr("sessions.shared.authDialogs.authenticationRequired")}
        description={tr(
          "sessions.shared.authDialogs.thisHostNeedsCredentialsTo",
        )}
        footer={
          <View className="flex-row gap-2">
            <Button variant="muted" className="flex-1" onPress={onCancel}>
              {tr("sessions.shared.authDialogs.cancel")}
            </Button>
            <Button
              variant="default"
              className="flex-1"
              onPress={submitAuth}
              loading={authBusy}
              disabled={
                authMethod === "password" ? !authPassword : !authKey.trim()
              }
            >
              {tr("sessions.shared.authDialogs.connect")}
            </Button>
          </View>
        }
      >
        <SheetBody>
          <Tabs<"password" | "key">
            options={[
              {
                id: "password",
                label: tr("sessions.shared.authDialogs.password"),
              },
              { id: "key", label: tr("sessions.shared.authDialogs.sshKey") },
            ]}
            value={authMethod}
            onChange={setAuthMethod}
            className="mb-3"
          />
          {authMethod === "password" ? (
            <Input
              value={authPassword}
              onChangeText={setAuthPassword}
              placeholder={tr("sessions.shared.authDialogs.password")}
              secureTextEntry
              autoCapitalize="none"
              autoFocus
            />
          ) : (
            <View className="gap-2">
              <Input
                value={authKey}
                onChangeText={setAuthKey}
                placeholder={tr("sessions.shared.authDialogs.pastePrivateKey")}
                multiline
                numberOfLines={4}
                autoCapitalize="none"
                style={{ minHeight: 90, textAlignVertical: "top" }}
              />
              <Input
                value={authKeyPassword}
                onChangeText={setAuthKeyPassword}
                placeholder={tr(
                  "sessions.shared.authDialogs.keyPassphraseOptional",
                )}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>
          )}
          {errorMessage ? (
            <Text className="mt-2 text-xs text-destructive-text">
              {errorMessage}
            </Text>
          ) : null}
        </SheetBody>
      </Sheet>
    </>
  );
}
