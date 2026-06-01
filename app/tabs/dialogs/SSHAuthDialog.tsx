import { useState, useEffect, useCallback } from "react";
import { View, Platform } from "react-native";
import { Lock } from "lucide-react-native";
import { Dialog, Input, Button, Text, SegmentedControl } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";

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
    ? `${hostInfo.name} · ${hostInfo.username}@${hostInfo.ip}:${hostInfo.port}`
    : `${hostInfo.username}@${hostInfo.ip}:${hostInfo.port}`;

  const reasonText =
    reason === "no_keyboard"
      ? "Keyboard-interactive auth is not available. Enter credentials directly."
      : reason === "auth_failed"
        ? "Authentication failed. Please re-enter your credentials."
        : "Connection timed out. Please try again with your credentials.";

  const bannerBg =
    reason === "auth_failed" || reason === "timeout"
      ? "bg-destructive/10 border-destructive/40"
      : "bg-yellow-500/10 border-yellow-500/40";
  const bannerText =
    reason === "auth_failed" || reason === "timeout"
      ? "text-destructive"
      : "text-yellow-400";

  return (
    <Dialog
      visible={visible}
      onClose={onCancel}
      icon={<Lock size={18} color={color("accent-brand")} />}
      title="SSH Authentication Required"
      description={hostLabel}
      footer={
        <View className="flex-row gap-2 flex-1">
          <Button variant="outline" className="flex-1" onPress={onCancel}>
            Cancel
          </Button>
          <Button
            variant="accent"
            className="flex-1"
            onPress={handleSubmit}
            disabled={!isValid}
          >
            Connect
          </Button>
        </View>
      }
    >
      <View className={`border rounded px-3 py-2.5 mb-3 ${bannerBg}`}>
        <Text className={`text-xs ${bannerText}`}>{reasonText}</Text>
      </View>

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
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
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
            placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\nPaste your private key here...\n-----END OPENSSH PRIVATE KEY-----"}
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
            placeholder="Key passphrase (optional)"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            onSubmitEditing={handleSubmit}
          />
        </View>
      )}
    </Dialog>
  );
}
