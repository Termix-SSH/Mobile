import { useEffect, useMemo, useState } from "react";
import { Modal, View, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, Upload } from "lucide-react-native";
import * as DocumentPicker from "expo-document-picker";
import { SSHHost, SSHHostData, Credential } from "@/types";
import {
  createSSHHost,
  updateSSHHost,
  getSSHHostWithCredentials,
  getCredentials,
} from "@/app/main-axios";
import {
  Text,
  Input,
  Button,
  Label,
  FakeSwitch,
  SettingRow,
  SegmentedControl,
} from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { toast } from "@/app/utils/toast";

type AuthType = "password" | "key" | "credential" | "none";
type TabId = "general" | "ssh" | "rdp" | "vnc" | "telnet";

interface FormState {
  name: string;
  ip: string;
  port: string;
  // Protocols
  enableSsh: boolean;
  enableRdp: boolean;
  enableVnc: boolean;
  enableTelnet: boolean;
  // SSH
  username: string;
  authType: AuthType;
  password: string;
  key: string;
  keyPassword: string;
  credentialId?: number;
  enableTerminal: boolean;
  enableTunnel: boolean;
  enableFileManager: boolean;
  enableDocker: boolean;
  defaultPath: string;
  // RDP
  rdpUser: string;
  rdpPassword: string;
  rdpDomain: string;
  rdpPort: string;
  // VNC
  vncUser: string;
  vncPassword: string;
  vncPort: string;
  // Telnet
  telnetUser: string;
  telnetPassword: string;
  telnetPort: string;
  // Organization
  folder: string;
  tags: string;
  pin: boolean;
  notes: string;
}

const EMPTY: FormState = {
  name: "",
  ip: "",
  port: "22",
  enableSsh: true,
  enableRdp: false,
  enableVnc: false,
  enableTelnet: false,
  username: "",
  authType: "password",
  password: "",
  key: "",
  keyPassword: "",
  credentialId: undefined,
  enableTerminal: true,
  enableTunnel: false,
  enableFileManager: true,
  enableDocker: false,
  defaultPath: "/",
  rdpUser: "Administrator",
  rdpPassword: "",
  rdpDomain: "",
  rdpPort: "3389",
  vncUser: "",
  vncPassword: "",
  vncPort: "5900",
  telnetUser: "",
  telnetPassword: "",
  telnetPort: "23",
  folder: "",
  tags: "",
  pin: false,
  notes: "",
};

