import { useState, useEffect } from "react";
import { View, ScrollView, Image, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { ShieldCheck, ShieldOff, Copy, KeyRound } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { Text, Button, Input, Sheet, SheetBody } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { toast } from "@/utils/toast";
import { apiOf, useActiveClient } from "@/core/accounts";
import { Screen } from "@/components/Screen";
import { t as tr } from "@/i18n";

type TotpPhase = "idle" | "setup" | "backup";

export default function TwoFactorAuth() {
  const client = useActiveClient();
  const router = useRouter();
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
    apiOf(client)
      .auth.getUserInfo()
      .then((u) => setTotpEnabled(!!u.totp_enabled))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [client]);

  const startSetup = async () => {
    setBusy(true);
    try {
      const res = await apiOf(client).totp.setupTOTP();
      setQrCode(res.qr_code);
      setSecret(res.secret);
      setPhase("setup");
    } catch (e: any) {
      toast.error(
        e?.message ?? tr("settings.twoFactorAuth.failedToStart2faSetup"),
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async () => {
    if (verifyCode.trim().length < 6) return;
    setBusy(true);
    try {
      const res = await apiOf(client).totp.enableTOTP(verifyCode.trim());
      setBackupCodes(res.backup_codes ?? []);
      setTotpEnabled(true);
      setPhase("backup");
      toast.success(
        tr("settings.twoFactorAuth.twoFactorAuthenticationEnabled"),
      );
    } catch (e: any) {
      toast.error(
        e?.message ?? tr("settings.twoFactorAuth.invalidCodeTryAgain"),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setDisableBusy(true);
    try {
      await apiOf(client).totp.disableTOTP(disablePassword.trim() || undefined);
      setTotpEnabled(false);
      setDisableDialog(false);
      setDisablePassword("");
      toast.success(
        tr("settings.twoFactorAuth.twoFactorAuthenticationDisabled"),
      );
    } catch (e: any) {
      toast.error(
        e?.message ?? tr("settings.twoFactorAuth.failedToDisable2fa"),
      );
    } finally {
      setDisableBusy(false);
    }
  };

  const fetchBackupCodes = async () => {
    setBusy(true);
    try {
      const res = await apiOf(client).totp.getTOTPBackupCodes();
      setBackupCodes(res.backup_codes ?? []);
      setPhase("backup");
    } catch (e: any) {
      toast.error(
        e?.message ?? tr("settings.twoFactorAuth.failedToFetchBackupCodes"),
      );
    } finally {
      setBusy(false);
    }
  };

  const copySecret = async () => {
    if (!secret) return;
    await Clipboard.setStringAsync(secret);
    toast.success(tr("settings.twoFactorAuth.secretCopied"));
  };

  const copyBackupCodes = async () => {
    await Clipboard.setStringAsync(backupCodes.join("\n"));
    toast.success(tr("settings.twoFactorAuth.backupCodesCopied"));
  };

  return (
    <Screen
      title={tr("settings.twoFactorAuth.twoFactorAuthentication")}
      onBack={() => router.back()}
      keyboardAvoiding
    >
      <ScrollView
        contentContainerStyle={{ padding: 12, gap: 16, paddingBottom: 40 }}
      >
        {loading ? (
          <Text className="text-sm text-muted-foreground">
            {tr("settings.twoFactorAuth.loading")}
          </Text>
        ) : phase === "setup" ? (
          <View className="gap-4">
            <Text className="text-sm text-muted-foreground">
              {tr("settings.twoFactorAuth.scanThisQrCodeWith")}
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
                <Text
                  className="flex-1 font-mono text-xs text-muted-foreground"
                  numberOfLines={2}
                >
                  {secret}
                </Text>
                <Copy size={14} color={color("muted-foreground")} />
              </Pressable>
            ) : null}
            <Input
              value={verifyCode}
              onChangeText={(t) =>
                setVerifyCode(t.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            <Button
              variant="default"
              onPress={confirmEnable}
              loading={busy}
              disabled={verifyCode.trim().length < 6}
            >
              {tr("settings.twoFactorAuth.verifyAmpEnable")}
            </Button>
            <Button variant="ghost" onPress={() => setPhase("idle")}>
              {tr("settings.twoFactorAuth.cancel")}
            </Button>
          </View>
        ) : phase === "backup" ? (
          <View className="gap-4">
            <View className="flex-row items-center gap-2">
              <KeyRound size={18} color={color("accent-brand")} />
              <Text weight="bold" className="text-sm text-foreground">
                {tr("settings.twoFactorAuth.saveYourBackupCodes")}
              </Text>
            </View>
            <Text className="text-xs text-muted-foreground">
              {tr("settings.twoFactorAuth.storeTheseSomewhereSafeEach")}
            </Text>
            <View className="gap-1 border border-border bg-card p-4">
              {backupCodes.map((code) => (
                <Text key={code} className="font-mono text-sm text-foreground">
                  {code}
                </Text>
              ))}
            </View>
            <Button
              variant="muted"
              onPress={copyBackupCodes}
              icon={<Copy size={15} color={color("foreground")} />}
            >
              {tr("settings.twoFactorAuth.copyAllCodes")}
            </Button>
            <Button variant="default" onPress={() => setPhase("idle")}>
              {tr("settings.twoFactorAuth.done")}
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
                  {totpEnabled
                    ? tr("settings.twoFactorAuth.n2faIsEnabled")
                    : tr("settings.twoFactorAuth.n2faIsNotEnabled")}
                </Text>
                <Text className="mt-0.5 text-xs text-muted-foreground">
                  {totpEnabled
                    ? tr("settings.twoFactorAuth.yourAccountIsProtectedWith")
                    : tr("settings.twoFactorAuth.addAnExtraLayerOf")}
                </Text>
              </View>
            </View>

            {totpEnabled ? (
              <View className="gap-2">
                {/* 2.9+ servers only regenerate codes, they can't show old ones */}
                {!(client?.isPluginApi() ?? false) && (
                  <Button
                    variant="muted"
                    onPress={fetchBackupCodes}
                    loading={busy}
                    icon={<KeyRound size={15} color={color("foreground")} />}
                  >
                    {tr("settings.twoFactorAuth.viewBackupCodes")}
                  </Button>
                )}
                <Button
                  variant="destructive"
                  onPress={() => setDisableDialog(true)}
                  icon={<ShieldOff size={15} color={color("destructive")} />}
                >
                  {tr("settings.twoFactorAuth.disable2fa")}
                </Button>
              </View>
            ) : (
              <Button
                variant="default"
                onPress={startSetup}
                loading={busy}
                icon={<ShieldCheck size={15} color={color("background")} />}
              >
                {tr("settings.twoFactorAuth.enable2fa")}
              </Button>
            )}
          </View>
        )}
      </ScrollView>

      <Sheet
        scroll
        visible={disableDialog}
        onClose={() => {
          setDisableDialog(false);
          setDisablePassword("");
        }}
        icon={<ShieldOff size={20} color={color("destructive")} />}
        title={tr("settings.twoFactorAuth.disableTwoFactorAuthentication")}
        description={
          (client?.isPluginApi() ?? false)
            ? tr("settings.twoFactorAuth.enterACodeFromYour")
            : tr("settings.twoFactorAuth.enterYourPasswordToConfirm")
        }
        footer={
          <View className="flex-row gap-2">
            <Button
              variant="muted"
              className="flex-1"
              onPress={() => {
                setDisableDialog(false);
                setDisablePassword("");
              }}
            >
              {tr("settings.twoFactorAuth.cancel")}
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onPress={handleDisable}
              loading={disableBusy}
            >
              {tr("settings.twoFactorAuth.disable")}
            </Button>
          </View>
        }
      >
        <SheetBody>
          <Input
            value={disablePassword}
            onChangeText={setDisablePassword}
            placeholder={
              (client?.isPluginApi() ?? false)
                ? "000000"
                : tr("settings.twoFactorAuth.yourPassword")
            }
            secureTextEntry={!(client?.isPluginApi() ?? false)}
            keyboardType={
              (client?.isPluginApi() ?? false) ? "number-pad" : "default"
            }
            autoCapitalize="none"
            autoFocus
          />
        </SheetBody>
      </Sheet>
    </Screen>
  );
}
