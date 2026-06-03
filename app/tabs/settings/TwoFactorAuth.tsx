import { useState, useEffect } from "react";
import { KeyboardAvoidingView, Platform, View, ScrollView, Image , Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ShieldCheck, ShieldOff, Copy, KeyRound } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import {
  setupTOTP,
  enableTOTP,
  disableTOTP,
  getTOTPBackupCodes,
  getUserInfo,
} from "@/app/main-axios";
import { Text, Button, Input, Dialog } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { toast } from "@/app/utils/toast";

type TotpPhase = "idle" | "setup" | "backup";

export default function TwoFactorAuth() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const color = useThemeColor();

  const [totpEnabled, setTotpEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  // Setup flow
  const [phase, setPhase] = useState<TotpPhase>("idle");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  // Disable flow
  const [disableDialog, setDisableDialog] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableBusy, setDisableBusy] = useState(false);

  useEffect(() => {
    getUserInfo()
      .then((u) => setTotpEnabled(!!u.totp_enabled))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const startSetup = async () => {
    setBusy(true);
    try {
      const res = await setupTOTP();
      setQrCode(res.qr_code);
      setSecret(res.secret);
      setPhase("setup");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to start 2FA setup");
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async () => {
    if (verifyCode.trim().length < 6) return;
    setBusy(true);
    try {
      const res = await enableTOTP(verifyCode.trim());
      setBackupCodes(res.backup_codes ?? []);
      setTotpEnabled(true);
      setPhase("backup");
      toast.success("Two-factor authentication enabled");
    } catch (e: any) {
      toast.error(e?.message ?? "Invalid code — try again");
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setDisableBusy(true);
    try {
      await disableTOTP(disablePassword.trim() || undefined);
      setTotpEnabled(false);
      setDisableDialog(false);
      setDisablePassword("");
      toast.success("Two-factor authentication disabled");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to disable 2FA");
    } finally {
      setDisableBusy(false);
    }
  };

  const fetchBackupCodes = async () => {
    setBusy(true);
    try {
      const res = await getTOTPBackupCodes();
      setBackupCodes(res.backup_codes ?? []);
      setPhase("backup");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to fetch backup codes");
    } finally {
      setBusy(false);
    }
  };

  const copySecret = async () => {
    if (!secret) return;
    await Clipboard.setStringAsync(secret);
    toast.success("Secret copied");
  };

  const copyBackupCodes = async () => {
    await Clipboard.setStringAsync(backupCodes.join("\n"));
    toast.success("Backup codes copied");
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ArrowLeft size={20} color={color("foreground")} />
        </Pressable>
        <Text weight="bold" className="text-base text-foreground">
          Two-Factor Authentication
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        {loading ? (
          <Text className="text-sm text-muted-foreground">Loading…</Text>
        ) : phase === "setup" ? (
          <View className="gap-4">
            <Text className="text-sm text-muted-foreground">
              Scan this QR code with your authenticator app (Google Authenticator,
              Authy, etc.), then enter the 6-digit code to confirm.
            </Text>
            {qrCode ? (
              <View className="items-center">
                <Image
                  source={{ uri: qrCode }}
                  style={{ width: 200, height: 200 }}
                  resizeMode="contain"
                />
              </View>
            ) : null}
            {secret ? (
              <Pressable
                onPress={copySecret}
                className="flex-row items-center gap-2 border border-border bg-card p-3"
              >
                <Text className="flex-1 font-mono text-xs text-muted-foreground" numberOfLines={2}>
                  {secret}
                </Text>
                <Copy size={14} color={color("muted-foreground")} />
              </Pressable>
            ) : null}
            <Input
              value={verifyCode}
              onChangeText={(t) => setVerifyCode(t.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            <Button variant="accent" onPress={confirmEnable} loading={busy} disabled={verifyCode.trim().length < 6}>
              Verify &amp; Enable
            </Button>
            <Button variant="ghost" onPress={() => setPhase("idle")}>
              Cancel
            </Button>
          </View>
        ) : phase === "backup" ? (
          <View className="gap-4">
            <View className="flex-row items-center gap-2">
              <KeyRound size={18} color={color("accent-brand")} />
              <Text weight="bold" className="text-sm text-foreground">
                Save your backup codes
              </Text>
            </View>
            <Text className="text-xs text-muted-foreground">
              Store these somewhere safe. Each code can only be used once if you
              lose access to your authenticator.
            </Text>
            <View className="border border-border bg-card p-4 gap-1">
              {backupCodes.map((code) => (
                <Text key={code} className="font-mono text-sm text-foreground">
                  {code}
                </Text>
              ))}
            </View>
            <Button
              variant="outline"
              onPress={copyBackupCodes}
              icon={<Copy size={15} color={color("foreground")} />}
            >
              Copy all codes
            </Button>
            <Button variant="accent" onPress={() => setPhase("idle")}>
              Done
            </Button>
          </View>
        ) : (
          <View className="gap-4">
            <View className="flex-row items-center gap-3 border border-border bg-card p-4">
              {totpEnabled ? (
                <ShieldCheck size={22} color={color("accent-brand")} />
              ) : (
                <ShieldOff size={22} color={color("muted-foreground")} />
              )}
              <View className="flex-1">
                <Text weight="medium" className="text-sm text-foreground">
                  {totpEnabled ? "2FA is enabled" : "2FA is not enabled"}
                </Text>
                <Text className="mt-0.5 text-xs text-muted-foreground">
                  {totpEnabled
                    ? "Your account is protected with an authenticator app."
                    : "Add an extra layer of security to your account."}
                </Text>
              </View>
            </View>

            {totpEnabled ? (
              <View className="gap-2">
                <Button
                  variant="outline"
                  onPress={fetchBackupCodes}
                  loading={busy}
                  icon={<KeyRound size={15} color={color("foreground")} />}
                >
                  View backup codes
                </Button>
                <Button
                  variant="destructive"
                  onPress={() => setDisableDialog(true)}
                  icon={<ShieldOff size={15} color={color("destructive")} />}
                >
                  Disable 2FA
                </Button>
              </View>
            ) : (
              <Button
                variant="accent"
                onPress={startSetup}
                loading={busy}
                icon={<ShieldCheck size={15} color={color("background")} />}
              >
                Enable 2FA
              </Button>
            )}
          </View>
        )}
      </ScrollView>

      <Dialog
        visible={disableDialog}
        onClose={() => { setDisableDialog(false); setDisablePassword(""); }}
        icon={<ShieldOff size={20} color={color("destructive")} />}
        title="Disable Two-Factor Authentication"
        description="Enter your password to confirm. You can re-enable 2FA at any time."
        footer={
          <View className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onPress={() => { setDisableDialog(false); setDisablePassword(""); }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onPress={handleDisable}
              loading={disableBusy}
            >
              Disable
            </Button>
          </View>
        }
      >
        <Input
          value={disablePassword}
          onChangeText={setDisablePassword}
          placeholder="Your password"
          secureTextEntry
          autoCapitalize="none"
          autoFocus
        />
      </Dialog>
    </KeyboardAvoidingView>
  );
}
