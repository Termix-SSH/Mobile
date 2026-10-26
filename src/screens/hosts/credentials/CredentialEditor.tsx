import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Copy, KeyRound, Server, Upload } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import {
  AccordionSection,
  Button,
  Field,
  InlineView,
  Input,
  Label,
  Sheet,
  SheetBody,
  SheetRow,
  Tabs,
  Text,
  useConfirm,
} from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useCapability, useFeatureContext } from "@/core/features";
import { useRepositories } from "@/core/data/hooks";
import {
  generateKeyPair,
  PHONE_KEY_TYPES,
  type PhoneKeyType,
} from "@/core/keys/generate";
import type { TestTarget } from "@/core/transport/test";
import { readLocalText } from "@/utils/localFile";
import { keyStatus } from "@/utils/keyImport";
import { toast } from "@/utils/toast";
import type { Credential, CredentialData, SSHHost } from "@/types";
import { KeyInput } from "@/screens/hosts/keys/KeyInput";
import { TestConnection } from "@/screens/hosts/TestConnection";
import { TagsField } from "@/screens/hosts/editor/TagsField";
import { checkCertificate } from "./cert";
import {
  credentialError,
  credentialPayload,
  EMPTY_CREDENTIAL,
  formFromCredential,
  parseTestAddress,
  type CredentialForm,
} from "./model";

type KeySource = "load" | "generate";
type GenType = PhoneKeyType | "rsa2048" | "rsa4096";