export default function HostForm({
  visible,
  host,
  onClose,
  onSaved,
}: {
  visible: boolean;
  host: SSHHost | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const color = useThemeColor();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const isEdit = !!host;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Load credentials list for the credential picker.
  useEffect(() => {
    if (!visible) return;
    getCredentials()
      .then((res) => {
        const list = Array.isArray(res) ? res : (res?.credentials ?? []);
        setCredentials(list);
      })
      .catch(() => {});
  }, [visible]);

  // Populate the form when opening (prefill secrets on edit) and reset the tab.
  useEffect(() => {
    if (!visible) return;
    setActiveTab("general");
    if (!host) {
      setForm(EMPTY);
      return;
    }
    // Start from the known fields, then enrich with resolved secrets.
    setForm({
      ...EMPTY,
      name: host.name ?? "",
      ip: host.ip ?? "",
      port: String(host.port ?? host.sshPort ?? 22),
      enableSsh: host.enableSsh !== false,
      enableRdp: !!host.enableRdp,
      enableVnc: !!host.enableVnc,
      enableTelnet: !!host.enableTelnet,
      username: host.username ?? "",
      authType: host.authType ?? "password",
      credentialId: host.credentialId,
      enableTerminal: host.enableTerminal !== false,
      enableTunnel: !!host.enableTunnel,
      enableFileManager: !!host.enableFileManager,
      enableDocker: !!host.enableDocker,
      defaultPath: host.defaultPath || "/",
      rdpUser: host.rdpUser ?? "Administrator",
      rdpDomain: host.rdpDomain ?? "",
      rdpPort: String(host.rdpPort ?? 3389),
      vncUser: host.vncUser ?? "",
      vncPort: String(host.vncPort ?? 5900),
      telnetUser: host.telnetUser ?? "",
      telnetPort: String(host.telnetPort ?? 23),
      folder: host.folder ?? "",
      tags: (host.tags ?? []).join(", "),
      pin: !!host.pin,
      notes: host.notes ?? "",
    });
    getSSHHostWithCredentials(host.id)
      .then((full) => {
        if (!full) return;
        setForm((f) => ({
          ...f,
          password: full.password ?? "",
          key: full.key ?? "",
          keyPassword: full.keyPassword ?? "",
          rdpPassword: full.rdpPassword ?? "",
          vncPassword: full.vncPassword ?? "",
          telnetPassword: full.telnetPassword ?? "",
        }));
      })
      .catch(() => {});
  }, [visible, host]);

  // The tab strip: General is always present; protocol tabs follow their toggle.
  const tabs = useMemo<{ id: TabId; label: string }[]>(() => {
    const list: { id: TabId; label: string }[] = [
      { id: "general", label: "General" },
    ];
    if (form.enableSsh) list.push({ id: "ssh", label: "SSH" });
    if (form.enableRdp) list.push({ id: "rdp", label: "RDP" });
    if (form.enableVnc) list.push({ id: "vnc", label: "VNC" });
    if (form.enableTelnet) list.push({ id: "telnet", label: "Telnet" });
    return list;
  }, [form.enableSsh, form.enableRdp, form.enableVnc, form.enableTelnet]);

  // If the active tab's protocol gets disabled, fall back to General.
  useEffect(() => {
    if (!tabs.some((t) => t.id === activeTab)) setActiveTab("general");
  }, [tabs, activeTab]);

  const pickKeyFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const text = await fetch(asset.uri).then((r) => r.text());
      set("key", text);
      toast.success(`Loaded ${asset.name}`);
    } catch {
      toast.error("Could not read key file");
    }
  };

  const handleSave = async () => {
    if (!form.ip.trim()) {
      toast.error("Host address is required");
      return;
    }
    if (
      !form.enableSsh &&
      !form.enableRdp &&
      !form.enableVnc &&
      !form.enableTelnet
    ) {
      toast.error("Enable at least one protocol");
      return;
    }
    if (form.enableSsh && form.authType !== "none" && !form.username.trim()) {
      toast.error("SSH username is required");
      return;
    }

    const payload: SSHHostData = {
      name: form.name.trim() || form.ip.trim(),
      ip: form.ip.trim(),
      port: parseInt(form.port, 10) || 22,
      username: form.username.trim(),
      folder: form.folder.trim(),
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      pin: form.pin,
      authType: form.authType,
      password: form.authType === "password" ? form.password : undefined,
      key: form.authType === "key" ? (form.key as any) : undefined,
      keyPassword: form.authType === "key" ? form.keyPassword : undefined,
      credentialId:
        form.authType === "credential" ? form.credentialId : undefined,
      enableTerminal: form.enableTerminal,
      enableTunnel: form.enableTunnel,
      enableFileManager: form.enableFileManager,
      enableDocker: form.enableDocker,
      defaultPath: form.defaultPath,
      jumpHosts: host?.jumpHosts ?? [],
      notes: form.notes,
      enableSsh: form.enableSsh,
      enableRdp: form.enableRdp,
      enableVnc: form.enableVnc,
      enableTelnet: form.enableTelnet,
      // Protocol fields — the backend null-guards these by their enable flag.
      rdpUser: form.rdpUser,
      rdpPassword: form.rdpPassword,
      rdpDomain: form.rdpDomain,
      rdpPort: parseInt(form.rdpPort, 10) || 3389,
      vncUser: form.vncUser,
      vncPassword: form.vncPassword,
      vncPort: parseInt(form.vncPort, 10) || 5900,
      telnetUser: form.telnetUser,
      telnetPassword: form.telnetPassword,
      telnetPort: parseInt(form.telnetPort, 10) || 23,
    };

    setSaving(true);
    try {
      if (isEdit && host) {
        await updateSSHHost(host.id, payload);
        toast.success("Host updated");
      } else {
        await createSSHHost(payload);
        toast.success("Host created");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save host");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        {/* Header */}
        <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
          <Pressable
            onPress={onClose}
            hitSlop={8}
            className="flex-row items-center gap-1.5"
          >
            <X size={18} color={color("foreground")} />
            <Text weight="medium" className="text-sm text-foreground">
              Cancel
            </Text>
          </Pressable>
          <Text weight="bold" className="text-base text-foreground">
            {isEdit ? "Edit Host" : "New Host"}
          </Text>
          <Button
            variant="accent"
            size="sm"
            loading={saving}
            onPress={handleSave}
          >
            Save
          </Button>
        </View>

        {/* Tab strip */}
        <View className="border-b border-border">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 12,
              gap: 6,
              paddingVertical: 8,
            }}
          >
            {tabs.map((tab) => {
              const active = tab.id === activeTab;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id)}
                  className={`border px-3.5 py-1.5 ${
                    active
                      ? "border-accent-brand/40 bg-accent-brand/10"
                      : "border-border active:bg-muted/40"
                  }`}
                >
                  <Text
                    weight="bold"
                    className={`text-[11px] uppercase tracking-wider ${
                      active ? "text-accent-brand" : "text-muted-foreground"
                    }`}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: 16,
            gap: 14,
            paddingBottom: insets.bottom + 40,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {activeTab === "general" ? (
            <>
              {/* Connection */}
              <Section title="Connection">
                <Field label="Name">
                  <Input
                    value={form.name}
                    onChangeText={(v) => set("name", v)}
                    placeholder="My Server"
                  />
                </Field>
                <View className="flex-row gap-2.5">
                  <View className="flex-[3]">
                    <Field label="Host / IP">
                      <Input
                        value={form.ip}
                        onChangeText={(v) => set("ip", v)}
                        placeholder="192.168.1.10"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </Field>
                  </View>
                  <View className="flex-1">
                    <Field label="SSH Port">
                      <Input
                        value={form.port}
                        onChangeText={(v) => set("port", v.replace(/\D/g, ""))}
                        keyboardType="number-pad"
                        placeholder="22"
                      />
                    </Field>
                  </View>
                </View>
              </Section>

              {/* Protocols */}
              <Section title="Protocols">
                <View>
                  <SettingRow label="SSH" description="Secure Shell">
                    <FakeSwitch
                      checked={form.enableSsh}
                      onChange={(v) => set("enableSsh", v)}
                    />
                  </SettingRow>
                  <SettingRow label="RDP" description="Remote Desktop">
                    <FakeSwitch
                      checked={form.enableRdp}
                      onChange={(v) => set("enableRdp", v)}
                    />
                  </SettingRow>
                  <SettingRow label="VNC">
                    <FakeSwitch
                      checked={form.enableVnc}
                      onChange={(v) => set("enableVnc", v)}
                    />
                  </SettingRow>
                  <SettingRow label="Telnet" last>
                    <FakeSwitch
                      checked={form.enableTelnet}
                      onChange={(v) => set("enableTelnet", v)}
                    />
                  </SettingRow>
                </View>
                <Text className="text-[11px] text-muted-foreground">
                  Enable a protocol to configure it in its own tab above.
                </Text>
              </Section>

              {/* Organization */}
              <Section title="Organization">
                <Field label="Folder">
                  <Input
                    value={form.folder}
                    onChangeText={(v) => set("folder", v)}
                    placeholder="Production"
                  />
                </Field>
                <Field label="Tags (comma separated)">
                  <Input
                    value={form.tags}
                    onChangeText={(v) => set("tags", v)}
                    placeholder="web, nginx"
                    autoCapitalize="none"
                  />
                </Field>
                <SettingRow label="Pin to top" last>
                  <FakeSwitch
                    checked={form.pin}
                    onChange={(v) => set("pin", v)}
                  />
                </SettingRow>
              </Section>

              {/* Notes */}
              <Section title="Notes">
                <Input
                  value={form.notes}
                  onChangeText={(v) => set("notes", v)}
                  multiline
                  placeholder="Notes about this host…"
                  style={{ minHeight: 70 }}
                />
              </Section>
            </>
          ) : null}

          {activeTab === "ssh" ? (
            <>
              <Section title="Authentication">
                <Field label="Username">
                  <Input
                    value={form.username}
                    onChangeText={(v) => set("username", v)}
                    placeholder="root"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Field>
                <SegmentedControl<AuthType>
                  value={form.authType}
                  onChange={(v) => set("authType", v)}
                  options={[
                    { id: "password", label: "Pass" },
                    { id: "key", label: "Key" },
                    { id: "credential", label: "Cred" },
                    { id: "none", label: "None" },
                  ]}
                />

                {form.authType === "password" ? (
                  <Field label="Password">
                    <Input
                      value={form.password}
                      onChangeText={(v) => set("password", v)}
                      secureTextEntry
                      placeholder={
                        isEdit ? "•••••• (unchanged if blank)" : "Password"
                      }
                      autoCapitalize="none"
                    />
                  </Field>
                ) : null}

                {form.authType === "key" ? (
                  <>
                    <View className="flex-row items-center justify-between">
                      <Label>Private Key</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onPress={pickKeyFile}
                        icon={<Upload size={13} color={color("foreground")} />}
                      >
                        Choose file
                      </Button>
                    </View>
                    <Input
                      value={form.key}
                      onChangeText={(v) => set("key", v)}
                      multiline
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={{ minHeight: 100 }}
                    />
                    <Field label="Key Passphrase (optional)">
                      <Input
                        value={form.keyPassword}
                        onChangeText={(v) => set("keyPassword", v)}
                        secureTextEntry
                        placeholder="Passphrase"
                        autoCapitalize="none"
                      />
                    </Field>
                  </>
                ) : null}

                {form.authType === "credential" ? (
                  <Field label="Credential">
                    {credentials.length === 0 ? (
                      <Text className="py-2 text-xs text-muted-foreground">
                        No saved credentials. Tap the key icon in Hosts to add
                        one.
                      </Text>
                    ) : (
                      <View className="gap-1.5">
                        {credentials.map((c) => {
                          const selected = form.credentialId === c.id;
                          return (
                            <Pressable
                              key={c.id}
                              onPress={() => set("credentialId", c.id)}
                              className={`border px-3 py-2.5 ${selected ? "border-accent-brand/40 bg-accent-brand/10" : "border-border bg-card"}`}
                            >
                              <Text
                                weight="medium"
                                className={`text-sm ${selected ? "text-accent-brand" : "text-foreground"}`}
                              >
                                {c.name}
                              </Text>
                              {c.username ? (
                                <Text className="text-[11px] text-muted-foreground">
                                  {c.username}
                                </Text>
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </Field>
                ) : null}
              </Section>

              <Section title="Features">
                <View>
                  <SettingRow label="Terminal">
                    <FakeSwitch
                      checked={form.enableTerminal}
                      onChange={(v) => set("enableTerminal", v)}
                    />
                  </SettingRow>
                  <SettingRow label="File Manager">
                    <FakeSwitch
                      checked={form.enableFileManager}
                      onChange={(v) => set("enableFileManager", v)}
                    />
                  </SettingRow>
                  <SettingRow label="Tunnels">
                    <FakeSwitch
                      checked={form.enableTunnel}
                      onChange={(v) => set("enableTunnel", v)}
                    />
                  </SettingRow>
                  <SettingRow label="Docker" last>
                    <FakeSwitch
                      checked={form.enableDocker}
                      onChange={(v) => set("enableDocker", v)}
                    />
                  </SettingRow>
                </View>
                {form.enableFileManager ? (
                  <Field label="Default Path">
                    <Input
                      value={form.defaultPath}
                      onChangeText={(v) => set("defaultPath", v)}
                      placeholder="/"
                      autoCapitalize="none"
                    />
                  </Field>
                ) : null}
              </Section>
            </>
          ) : null}

          {activeTab === "rdp" ? (
            <Section title="RDP">
              <Field label="Username">
                <Input
                  value={form.rdpUser}
                  onChangeText={(v) => set("rdpUser", v)}
                  placeholder="Administrator"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Field>
              <Field label="Password">
                <Input
                  value={form.rdpPassword}
                  onChangeText={(v) => set("rdpPassword", v)}
                  secureTextEntry
                  placeholder={
                    isEdit ? "•••••• (unchanged if blank)" : "Password"
                  }
                  autoCapitalize="none"
                />
              </Field>
              <View className="flex-row gap-2.5">
                <View className="flex-[2]">
                  <Field label="Domain">
                    <Input
                      value={form.rdpDomain}
                      onChangeText={(v) => set("rdpDomain", v)}
                      placeholder="WORKGROUP"
                      autoCapitalize="none"
                    />
                  </Field>
                </View>
                <View className="flex-1">
                  <Field label="Port">
                    <Input
                      value={form.rdpPort}
                      onChangeText={(v) => set("rdpPort", v.replace(/\D/g, ""))}
                      keyboardType="number-pad"
                      placeholder="3389"
                    />
                  </Field>
                </View>
              </View>
              <AdvancedNote />
            </Section>
          ) : null}

          {activeTab === "vnc" ? (
            <Section title="VNC">
              <Field label="Username (optional)">
                <Input
                  value={form.vncUser}
                  onChangeText={(v) => set("vncUser", v)}
                  placeholder="vnc"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Field>
              <View className="flex-row gap-2.5">
                <View className="flex-[2]">
                  <Field label="Password">
                    <Input
                      value={form.vncPassword}
                      onChangeText={(v) => set("vncPassword", v)}
                      secureTextEntry
                      placeholder={
                        isEdit ? "•••••• (unchanged if blank)" : "Password"
                      }
                      autoCapitalize="none"
                    />
                  </Field>
                </View>
                <View className="flex-1">
                  <Field label="Port">
                    <Input
                      value={form.vncPort}
                      onChangeText={(v) => set("vncPort", v.replace(/\D/g, ""))}
                      keyboardType="number-pad"
                      placeholder="5900"
                    />
                  </Field>
                </View>
              </View>
              <AdvancedNote />
            </Section>
          ) : null}

          {activeTab === "telnet" ? (
            <Section title="Telnet">
              <Field label="Username">
                <Input
                  value={form.telnetUser}
                  onChangeText={(v) => set("telnetUser", v)}
                  placeholder="admin"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Field>
              <View className="flex-row gap-2.5">
                <View className="flex-[2]">
                  <Field label="Password">
                    <Input
                      value={form.telnetPassword}
                      onChangeText={(v) => set("telnetPassword", v)}
                      secureTextEntry
                      placeholder={
                        isEdit ? "•••••• (unchanged if blank)" : "Password"
                      }
                      autoCapitalize="none"
                    />
                  </Field>
                </View>
                <View className="flex-1">
                  <Field label="Port">
                    <Input
                      value={form.telnetPort}
                      onChangeText={(v) =>
                        set("telnetPort", v.replace(/\D/g, ""))
                      }
                      keyboardType="number-pad"
                      placeholder="23"
                    />
                  </Field>
                </View>
              </View>
              <AdvancedNote />
            </Section>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2.5">
      <Text
        weight="bold"
        className="text-[10px] uppercase tracking-[2px] text-muted-foreground/70"
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-1.5">
      <Label>{label}</Label>
      {children}
    </View>
  );
}

function AdvancedNote() {
  return (
    <Text className="pt-1 text-[11px] text-muted-foreground">
      Advanced display, audio, and clipboard settings are available in the
      Termix web app.
    </Text>
  );
}
