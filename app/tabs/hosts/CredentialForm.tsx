import { useEffect, useState } from "react";
import { Modal, View, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, Upload, Copy } from "lucide-react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Clipboard from "expo-clipboard";
import { Credential, CredentialData } from "@/types";
import {
  getCredentialDetails,
  createCredential,
  updateCredential,
  generateKeyPair,
  generatePublicKeyFromPrivate,
} from "@/app/main-axios";
import {
  Text,
  Input,
  Button,
  Label,
  SegmentedControl,
  AccordionSection,
} from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { toast } from "@/app/utils/toast";

type TabId = "general" | "auth";
type GeneratingKey = "ed25519" | "ecdsa" | "rsa" | null;

interface CredentialFormState {
  name: string;
  description: string;
  folder: string;
  tags: string;
  authType: "password" | "key";
  username: string;
  password: string;
  key: string;
  publicKey: string;
  keyPassword: string;
  certPublicKey: string;
}

const EMPTY: CredentialFormState = {
  name: "",
  description: "",
  folder: "",
  tags: "",
  authType: "password",
  username: "",
  password: "",
  key: "",
  publicKey: "",
  keyPassword: "",
  certPublicKey: "",
};

const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "auth", label: "Auth" },
];

export default function CredentialForm({
  visible,
  credential,
  onClose,
  onSaved,
}: {
  visible: boolean;
  credential: Credential | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const color = useThemeColor();
  const [form, setForm] = useState<CredentialFormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [keyExistsOnServer, setKeyExistsOnServer] = useState(false);
  const [generatingKey, setGeneratingKey] = useState<GeneratingKey>(null);
  const [generatingPublicKey, setGeneratingPublicKey] = useState(false);
  const isEdit = !!credential;

  const set = <K extends keyof CredentialFormState>(
    k: K,
    v: CredentialFormState[K],
  ) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!visible) return;
    setActiveTab("general");
    setKeyExistsOnServer(false);
    if (!credential) {
      setForm(EMPTY);
      return;
    }
    setForm({
      ...EMPTY,
      name: credential.name ?? "",
      description: credential.description ?? "",
      folder: credential.folder ?? "",
      tags: (credential.tags ?? []).join(", "),
      authType: credential.authType ?? "password",
      username: credential.username ?? "",
      publicKey: credential.publicKey ?? "",
    });
    getCredentialDetails(credential.id)
      .then((details: any) => {
        if (!details) return;
        setForm((f) => ({
          ...f,
          username: details.username ?? f.username,
          password: details.password ?? "",
          publicKey: details.publicKey ?? details.public_key ?? f.publicKey,
          keyPassword: details.keyPassword ?? details.key_password ?? "",
          certPublicKey: details.certPublicKey ?? "",
        }));
        const hasKey = !!(details.key || details.private_key || details.hasKey);
        setKeyExistsOnServer(hasKey);
      })
      .catch(() => {});
  }, [visible, credential]);

  const pickPrivateKeyFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const text = await fetch(result.assets[0].uri).then((r) => r.text());
      set("key", text.trim());
      setKeyExistsOnServer(false);
      toast.success(`Loaded ${result.assets[0].name}`);
    } catch {
      toast.error("Could not read key file");
    }
  };

  const pickCertFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const text = await fetch(result.assets[0].uri).then((r) => r.text());
      set("certPublicKey", text.trim());
      toast.success(`Loaded ${result.assets[0].name}`);
    } catch {
      toast.error("Could not read certificate file");
    }
  };

  const handleGenerateKeyPair = async (
    keyType: "ssh-ed25519" | "ssh-rsa" | "ecdsa-sha2-nistp256",
    keySize?: number,
    label?: GeneratingKey,
  ) => {
    const id = label ?? "ed25519";
    setGeneratingKey(id);
    try {
      const result = await generateKeyPair(
        keyType,
        keySize,
        form.keyPassword || undefined,
      );
      const priv = result.privateKey ?? result.private_key ?? "";
      const pub = result.publicKey ?? result.public_key ?? "";
      setForm((f) => ({ ...f, key: priv, publicKey: pub }));
      setKeyExistsOnServer(false);
      toast.success("Key pair generated");
    } catch (e: any) {
      toast.error(e?.message ?? "Key generation failed");
    } finally {
      setGeneratingKey(null);
    }
  };

  const handleGeneratePublicKey = async () => {
    if (!form.key && !keyExistsOnServer) {
      toast.error("Enter a private key first");
      return;
    }
    if (!form.key && keyExistsOnServer) {
      toast.error("Save the credential first, then regenerate");
      return;
    }
    setGeneratingPublicKey(true);
    try {
      const result = await generatePublicKeyFromPrivate(
        form.key,
        form.keyPassword || undefined,
      );
      set("publicKey", result.publicKey ?? result.public_key ?? "");
      toast.success("Public key generated");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate public key");
    } finally {
      setGeneratingPublicKey(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }

    const payload: CredentialData = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      folder: form.folder.trim() || undefined,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      authType: form.authType,
      username: form.username.trim(),
    };

    if (form.authType === "password") {
      if (form.password) payload.password = form.password;
    } else {
      if (form.key) payload.key = form.key;
      if (form.publicKey) payload.publicKey = form.publicKey;
      if (form.keyPassword) payload.keyPassword = form.keyPassword;
      if (form.certPublicKey)
        (payload as any).certPublicKey = form.certPublicKey;
    }

    setSaving(true);
    try {
      if (isEdit && credential) {
        await updateCredential(credential.id, payload);
        toast.success("Credential updated");
      } else {
        await createCredential(payload);
        toast.success("Credential created");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save credential");
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
            {isEdit ? "Edit Credential" : "New Credential"}
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
            {TABS.map((tab) => {
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
          {/* General Tab */}
          {activeTab === "general" ? (
            <Section title="Info">
              <Field label="Name">
                <Input
                  value={form.name}
                  onChangeText={(v) => set("name", v)}
                  placeholder="e.g. Production SSH Key"
                />
              </Field>
              <Field label="Description">
                <Input
                  value={form.description}
                  onChangeText={(v) => set("description", v)}
                  placeholder="Optional details…"
                />
              </Field>
              <Field label="Folder">
                <Input
                  value={form.folder}
                  onChangeText={(v) => set("folder", v)}
                  placeholder="e.g. Server Keys"
                />
              </Field>
              <Field label="Tags (comma separated)">
                <Input
                  value={form.tags}
                  onChangeText={(v) => set("tags", v)}
                  placeholder="production, linux"
                  autoCapitalize="none"
                />
              </Field>
            </Section>
          ) : null}

          {/* Auth Tab */}
          {activeTab === "auth" ? (
            <>
              <Section title="Credential Type">
                <SegmentedControl<"password" | "key">
                  value={form.authType}
                  onChange={(v) => set("authType", v)}
                  options={[
                    { id: "password", label: "Password" },
                    { id: "key", label: "SSH Key" },
                  ]}
                />
              </Section>

              {/* Password auth */}
              {form.authType === "password" ? (
                <Section title="Authentication">
                  <Field label="Username">
                    <Input
                      value={form.username}
                      onChangeText={(v) => set("username", v)}
                      placeholder="e.g. root or deploy"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </Field>
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
                </Section>
              ) : null}

              {/* SSH Key auth */}
              {form.authType === "key" ? (
                <>
                  <Section title="Authentication">
                    <Field label="Username">
                      <Input
                        value={form.username}
                        onChangeText={(v) => set("username", v)}
                        placeholder="e.g. root or deploy"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </Field>
                  </Section>

                  <Section title="Key Generation">
                    <View className="gap-2.5 border border-border bg-card px-3 py-3">
                      <View className="gap-0.5">
                        <Text
                          weight="medium"
                          className="text-sm text-foreground"
                        >
                          Generate new key pair
                        </Text>
                        <Text className="text-[10px] text-muted-foreground">
                          Replaces current private and public key
                        </Text>
                      </View>
                      <View className="flex-row flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          loading={generatingKey === "ed25519"}
                          onPress={() =>
                            handleGenerateKeyPair(
                              "ssh-ed25519",
                              undefined,
                              "ed25519",
                            )
                          }
                        >
                          Ed25519
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          loading={generatingKey === "ecdsa"}
                          onPress={() =>
                            handleGenerateKeyPair(
                              "ecdsa-sha2-nistp256",
                              undefined,
                              "ecdsa",
                            )
                          }
                        >
                          ECDSA
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          loading={generatingKey === "rsa"}
                          onPress={() =>
                            handleGenerateKeyPair("ssh-rsa", 2048, "rsa")
                          }
                        >
                          RSA 2048
                        </Button>
                      </View>
                    </View>
                  </Section>

                  <Section title="Private Key">
                    <View className="flex-row items-center justify-between">
                      <Label>Private Key</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onPress={pickPrivateKeyFile}
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
                    {isEdit && keyExistsOnServer && form.key === "" ? (
                      <Text className="text-[10px] text-muted-foreground">
                        Key saved — paste or upload to replace
                      </Text>
                    ) : null}
                  </Section>

                  <Section title="Public Key">
                    <View className="flex-row items-center justify-between">
                      <Label>Public Key (optional)</Label>
                      <View className="flex-row gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          loading={generatingPublicKey}
                          onPress={handleGeneratePublicKey}
                        >
                          Generate
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!form.publicKey}
                          onPress={() => {
                            Clipboard.setStringAsync(form.publicKey);
                            toast.success("Public key copied");
                          }}
                          icon={<Copy size={13} color={color("foreground")} />}
                        >
                          Copy
                        </Button>
                      </View>
                    </View>
                    <Input
                      value={form.publicKey}
                      onChangeText={(v) => set("publicKey", v)}
                      multiline
                      placeholder="ssh-ed25519 AAAA…"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={{ minHeight: 60 }}
                    />
                  </Section>

                  <Section title="Passphrase">
                    <Field label="Key Passphrase (optional)">
                      <Input
                        value={form.keyPassword}
                        onChangeText={(v) => set("keyPassword", v)}
                        secureTextEntry
                        placeholder="Passphrase (optional)"
                        autoCapitalize="none"
                      />
                    </Field>
                  </Section>

                  <AccordionSection label="CA Certificate" defaultOpen={false}>
                    <View className="gap-2.5 pt-3">
                      <View className="flex-row items-center justify-between">
                        <Text className="flex-1 pr-2 text-[10px] text-muted-foreground">
                          Certificate signed by a CA for certificate-based auth
                        </Text>
                        <Button
                          variant="outline"
                          size="sm"
                          onPress={pickCertFile}
                          icon={
                            <Upload size={13} color={color("foreground")} />
                          }
                        >
                          Upload
                        </Button>
                      </View>
                      <Input
                        value={form.certPublicKey}
                        onChangeText={(v) => set("certPublicKey", v)}
                        multiline
                        placeholder="ssh-ed25519-cert-v01@openssh.com AAAA…"
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={{ minHeight: 60 }}
                      />
                    </View>
                  </AccordionSection>
                </>
              ) : null}
            </>
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
