import { useState } from "react";
import { View, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { Zap } from "lucide-react-native";
import { SSHHost } from "@/types";
import { useTerminalSessions } from "@/app/contexts/TerminalSessionsContext";
import {
  BottomSheet,
  Input,
  Button,
  Label,
  SegmentedControl,
  Text,
} from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { toast } from "@/app/utils/toast";

type AuthType = "password" | "key";

/**
 * Quick Connect — open an ad-hoc SSH terminal without saving the host
 * (Support issue #448). Builds a transient SSHHost (negative id) and starts a
 * terminal session directly.
 */
export function QuickConnect({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const color = useThemeColor();
  const { navigateToSessions } = useTerminalSessions();
  const [ip, setIp] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [authType, setAuthType] = useState<AuthType>("password");
  const [password, setPassword] = useState("");
  const [key, setKey] = useState("");

  const reset = () => {
    setIp("");
    setPort("22");
    setUsername("");
    setAuthType("password");
    setPassword("");
    setKey("");
  };

  const connect = () => {
    if (!ip.trim() || !username.trim()) {
      toast.error("Host and username are required");
      return;
    }
    const transient: SSHHost = {
      id: -Date.now(), // negative = unsaved/transient
      name: `${username.trim()}@${ip.trim()}`,
      ip: ip.trim(),
      port: parseInt(port, 10) || 22,
      username: username.trim(),
      folder: "",
      tags: [],
      pin: false,
      authType,
      password: authType === "password" ? password : undefined,
      key: authType === "key" ? key : undefined,
      enableTerminal: true,
      enableTunnel: false,
      enableFileManager: false,
      defaultPath: "/",
      tunnelConnections: [],
      createdAt: "",
      updatedAt: "",
    };
    onClose();
    reset();
    navigateToSessions(transient, "terminal");
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View className="flex-row items-center gap-2.5 border-b border-border px-4 pb-3 pt-1">
          <View className="h-8 w-8 shrink-0 items-center justify-center border border-border bg-muted">
            <Zap size={15} color={color("accent-brand")} />
          </View>
          <View className="min-w-0 flex-1">
            <Text weight="bold" className="text-base text-foreground">
              Quick Connect
            </Text>
            <Text className="text-xs text-muted-foreground">
              Connect to a host without saving it.
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row gap-2.5">
            <View className="flex-[3] gap-1.5">
              <Label>Host / IP</Label>
              <Input
                value={ip}
                onChangeText={setIp}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="192.168.1.10"
              />
            </View>
            <View className="flex-1 gap-1.5">
              <Label>Port</Label>
              <Input
                value={port}
                onChangeText={(v) => setPort(v.replace(/\D/g, ""))}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View className="gap-1.5">
            <Label>Username</Label>
            <Input
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="root"
            />
          </View>

          <SegmentedControl<AuthType>
            value={authType}
            onChange={setAuthType}
            options={[
              { id: "password", label: "Password" },
              { id: "key", label: "Key" },
            ]}
          />

          {authType === "password" ? (
            <View className="gap-1.5">
              <Label>Password</Label>
              <Input
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>
          ) : (
            <View className="gap-1.5">
              <Label>Private Key</Label>
              <Input
                value={key}
                onChangeText={setKey}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                style={{ minHeight: 120 }}
              />
            </View>
          )}

          {/* Actions */}
          <View className="flex-row justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onPress={onClose}>
              Cancel
            </Button>
            <Button variant="accent" size="sm" onPress={connect}>
              Connect
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}
