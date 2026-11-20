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
import { t } from "@/i18n";

type AuthType = "password" | "key";

/**
 * Quick Connect - open an ad-hoc SSH terminal without saving the host.
 * Builds a transient SSHHost (negative id) and starts a terminal session
 * directly.
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
      toast.error(t("hosts.quickConnect.hostAndUsernameAreRequired"));
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
        .then(() => toast.success(t("hosts.quickConnect.hostSaved")))
        .catch((e) =>
          toast.error(
            e?.message || t("hosts.quickConnect.couldNotSaveTheHost"),
          ),
        );
    }
    onClose();
    reset();
    navigateToSessions(transient, features.defaultSessionType());
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t("hosts.quickConnect.quickConnect")}
      description={t("hosts.quickConnect.connectToAHostWithout")}
      icon={<Zap size={15} color={color("accent-brand")} />}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row gap-2.5">
          <View className="flex-[3] gap-1.5">
            <Label>{t("hosts.quickConnect.hostIp")}</Label>
            <Input
              value={ip}
              onChangeText={changeAddress}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="user@192.168.1.10:22"
            />
          </View>
          <View className="flex-1 gap-1.5">
            <Label>{t("hosts.quickConnect.port")}</Label>
            <Input
              value={port}
              onChangeText={(v) => setPort(v.replace(/\D/g, ""))}
              keyboardType="number-pad"
            />
          </View>
        </View>

        <View className="gap-1.5">
          <Label>{t("hosts.quickConnect.username")}</Label>
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
            { id: "password", label: t("hosts.quickConnect.password") },
            { id: "key", label: t("hosts.quickConnect.key") },
          ]}
        />

        {authType === "password" ? (
          <View className="gap-1.5">
            <Label>{t("hosts.quickConnect.password")}</Label>
            <Input
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>
        ) : (
          <View className="gap-1.5">
            <Label>{t("hosts.quickConnect.privateKey")}</Label>
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
          label={t("hosts.quickConnect.saveToMyHosts")}
          description={t("hosts.quickConnect.keepThisHostAfterConnecting")}
          last
        >
          <FakeSwitch
            checked={save}
            onChange={setSave}
            accessibilityLabel={t("hosts.quickConnect.saveToMyHosts")}
          />
        </SettingRow>

        {/* Actions */}
        <View className="flex-row justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onPress={onClose}>
            {t("hosts.quickConnect.cancel")}
          </Button>
          <Button variant="default" size="sm" onPress={connect}>
            {t("hosts.quickConnect.connect")}
          </Button>
        </View>
      </ScrollView>
    </Sheet>
  );
}