export default function CredentialEditor({
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
  const color = useThemeColor();
  const confirm = useConfirm();
  const repos = useRepositories();
  const { client } = useFeatureContext();
  const serverKeyTools = useCapability("credentials.keyTools");
  const isEdit = !!credential;

  const [form, setForm] = useState<CredentialForm>(EMPTY_CREDENTIAL);
  // The saved key, kept out of the form so it isn't shown or sent again.
  const [savedKey, setSavedKey] = useState("");
  const [source, setSource] = useState<KeySource>("load");
  const [genType, setGenType] = useState<GenType>("ed25519");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testAddress, setTestAddress] = useState("");
  const [testHostId, setTestHostId] = useState<number>();
  const [pickHost, setPickHost] = useState(false);
  const [hosts, setHosts] = useState<SSHHost[]>([]);
  const start = useRef("");

  const set = useCallback(
    (patch: Partial<CredentialForm>) => setForm((f) => ({ ...f, ...patch })),
    [],
  );

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const first = formFromCredential(credential);
    setForm(first);
    setSavedKey("");
    setSource("load");
    setTestAddress("");
    setTestHostId(undefined);
    start.current = JSON.stringify(first);
    repos.hosts.list().then(
      (list) => !cancelled && setHosts(list),
      () => {},
    );
    if (credential) {
      repos.credentials
        .get(credential.id)
        .then((full) => {
          if (cancelled || !full) return;
          const filled = formFromCredential(full);
          setSavedKey(full.key ?? "");
          setForm(filled);
          start.current = JSON.stringify(filled);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [visible, credential, repos]);

  const activeKey = form.key || savedKey;
  const status = useMemo(
    () => keyStatus(activeKey, form.keyPassword),
    [activeKey, form.keyPassword],
  );
  const cert = useMemo(
    () =>
      checkCertificate(
        form.certPublicKey,
        status.kind === "ok" ? status.keyType : null,
      ),
    [form.certPublicKey, status],
  );

  const genOptions = [
    ...PHONE_KEY_TYPES,
    ...(serverKeyTools
      ? [
          { id: "rsa2048" as const, label: "RSA 2048" },
          { id: "rsa4096" as const, label: "RSA 4096" },
        ]
      : []),
  ];

  const generate = async () => {
    if (activeKey) {
      const ok = await confirm({
        title: "Replace the key?",
        description:
          "The new key takes the place of the current one. Hosts that only trust the old key will stop accepting this credential.",
        confirmLabel: "Replace",
        destructive: true,
      });
      if (!ok) return;
    }
    setGenerating(true);
    try {
      let next: { privateKey: string; publicKey: string };
      if (genType === "ed25519" || genType === "ecdsa") {
        // Lets the button show its spinner before the work starts.
        await new Promise((r) => setTimeout(r, 0));
        next = generateKeyPair(genType, {
          passphrase: form.keyPassword || undefined,
          comment: form.name.trim() || "termix",
        });
      } else {
        if (!client) throw new Error("RSA keys need a linked server.");
        const result = await client.api.keys.generateKeyPair(
          "ssh-rsa",
          genType === "rsa4096" ? 4096 : 2048,
          form.keyPassword || undefined,
        );
        next = {
          privateKey: result.privateKey ?? result.private_key ?? "",
          publicKey: result.publicKey ?? result.public_key ?? "",
        };
      }
      set({ key: next.privateKey, publicKey: next.publicKey });
      setSource("load");
      toast.success("New key made. Copy the public key to your hosts.");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not make a key");
    } finally {
      setGenerating(false);
    }
  };

  const pickCert = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      set({
        certPublicKey: (await readLocalText(result.assets[0].uri)).trim(),
      });
    } catch {
      toast.error("Could not read that certificate file");
    }
  };

  const onBeforeClose = async () =>
    JSON.stringify(form) === start.current ||
    (await confirm({
      title: "Leave without saving?",
      description: "Your changes to this credential will be lost.",
      confirmLabel: "Leave",
      destructive: true,
    }));

  const handleSave = async () => {
    const problem = credentialError(form, isEdit, !!savedKey);
    if (problem) {
      toast.error(problem);
      return;
    }
    const payload: CredentialData = credentialPayload(form);
    setSaving(true);
    try {
      if (isEdit && credential) {
        await repos.credentials.update(credential.id, payload);
        toast.success("Credential saved");
      } else {
        await repos.credentials.create(payload);
        toast.success("Credential added");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Could not save the credential");
    } finally {
      setSaving(false);
    }
  };

  const testTarget = async (): Promise<TestTarget | string> => {
    const where = parseTestAddress(testAddress);
    if (!where) return "Enter a host to test on, like 10.0.0.5 or box:2222.";
    if (!form.username.trim()) return "Enter the username first.";
    return {
      hostId: testHostId,
      ip: where.ip,
      port: where.port,
      username: form.username,
      authType: form.authType,
      password: form.password,
      key: activeKey,
      keyPassword: form.keyPassword,
      certificate: form.certPublicKey || undefined,
      name: where.ip,
      jumpHostIds: (
        hosts.find((h) => h.id === testHostId)?.jumpHosts ?? []
      ).map((j) => j.hostId),
    };
  };

  const icon = color("foreground");
  return (
    <InlineView
      open={visible}
      onClose={onClose}
      onBeforeClose={onBeforeClose}
      title={isEdit ? "Edit credential" : "New credential"}
      subtitle={isEdit ? credential?.name : undefined}
      scroll={false}
      bare
      footer={
        <View className="flex-row gap-2">
          <Button
            variant="muted"
            className="flex-1"
            onPress={async () => (await onBeforeClose()) && onClose()}
          >
            Cancel
          </Button>
          <Button className="flex-1" loading={saving} onPress={handleSave}>
            Save
          </Button>
        </View>
      }
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View className="gap-3">
          <Label className="text-muted-foreground">Credential</Label>
          <Field label="Name">
            <Input
              value={form.name}
              onChangeText={(name) => set({ name })}
              placeholder="Production key"
            />
          </Field>
          <Field label="Username">
            <Input
              value={form.username}
              onChangeText={(username) => set({ username })}
              placeholder="root"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
            />
          </Field>
          <Field label="Sign in with">
            <Tabs<"password" | "key">
              value={form.authType}
              onChange={(authType) => set({ authType })}
              options={[
                { id: "password", label: "Password" },
                { id: "key", label: "SSH key" },
              ]}
            />
          </Field>
          {form.authType === "password" ? (
            <Field label="Password">
              <Input
                value={form.password}
                onChangeText={(password) => set({ password })}
                secureTextEntry
                placeholder={isEdit ? "Unchanged if blank" : "Password"}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
              />
            </Field>
          ) : null}
        </View>

        {form.authType === "key" ? (
          <View className="gap-3">
            <Label className="text-muted-foreground">Key</Label>
            <Tabs<KeySource>
              value={source}
              onChange={setSource}
              options={[
                { id: "load", label: "File or paste" },
                { id: "generate", label: "Make a new key" },
              ]}
            />
            {source === "load" ? (
              <>
                {isEdit && savedKey && !form.key ? (
                  <Text className="text-meta text-muted-foreground">
                    A key is saved. Choose a file or paste to replace it.
                  </Text>
                ) : null}
                <KeyInput
                  value={form.key}
                  passphrase={form.keyPassword}
                  onChange={(patch) => set(patch)}
                  onPublicKey={(publicKey) => set({ publicKey })}
                  isEdit={isEdit && !!savedKey}
                />
              </>
            ) : (
              <View className="gap-3">
                <Field
                  label="Type"
                  hint={
                    serverKeyTools
                      ? "Ed25519 and ECDSA are made on this phone, RSA on your server."
                      : "Made on this phone. Ed25519 works almost everywhere."
                  }
                >
                  <Tabs<GenType>
                    value={genType}
                    onChange={setGenType}
                    options={genOptions}
                    fill={false}
                  />
                </Field>
                <Field
                  label="Passphrase"
                  hint="Optional. Locks the new key on this phone and on disk."
                >
                  <Input
                    value={form.keyPassword}
                    onChangeText={(keyPassword) => set({ keyPassword })}
                    secureTextEntry
                    placeholder="Passphrase"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Field>
                <Button
                  loading={generating}
                  onPress={generate}
                  icon={
                    <KeyRound size={14} color={color("primary-foreground")} />
                  }
                >
                  Make key
                </Button>
              </View>
            )}

            <Field
              label="Public key"
              hint="Add this line to ~/.ssh/authorized_keys on your hosts"
            >
              <Input
                value={form.publicKey}
                onChangeText={(publicKey) => set({ publicKey })}
                multiline
                placeholder="ssh-ed25519 AAAA..."
                autoCapitalize="none"
                autoCorrect={false}
                style={{ minHeight: 60, fontSize: 11 }}
              />
              <Button
                variant="muted"
                disabled={!form.publicKey}
                onPress={() => {
                  Clipboard.setStringAsync(form.publicKey);
                  toast.success("Public key copied");
                }}
                icon={<Copy size={14} color={icon} />}
              >
                Copy public key
              </Button>
            </Field>

            <AccordionSection
              label="Certificate"
              defaultOpen={!!form.certPublicKey}
            >
              <View className="gap-2.5 pt-3">
                <Text className="text-meta text-muted-foreground">
                  A certificate your CA signed for this key, for hosts that
                  trust the CA.
                </Text>
                <Button
                  variant="muted"
                  onPress={pickCert}
                  icon={<Upload size={14} color={icon} />}
                >
                  Choose certificate file
                </Button>
                <Input
                  value={form.certPublicKey}
                  onChangeText={(certPublicKey) => set({ certPublicKey })}
                  multiline
                  placeholder="ssh-ed25519-cert-v01@openssh.com AAAA..."
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{ minHeight: 60, fontSize: 11 }}
                />
                {cert.kind === "invalid" ? (
                  <Text className="text-meta text-destructive-text">
                    This does not look like an OpenSSH certificate.
                  </Text>
                ) : null}
                {cert.kind === "ok" ? (
                  <View className="gap-0.5 border border-border p-2.5">
                    {cert.lines.map((line) => (
                      <Text
                        key={line}
                        className="text-meta text-muted-foreground"
                      >
                        {line}
                      </Text>
                    ))}
                    {cert.problems.map((line) => (
                      <Text
                        key={line}
                        className="text-meta text-destructive-text"
                      >
                        {line}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            </AccordionSection>
          </View>
        ) : null}

        <View className="gap-3">
          <Label className="text-muted-foreground">Test</Label>
          <Field label="Host to test on">
            <Input
              value={testAddress}
              onChangeText={(v) => {
                setTestAddress(v);
                setTestHostId(undefined);
              }}
              placeholder="10.0.0.5 or box.lan:2222"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </Field>
          {hosts.length > 0 ? (
            <Button
              variant="muted"
              onPress={() => setPickHost(true)}
              icon={<Server size={14} color={icon} />}
            >
              Pick a saved host
            </Button>
          ) : null}
          <TestConnection getTarget={testTarget} />
        </View>

        <AccordionSection label="Details">
          <View className="gap-3 pt-3">
            <Field label="Description">
              <Input
                value={form.description}
                onChangeText={(description) => set({ description })}
                placeholder="What this credential is for"
              />
            </Field>
            <Field label="Folder">
              <Input
                value={form.folder}
                onChangeText={(folder) => set({ folder })}
                placeholder="Server keys"
              />
            </Field>
            <TagsField tags={form.tags} onChange={(tags) => set({ tags })} />
          </View>
        </AccordionSection>
      </ScrollView>

      <Sheet
        visible={pickHost}
        onClose={() => setPickHost(false)}
        title="Test on a host"
        scroll
      >
        <SheetBody>
          {hosts.map((h) => (
            <SheetRow
              key={h.id}
              label={h.name || h.ip}
              description={`${h.ip}:${h.port}`}
              onPress={() => {
                setTestAddress(`${h.ip}:${h.port}`);
                setTestHostId(h.id);
                setPickHost(false);
              }}
            />
          ))}
        </SheetBody>
      </Sheet>
    </InlineView>
  );
}
