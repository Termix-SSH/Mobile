import { useState } from "react";
import { Pressable, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Plus, X } from "lucide-react-native";
import type {
  AccountClient,
  BasicAuth,
  ProxyHeader,
} from "@/core/api/AccountClient";
import { toUserMessage } from "@/core/errors";
import { isNetAvailable } from "@/modules/termix-net";
import { Button, Input, PromptSheet, SettingRow, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { readLocalBase64 } from "@/utils/localFile";
import { toast } from "@/utils/toast";
import { CertPinSettings } from "./CertPinSettings";
import { ProxySignIn } from "./ProxySignIn";

const CF_ID = "CF-Access-Client-Id";
const CF_SECRET = "CF-Access-Client-Secret";

/**
 * How this phone gets through a reverse proxy in front of a server: extra
 * headers (a Cloudflare service token is two of them), basic auth, a client
 * certificate, a pinned server key, or the proxy's own sign in page.
 */
export function ProxySettings({
  client,
  onSaved,
}: {
  client: AccountClient;
  onSaved?: () => void;
}) {
  const color = useThemeColor();
  const [headers, setHeaders] = useState<ProxyHeader[]>(
    () => client.getProxy().customHeaders,
  );
  const [basic, setBasic] = useState<BasicAuth>(
    () => client.getProxy().basicAuth ?? { username: "", password: "" },
  );
  const [saving, setSaving] = useState(false);
  const [certFile, setCertFile] = useState<{
    base64: string;
    name: string | null;
  } | null>(null);
  const [proxyOpen, setProxyOpen] = useState(false);
  const cert = client.clientCert();
  const cookies = client.proxyCookies();

  const setHeader = (index: number, patch: Partial<ProxyHeader>) =>
    setHeaders((list) =>
      list.map((h, i) => (i === index ? { ...h, ...patch } : h)),
    );

  const addCloudflare = () =>
    setHeaders((list) => [
      ...list.filter((h) => h.name !== CF_ID && h.name !== CF_SECRET),
      { name: CF_ID, value: "" },
      { name: CF_SECRET, value: "" },
    ]);

  const save = async () => {
    setSaving(true);
    try {
      await client.setProxy({
        customHeaders: headers.filter((h) => h.name.trim()),
        basicAuth: basic.username.trim()
          ? { username: basic.username.trim(), password: basic.password }
          : null,
      });
      toast.success("Proxy settings saved");
      onSaved?.();
    } catch (error) {
      toast.error(toUserMessage(error, "Could not save the proxy settings"));
    } finally {
      setSaving(false);
    }
  };

  const pickCert = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: ["application/x-pkcs12", "*/*"],
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setCertFile({
        base64: await readLocalBase64(asset.uri),
        name: asset.name ?? null,
      });
    } catch {
      toast.error("Could not read that file");
    }
  };

  const importCert = async (passphrase: string) => {
    if (!certFile) return;
    try {
      await client.setClientCert({ ...certFile, passphrase });
      setCertFile(null);
      toast.success("Certificate saved");
      onSaved?.();
    } catch (error) {
      const code = (error as { code?: string })?.code;
      toast.error(
        code === "BAD_PASSPHRASE"
          ? "The file or its passphrase is wrong"
          : toUserMessage(error, "Could not save the certificate"),
      );
    }
  };

  return (
    <View>
      <Text weight="medium" className="mb-1 text-sm text-foreground">
        Headers
      </Text>
      <Text className="mb-2 text-[11px] text-muted-foreground">
        Sent with every request to this server, like a Cloudflare service token.
      </Text>
      {headers.map((header, index) => (
        <View key={index} className="mb-2 flex-row items-center gap-2">
          <Input
            containerClassName="flex-1"
            placeholder="Name"
            autoCapitalize="none"
            autoCorrect={false}
            value={header.name}
            onChangeText={(name) => setHeader(index, { name })}
          />
          <Input
            containerClassName="flex-1"
            placeholder="Value"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={/secret|token|key|auth/i.test(header.name)}
            value={header.value}
            onChangeText={(value) => setHeader(index, { value })}
          />
          <Pressable
            hitSlop={8}
            accessibilityLabel="Remove header"
            onPress={() =>
              setHeaders((list) => list.filter((_, i) => i !== index))
            }
          >
            <X size={16} color={color("muted-foreground")} />
          </Pressable>
        </View>
      ))}
      <View className="mb-5 flex-row gap-2">
        <Button
          variant="muted"
          size="sm"
          icon={<Plus size={14} color={color("foreground")} />}
          onPress={() =>
            setHeaders((list) => [...list, { name: "", value: "" }])
          }
        >
          Add header
        </Button>
        <Button variant="muted" size="sm" onPress={addCloudflare}>
          Cloudflare service token
        </Button>
      </View>

      <Text weight="medium" className="mb-1 text-sm text-foreground">
        Basic auth
      </Text>
      <Text className="mb-2 text-[11px] text-muted-foreground">
        For a proxy that asks for a user name and password.
      </Text>
      <View className="mb-2 gap-2">
        <Input
          placeholder="User name"
          autoCapitalize="none"
          autoCorrect={false}
          value={basic.username}
          onChangeText={(username) => setBasic((b) => ({ ...b, username }))}
        />
        <Input
          placeholder="Password"
          secureTextEntry
          value={basic.password}
          onChangeText={(password) => setBasic((b) => ({ ...b, password }))}
        />
      </View>
      <Button onPress={save} loading={saving} className="mb-6">
        Save headers and basic auth
      </Button>

      <Text weight="medium" className="mb-1 text-sm text-foreground">
        Client certificate
      </Text>
      <Text className="mb-2 text-[11px] text-muted-foreground">
        {
          "For servers that ask for one (mTLS). The key is kept in the phone's secure storage and can't be read back out."
        }
      </Text>
      {cert ? (
        <View className="mb-2 border border-border bg-card px-3">
          <SettingRow
            label={cert.name ?? "Certificate"}
            description={cert.subject ?? undefined}
            last
          >
            <Button
              variant="ghost"
              size="sm"
              onPress={() => void client.removeClientCert().then(onSaved)}
            >
              Remove
            </Button>
          </SettingRow>
        </View>
      ) : null}
      <Button
        variant="muted"
        onPress={pickCert}
        disabled={!isNetAvailable()}
        className="mb-6"
      >
        {cert ? "Replace certificate" : "Pick a .p12 or .pfx file"}
      </Button>

      <CertPinSettings client={client} onSaved={onSaved} />

      <Text weight="medium" className="mb-1 text-sm text-foreground">
        Proxy sign in
      </Text>
      <Text className="mb-2 text-[11px] text-muted-foreground">
        For Cloudflare Access, Authelia, Authentik and other proxies with their
        own sign in page.
        {cookies.length ? " This phone is signed in to the proxy." : ""}
      </Text>
      <View className="flex-row gap-2">
        <Button
          variant="muted"
          onPress={() => setProxyOpen(true)}
          disabled={!isNetAvailable()}
          className="flex-1"
        >
          Sign in to the proxy
        </Button>
        {cookies.length ? (
          <Button
            variant="ghost"
            onPress={() => void client.setProxyCookies([]).then(onSaved)}
          >
            Forget
          </Button>
        ) : null}
      </View>

      <PromptSheet
        visible={!!certFile}
        title="Certificate passphrase"
        description="The passphrase the file was saved with. Leave it empty if it has none."
        placeholder="Passphrase"
        confirmLabel="Save"
        secureTextEntry
        validate={() => true}
        onSubmit={(passphrase) => void importCert(passphrase)}
        onCancel={() => setCertFile(null)}
      />
      <ProxySignIn
        client={client}
        open={proxyOpen}
        onClose={() => setProxyOpen(false)}
        onDone={onSaved}
      />
    </View>
  );
}
