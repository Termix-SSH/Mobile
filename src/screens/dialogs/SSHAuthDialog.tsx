import { useState, useEffect, useCallback } from "react";
import { View, Platform } from "react-native";
import { Lock } from "lucide-react-native";
import { Sheet, SheetBody, Input, Button, Text, Tabs } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { t } from "@/i18n";

interface SSHAuthDialogProps {
  visible: boolean;
  onSubmit: (credentials: {
    password?: string;
    sshKey?: string;
    keyPassword?: string;
  }) => void;
  onCancel: () => void;
  hostInfo: {
    name?: string;
    ip: string;
    port: number;
    username: string;
  };
  reason: "no_keyboard" | "auth_failed" | "timeout";
}

export function SSHAuthDialog({
  visible,
  onSubmit,
  onCancel,
  hostInfo,
  reason,
}: SSHAuthDialogProps) {
  const color = useThemeColor();
  const [authMethod, setAuthMethod] = useState<"password" | "key">("password");
  const [password, setPassword] = useState("");
  const [sshKey, setSshKey] = useState("");
  const [keyPassword, setKeyPassword] = useState("");

  useEffect(() => {
    if (!visible) {
      setPassword("");
      setSshKey("");
      setKeyPassword("");
      setAuthMethod("password");
    }
  }, [visible]);

  const handleSubmit = useCallback(() => {
    if (authMethod === "password" && password.trim()) {
      onSubmit({ password });
    } else if (authMethod === "key" && sshKey.trim()) {
      onSubmit({ sshKey, keyPassword: keyPassword.trim() || undefined });
    }
  }, [authMethod, password, sshKey, keyPassword, onSubmit]);

  const isValid =
    authMethod === "password" ? !!password.trim() : !!sshKey.trim();

  const hostLabel = hostInfo.name
    ? `${hostInfo.name} | ${hostInfo.username}@${hostInfo.ip}:${hostInfo.port}`
    : `${hostInfo.username}@${hostInfo.ip}:${hostInfo.port}`;

  const reasonText =
    reason === "no_keyboard"
      ? t("dialogs.sSHAuthDialog.keyboardInteractiveAuthIsNot")
      : reason === "auth_failed"
        ? t("dialogs.sSHAuthDialog.authenticationFailedPleaseReEnter")
        : t("dialogs.sSHAuthDialog.connectionTimedOutPleaseTry");

  const bannerBg =
    reason === "auth_failed" || reason === "timeout"
      ? "bg-destructive/10 border-destructive/40"
      : "bg-yellow-500/10 border-yellow-500/40";
  const bannerText =
    reason === "auth_failed" || reason === "timeout"
      ? "text-destructive-text"
      : "text-yellow-400";

  return (
    <Sheet
      scroll
      visible={visible}
      onClose={onCancel}
      icon={<Lock size={18} color={color("accent-brand")} />}
      title={t("dialogs.sSHAuthDialog.sshAuthenticationRequired")}
      description={hostLabel}
      footer={
        <View className="flex-1 flex-row gap-2">
          <Button variant="muted" className="flex-1" onPress={onCancel}>
            {t("dialogs.sSHAuthDialog.cancel")}
          </Button>
          <Button
            variant="default"
            className="flex-1"
            onPress={handleSubmit}
            disabled={!isValid}
          >
            {t("dialogs.sSHAuthDialog.connect")}
          </Button>
        </View>
      }
    >
      <SheetBody>
        <View className={`mb-3 border px-3 py-2.5 ${bannerBg}`}>
          <Text className={`text-xs ${bannerText}`}>{reasonText}</Text>
        </View>

        <Tabs<"password" | "key">
          options={[
            { id: "password", label: t("dialogs.sSHAuthDialog.password") },
            { id: "key", label: t("dialogs.sSHAuthDialog.sshKey") },
          ]}
          value={authMethod}
          onChange={setAuthMethod}
          className="mb-3"
        />

        {authMethod === "password" ? (
          <Input
            value={password}
            onChangeText={setPassword}
            placeholder={t("dialogs.sSHAuthDialog.password")}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            autoFocus
            onSubmitEditing={handleSubmit}
          />
        ) : (
          <View className="gap-2">
            <Input
              value={sshKey}
              onChangeText={setSshKey}
              placeholder={t(
                "dialogs.sSHAuthDialog.beginOpensshPrivateKeyPaste",
              )}
              multiline
              numberOfLines={5}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              autoFocus
              style={{
                minHeight: 110,
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                fontSize: 12,
              }}
            />
            <Input
              value={keyPassword}
              onChangeText={setKeyPassword}
              placeholder={t("dialogs.sSHAuthDialog.keyPassphraseOptional")}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              onSubmitEditing={handleSubmit}
            />
          </View>
        )}
      </SheetBody>
    </Sheet>
  );
}
