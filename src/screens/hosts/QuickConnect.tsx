import { useEffect, useState } from "react";
import { View, ScrollView } from "react-native";
import { Zap } from "lucide-react-native";
import { SSHHost } from "@/types";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import {
  Sheet,
  Input,
  Button,
  Label,
  Tabs,
  SettingRow,
  FakeSwitch,
} from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { features } from "@/core/features";
import { toast } from "@/utils/toast";
import { useRepositories } from "@/core/data/hooks";
import { formDefaults } from "@/core/hosts/defaults/form";
import { parseTarget, targetName } from "@/core/hosts/target";

type AuthType = "password" | "key";

/**
 * Quick Connect - open an ad-hoc SSH terminal without saving the host
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
  const [save, setSave] = useState(false);
  const repos = useRepositories();

  // Start from the user's defaults, like a new host.
  useEffect(() => {
    if (!visible || !repos.hostDefaults) return;
    let cancelled = false;
    repos.hostDefaults
      .index()
      .then((index) => {
        if (cancelled) return;
        const found = formDefaults(index, "");
        if (found.username) setUsername((u) => u || found.username!);
        if (found.port) setPort((p) => (p === "22" ? String(found.port) : p));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, repos]);

  // user@host:port typed or pasted into the address splits into the fields.
  const changeAddress = (value: string) => {
    const target = parseTarget(value);
    if (target && (target.user || target.port)) {
      setIp(target.host);
      if (target.user) setUsername(target.user);
      if (target.port) setPort(String(target.port));
      return;
    }
    setIp(value);
  };

  const reset = () => {
    setSave(false);
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
    if (save) {
      repos.hosts
        .create({
          name: targetName({ user: transient.username, host: transient.ip }),
          ip: transient.ip,
          port: transient.port,
          username: transient.username,
          authType,
          password: transient.password,
          key: transient.key as never,
          enableTerminal: true,
          enableFileManager: true,
          enableSsh: true,
        })
        .then(() => toast.success("Host saved"))
        .catch((e) => toast.error(e?.message || "Could not save the host"));
    }
    onClose();
    reset();
    navigateToSessions(transient, features.defaultSessionType());
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Quick connect"
      description="Connect to a host without saving it."
      icon={<Zap size={15} color={color("accent-brand")} />}
    >
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
              onChangeText={changeAddress}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="user@192.168.1.10:22"
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

        <Tabs<AuthType>
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

        <SettingRow
          label="Save to my hosts"
          description="Keep this host after connecting"
          last
        >
          <FakeSwitch
            checked={save}
            onChange={setSave}
            accessibilityLabel="Save to my hosts"
          />
        </SettingRow>

        {/* Actions */}
        <View className="flex-row justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onPress={onClose}>
            Cancel
          </Button>
          <Button variant="default" size="sm" onPress={connect}>
            Connect
          </Button>
        </View>
      </ScrollView>
    </Sheet>
  );
}
