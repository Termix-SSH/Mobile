import { useEffect, useState } from "react";
import { Modal, View, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
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
  AccordionSection,
  SegmentedControl,
} from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { toast } from "@/app/utils/toast";

type AuthType = "password" | "key" | "credential" | "none";

interface FormState {
  name: string;
  ip: string;
  port: string;
  username: string;
  folder: string;
  tags: string;
  pin: boolean;
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
  notes: string;
  enableRdp: boolean;
  enableVnc: boolean;
  enableTelnet: boolean;
}

const EMPTY: FormState = {
  name: "",
  ip: "",
  port: "22",
  username: "",
  folder: "",
  tags: "",
  pin: false,
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
  notes: "",
  enableRdp: false,
  enableVnc: false,
  enableTelnet: false,
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

  // Populate the form when opening (prefill secrets on edit).
  useEffect(() => {
    if (!visible) return;
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
      username: host.username ?? "",
      folder: host.folder ?? "",
      tags: (host.tags ?? []).join(", "),
      pin: !!host.pin,
      authType: host.authType ?? "password",
      credentialId: host.credentialId,
      enableTerminal: host.enableTerminal !== false,
      enableTunnel: !!host.enableTunnel,
      enableFileManager: !!host.enableFileManager,
      enableDocker: !!host.enableDocker,
      defaultPath: host.defaultPath || "/",
      notes: host.notes ?? "",
      enableRdp: !!host.enableRdp,
      enableVnc: !!host.enableVnc,
      enableTelnet: !!host.enableTelnet,
    });
    getSSHHostWithCredentials(host.id)
      .then((full) => {
        if (!full) return;
        setForm((f) => ({
          ...f,
          password: full.password ?? "",
          key: full.key ?? "",
          keyPassword: full.keyPassword ?? "",
        }));
      })
      .catch(() => {});
  }, [visible, host]);

  const handleSave = async () => {
    if (!form.ip.trim()) {
      toast.error("Host address is required");
      return;
    }
    if (!form.username.trim() && form.authType !== "none") {
      toast.error("Username is required");
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
      notes: form.notes,
      enableSsh: true,
      enableRdp: form.enableRdp,
      enableVnc: form.enableVnc,
      enableTelnet: form.enableTelnet,
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
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
          <Pressable onPress={onClose} hitSlop={8} className="flex-row items-center gap-1.5">
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

        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Connection */}
          <View className="gap-2.5">
            <Field label="Name">
              <Input value={form.name} onChangeText={(v) => set("name", v)} placeholder="My Server" />
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
                <Field label="Port">
                  <Input
                    value={form.port}
                    onChangeText={(v) => set("port", v.replace(/\D/g, ""))}
                    keyboardType="number-pad"
                    placeholder="22"
                  />
                </Field>
              </View>
            </View>
            <Field label="Username">
              <Input
                value={form.username}
                onChangeText={(v) => set("username", v)}
                placeholder="root"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </Field>
          </View>

          {/* Authentication */}
          <AccordionSection label="Authentication" defaultOpen>
            <View className="gap-3 pt-3">
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
                    placeholder={isEdit ? "•••••• (unchanged if blank)" : "Password"}
                    autoCapitalize="none"
                  />
                </Field>
              ) : null}

              {form.authType === "key" ? (
                <>
                  <Field label="Private Key">
                    <Input
                      value={form.key}
                      onChangeText={(v) => set("key", v)}
                      multiline
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={{ minHeight: 90, textAlignVertical: "top" }}
                    />
                  </Field>
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
                    <Text className="text-xs text-muted-foreground py-2">
                      No saved credentials. Create one in the Tools tab.
                    </Text>
                  ) : (
                    <View className="gap-1.5">
                      {credentials.map((c) => {
                        const selected = form.credentialId === c.id;
                        return (
                          <Pressable
                            key={c.id}
                            onPress={() => set("credentialId", c.id)}
                            className={`px-3 py-2.5 border ${selected ? "border-accent-brand/40 bg-accent-brand/10" : "border-border bg-card"}`}
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
            </View>
          </AccordionSection>

          {/* Organization */}
          <AccordionSection label="Organization">
            <View className="gap-2.5 pt-3">
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
                <FakeSwitch checked={form.pin} onChange={(v) => set("pin", v)} />
              </SettingRow>
            </View>
          </AccordionSection>

          {/* Features */}
          <AccordionSection label="Features">
            <View className="pt-1">
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
          </AccordionSection>

          {/* Protocols (remote desktop) */}
          <AccordionSection label="Remote Desktop">
            <View className="pt-1">
              <SettingRow label="RDP" description="Remote Desktop Protocol">
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
          </AccordionSection>

          {/* Notes */}
          <AccordionSection label="Notes">
            <View className="pt-3">
              <Input
                value={form.notes}
                onChangeText={(v) => set("notes", v)}
                multiline
                placeholder="Notes about this host…"
                style={{ minHeight: 70, textAlignVertical: "top" }}
              />
            </View>
          </AccordionSection>
        </ScrollView>
      </View>
    </Modal>
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
