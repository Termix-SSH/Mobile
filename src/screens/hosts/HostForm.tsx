import { useEffect, useMemo, useRef, useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { Upload, Trash2 } from "lucide-react-native";
import * as DocumentPicker from "expo-document-picker";
import { SSHHost, SSHHostData, Credential, TunnelConnection } from "@/types";
import {
  Text,
  Input,
  Button,
  Label,
  FakeSwitch,
  SettingRow,
  Tabs,
  InlineView,
} from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useCapability, useHostToggles } from "@/core/features";
import { toast } from "@/utils/toast";
import { TailscaleDevicePicker } from "@/features/tailscale/TailscaleDevices";
import { tailnetAddress } from "@/features/tailscale/tailscale";
import { useRepositories } from "@/core/data/hooks";
import { readLocalText } from "@/utils/localFile";

type AuthType = "password" | "key" | "credential" | "none" | "tailscale";
// Feature tabs (tunnels, rdp, ...) come from registered host switches.
type TabId = string;

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
  macAddress: string;
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
  macAddress: "",
  folder: "",
  tags: "",
  pin: false,
  notes: "",
};

export default function HostForm({
  visible,
  host,
  draft,
  onClose,
  onSaved,
}: {
  visible: boolean;
  host: SSHHost | null;
  draft?: Partial<SSHHost>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const color = useThemeColor();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [allHosts, setAllHosts] = useState<SSHHost[]>([]);
  const [tunnels, setTunnels] = useState<TunnelConnection[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const isEdit = !!host;
  const hostToggles = useHostToggles();
  const canWake = useCapability("host.wake");
  const hasDefaultPath = useCapability("files.defaultPath");
  const tailscaleAvailable = useCapability("hosts.discovery");
  // The name a Tailscale draft or device pick filled in, so picking another
  // device can replace it without overwriting a name the user typed.
  const autoNameRef = useRef("");

  const repos = useRepositories();
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Load credentials list for the credential picker.
  useEffect(() => {
    if (!visible) return;
    repos.credentials
      .list()
      .then(setCredentials)
      .catch(() => {});
    repos.hosts
      .list()
      .then(setAllHosts)
      .catch(() => {});
  }, [visible, repos]);

  // Populate the form when opening (prefill secrets on edit) and reset the tab.
  useEffect(() => {
    if (!visible) return;
    setActiveTab("general");
    const source = host ?? draft;
    autoNameRef.current = host ? "" : (draft?.name ?? "");
    if (!source) {
      setForm(EMPTY);
      setTunnels([]);
      return;
    }
    setTunnels(source.tunnelConnections ?? []);
    // Start from the known fields, then enrich with resolved secrets.
    setForm({
      ...EMPTY,
      name: source.name ?? "",
      ip: source.ip ?? "",
      port: String(source.port ?? source.sshPort ?? 22),
      enableSsh: source.enableSsh !== false,
      enableRdp: !!source.enableRdp,
      enableVnc: !!source.enableVnc,
      enableTelnet: !!source.enableTelnet,
      username: source.username ?? "",
      authType: source.authType ?? "password",
      credentialId: source.credentialId,
      enableTerminal: source.enableTerminal !== false,
      enableTunnel: !!source.enableTunnel,
      enableFileManager: host
        ? !!host.enableFileManager
        : (draft?.enableFileManager ?? EMPTY.enableFileManager),
      enableDocker: !!source.enableDocker,
      defaultPath: source.defaultPath || "/",
      rdpUser: source.rdpUser ?? "Administrator",
      rdpDomain: source.rdpDomain ?? "",
      rdpPort: String(source.rdpPort ?? 3389),
      vncUser: source.vncUser ?? "",
      vncPort: String(source.vncPort ?? 5900),
      telnetUser: source.telnetUser ?? "",
      telnetPort: String(source.telnetPort ?? 23),
      macAddress: source.macAddress ?? "",
      folder: source.folder ?? "",
      tags: (source.tags ?? []).join(", "),
      pin: !!source.pin,
      notes: source.notes ?? "",
    });
    if (!host) return;
    let cancelled = false;
    repos.hosts
      .get(host.id)
      .then((full) => {
        if (!full || cancelled) return;
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
    return () => {
      cancelled = true;
    };
  }, [visible, host, draft, repos]);

  // The tab strip: General is always present; feature tabs follow their switch.
  const tabs = useMemo<{ id: TabId; label: string }[]>(() => {
    const list: { id: TabId; label: string }[] = [
      { id: "general", label: "General" },
    ];
    if (form.enableSsh) list.push({ id: "ssh", label: "SSH" });
    const featureTabs = hostToggles
      .filter((t) => t.formTab && form[t.key as ToggleKey])
      .map((t) => t.formTab!)
      .sort((x, y) => x.order - y.order);
    for (const tab of featureTabs) list.push({ id: tab.id, label: tab.label });
    return list;
  }, [hostToggles, form]);

  type ToggleKey =
    | "enableSsh"
    | "enableRdp"
    | "enableVnc"
    | "enableTelnet"
    | "enableTerminal"
    | "enableFileManager"
    | "enableTunnel"
    | "enableDocker";
  type Toggle = { key: ToggleKey; label: string; description?: string };
  const asToggle = (t: (typeof hostToggles)[number]): Toggle => ({
    key: t.key as ToggleKey,
    label: t.label,
    description: t.description,
  });
  const protocolToggles: Toggle[] = [
    { key: "enableSsh", label: "SSH", description: "Secure Shell" },
    ...hostToggles.filter((t) => t.group === "protocol").map(asToggle),
  ];
  const featureToggles: Toggle[] = hostToggles
    .filter((t) => t.group === "feature")
    .map(asToggle);

  // If the active tab's protocol gets disabled, fall back to General.
  useEffect(() => {
    if (!tabs.some((t) => t.id === activeTab)) setActiveTab("general");
  }, [tabs, activeTab]);

  // Tunnels are resolved by endpoint host name at connect time, so the picker
  // only offers other saved hosts.
  const endpointOptions = useMemo(
    () =>
      allHosts
        .filter((h) => h.id !== host?.id)
        .map((h) => ({
          id: h.name || `${h.username}@${h.ip}`,
          label: h.name || h.ip,
        })),
    [allHosts, host?.id],
  );

  const setTunnel = (idx: number, patch: Partial<TunnelConnection>) =>
    setTunnels((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    );

  const removeTunnel = (idx: number) =>
    setTunnels((prev) => prev.filter((_, i) => i !== idx));

  const addTunnel = () =>
    setTunnels((prev) => [
      ...prev,
      {
        mode: "local",
        sourcePort: 8080,
        endpointHost: endpointOptions[0]?.id ?? "",
        endpointPort: 80,
        bindHost: "127.0.0.1",
        maxRetries: 3,
        retryInterval: 10,
        autoStart: false,
      },
    ]);

  const pickKeyFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const text = await readLocalText(asset.uri);
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
      // Fields this form does not edit; keep what the host already has.
      quickActions: host?.quickActions,
      statsConfig: host?.statsConfig,
      terminalConfig: host?.terminalConfig,
      overrideCredentialUsername: host?.overrideCredentialUsername,
      forceKeyboardInteractive: host?.forceKeyboardInteractive,
      tunnelConnections: tunnels,
      notes: form.notes,
      macAddress: form.macAddress.trim(),
      enableSsh: form.enableSsh,
      enableRdp: form.enableRdp,
      enableVnc: form.enableVnc,
      enableTelnet: form.enableTelnet,
      // Protocol fields - the backend null-guards these by their enable flag.
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
        await repos.hosts.update(host.id, payload);
        toast.success("Host updated");
      } else {
        await repos.hosts.create(payload);
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
    <InlineView
      open={visible}
      onClose={onClose}
      title={isEdit ? "Edit host" : "New host"}
      subtitle={isEdit ? host?.name : undefined}
      scroll={false}
      bare
      footer={
        <View className="flex-row gap-2">
          <Button variant="muted" className="flex-1" onPress={onClose}>
            Cancel
          </Button>
          <Button
            variant="default"
            className="flex-1"
            loading={saving}
            onPress={handleSave}
          >
            Save
          </Button>
        </View>
      }
    >
      <Tabs
        options={tabs}
        value={activeTab}
        onChange={setActiveTab}
        fill={tabs.length <= 4}
      />

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          gap: 14,
          paddingBottom: 24,
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
              {canWake ? (
                <Field label="MAC Address (for Wake-on-LAN)">
                  <Input
                    value={form.macAddress}
                    onChangeText={(v) => set("macAddress", v)}
                    placeholder="00:1A:2B:3C:4D:5E"
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                </Field>
              ) : null}
            </Section>

            {/* Protocols */}
            <Section title="Protocols">
              <View>
                {protocolToggles.map((row, i) => (
                  <SettingRow
                    key={row.key}
                    label={row.label}
                    description={row.description}
                    last={i === protocolToggles.length - 1}
                  >
                    <FakeSwitch
                      checked={form[row.key]}
                      onChange={(v) => set(row.key, v)}
                    />
                  </SettingRow>
                ))}
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
              <Tabs<AuthType>
                value={form.authType}
                onChange={(v) => set("authType", v)}
                options={[
                  { id: "password", label: "Pass" },
                  { id: "key", label: "Key" },
                  { id: "credential", label: "Cred" },
                  { id: "none", label: "None" },
                  ...(tailscaleAvailable || form.authType === "tailscale"
                    ? [{ id: "tailscale" as const, label: "Tailscale" }]
                    : []),
                ]}
              />

              {form.authType === "tailscale" ? (
                <>
                  <Text className="text-xs text-muted-foreground">
                    Connects with Tailscale SSH; no password or key is stored.
                  </Text>
                  {tailscaleAvailable ? (
                    <TailscaleDevicePicker
                      address={form.ip}
                      onSelect={(device) =>
                        setForm((current) => {
                          const ip = tailnetAddress(device);
                          const typed = current.name.trim();
                          if (typed && typed !== autoNameRef.current) {
                            return { ...current, ip };
                          }
                          const name = device.hostname || device.name || ip;
                          autoNameRef.current = name;
                          return { ...current, ip, name };
                        })
                      }
                    />
                  ) : (
                    <Text className="text-xs text-muted-foreground">
                      Tailscale is unavailable on this server. This host keeps
                      its Tailscale authentication setting.
                    </Text>
                  )}
                </>
              ) : null}

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
                      variant="muted"
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

            {featureToggles.length > 0 ? (
              <Section title="Features">
                <View>
                  {featureToggles.map((row, i) => (
                    <SettingRow
                      key={row.key}
                      label={row.label}
                      last={i === featureToggles.length - 1}
                    >
                      <FakeSwitch
                        checked={form[row.key]}
                        onChange={(v) => set(row.key, v)}
                      />
                    </SettingRow>
                  ))}
                </View>
                {form.enableFileManager && hasDefaultPath ? (
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
            ) : null}
          </>
        ) : null}

        {activeTab === "tunnels" ? (
          <Section title="Tunnels">
            {tunnels.length === 0 ? (
              <Text className="text-[11px] text-muted-foreground">
                No tunnels yet. Add one to forward a port from the endpoint host
                to this host.
              </Text>
            ) : null}

            {tunnels.map((tunnel, idx) => (
              <View key={idx} className="gap-2.5 border border-border p-3">
                <View className="flex-row items-center justify-between">
                  <Text weight="bold" className="text-xs">
                    Tunnel {idx + 1}
                  </Text>
                  <Pressable
                    onPress={() => removeTunnel(idx)}
                    hitSlop={8}
                    className="border border-destructive/40 p-1.5 active:bg-destructive/10"
                  >
                    <Trash2 size={14} color={color("destructive")} />
                  </Pressable>
                </View>

                <Field label="Endpoint Host">
                  <Tabs<string>
                    value={tunnel.endpointHost ?? ""}
                    onChange={(v) => setTunnel(idx, { endpointHost: v })}
                    options={endpointOptions}
                    fill={false}
                  />
                </Field>

                <View className="flex-row gap-2.5">
                  <View className="flex-1">
                    <Field label="Source Port">
                      <Input
                        value={String(tunnel.sourcePort ?? "")}
                        onChangeText={(v) =>
                          setTunnel(idx, {
                            sourcePort: Number(v.replace(/\D/g, "")) || 0,
                          })
                        }
                        keyboardType="number-pad"
                        placeholder="8080"
                      />
                    </Field>
                  </View>
                  <View className="flex-1">
                    <Field label="Endpoint Port">
                      <Input
                        value={String(tunnel.endpointPort ?? "")}
                        onChangeText={(v) =>
                          setTunnel(idx, {
                            endpointPort: Number(v.replace(/\D/g, "")) || 0,
                          })
                        }
                        keyboardType="number-pad"
                        placeholder="80"
                      />
                    </Field>
                  </View>
                </View>

                <View className="flex-row gap-2.5">
                  <View className="flex-1">
                    <Field label="Max Retries">
                      <Input
                        value={String(tunnel.maxRetries ?? "")}
                        onChangeText={(v) =>
                          setTunnel(idx, {
                            maxRetries: Number(v.replace(/\D/g, "")) || 0,
                          })
                        }
                        keyboardType="number-pad"
                        placeholder="3"
                      />
                    </Field>
                  </View>
                  <View className="flex-1">
                    <Field label="Retry Interval (s)">
                      <Input
                        value={String(tunnel.retryInterval ?? "")}
                        onChangeText={(v) =>
                          setTunnel(idx, {
                            retryInterval: Number(v.replace(/\D/g, "")) || 0,
                          })
                        }
                        keyboardType="number-pad"
                        placeholder="10"
                      />
                    </Field>
                  </View>
                </View>

                <SettingRow label="Auto start" last>
                  <FakeSwitch
                    checked={!!tunnel.autoStart}
                    onChange={(v) => setTunnel(idx, { autoStart: v })}
                  />
                </SettingRow>
              </View>
            ))}

            <Button variant="muted" size="sm" onPress={addTunnel}>
              Add Tunnel
            </Button>
          </Section>
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
    </InlineView>
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
