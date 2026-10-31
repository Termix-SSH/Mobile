import { useMemo, useState } from "react";
import { View } from "react-native";
import { ClipboardPaste, Upload } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { Button, Field, Input, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { readLocalText } from "@/utils/localFile";
import {
  importMessage,
  importPrivateKey,
  keyStatus,
  keyStatusText,
} from "@/utils/keyImport";
import { toast } from "@/utils/toast";

/**
 * A private key from a file or pasted text, with its passphrase. Keys are
 * checked on the phone as they change, and PuTTY keys become OpenSSH.
 */
export function KeyInput({
  value,
  passphrase,
  onChange,
  onPublicKey,
  isEdit,
}: {
  value: string;
  passphrase: string;
  onChange: (patch: { key?: string; keyPassword?: string }) => void;
  onPublicKey?: (publicKey: string) => void;
  isEdit?: boolean;
}) {
  const color = useThemeColor();
  const [busy, setBusy] = useState(false);
  const status = useMemo(
    () => keyStatus(value, passphrase),
    [value, passphrase],
  );
  const statusText = keyStatusText(status);
  const bad =
    status.kind === "invalid" ||
    status.kind === "needsPassphrase" ||
    status.kind === "wrongPassphrase";

  const take = (text: string, name: string) => {
    const imported = importPrivateKey(text, passphrase || undefined);
    onChange({ key: imported.key });
    if (imported.publicKey) onPublicKey?.(imported.publicKey);
    toast.success(importMessage(name, imported));
  };

  const pickFile = async () => {
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      take(await readLocalText(asset.uri), asset.name);
    } catch {
      toast.error("Could not read that key file");
    } finally {
      setBusy(false);
    }
  };

  const paste = async () => {
    const text = await Clipboard.getStringAsync().catch(() => "");
    if (!text.trim()) {
      toast.error("The clipboard is empty");
      return;
    }
    take(text, "the pasted key");
  };

  // Typed or pasted by hand: convert once the user leaves the box.
  const normalize = () => {
    if (!value.trim()) return;
    const imported = importPrivateKey(value, passphrase || undefined);
    if (imported.key !== value) onChange({ key: imported.key });
    if (imported.publicKey) onPublicKey?.(imported.publicKey);
  };

  const icon = color("foreground");
  return (
    <View className="gap-3">
      <Field
        label="Private key"
        error={bad && status.kind !== "needsPassphrase" ? statusText : null}
        hint={status.kind === "ok" ? statusText : undefined}
      >
        <View className="flex-row gap-2">
          <Button
            variant="muted"
            className="flex-1"
            loading={busy}
            onPress={pickFile}
            icon={<Upload size={14} color={icon} />}
          >
            Choose file
          </Button>
          <Button
            variant="muted"
            className="flex-1"
            onPress={paste}
            icon={<ClipboardPaste size={14} color={icon} />}
          >
            Paste
          </Button>
        </View>
        <Input
          value={value}
          onChangeText={(key) => onChange({ key })}
          onBlur={normalize}
          multiline
          placeholder={
            isEdit
              ? "Unchanged if blank"
              : "-----BEGIN OPENSSH PRIVATE KEY-----"
          }
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          style={{ minHeight: 110, fontSize: 11 }}
        />
      </Field>
      <Field
        label="Passphrase"
        error={
          status.kind === "needsPassphrase" || status.kind === "wrongPassphrase"
            ? statusText
            : null
        }
        hint="Only if the key has one"
      >
        <Input
          value={passphrase}
          onChangeText={(keyPassword) => onChange({ keyPassword })}
          secureTextEntry
          placeholder="Passphrase"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
        />
      </Field>
      {status.kind === "unchecked" ? (
        <Text className="text-meta text-muted-foreground">
          The key is checked when you connect.
        </Text>
      ) : null}
    </View>
  );
}
