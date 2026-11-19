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
import { t } from "@/i18n";

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
      toast.error(t("hosts.keys.keyInput.couldNotReadThatKey"));
    } finally {
      setBusy(false);
    }
  };

  const paste = async () => {
    const text = await Clipboard.getStringAsync().catch(() => "");
    if (!text.trim()) {
      toast.error(t("hosts.keys.keyInput.theClipboardIsEmpty"));
      return;
    }
    take(text, t("hosts.keys.keyInput.thePastedKey"));
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
        label={t("hosts.keys.keyInput.privateKey")}
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
            {t("hosts.keys.keyInput.chooseFile")}
          </Button>
          <Button
            variant="muted"
            className="flex-1"
            onPress={paste}
            icon={<ClipboardPaste size={14} color={icon} />}
          >
            {t("hosts.keys.keyInput.paste")}
          </Button>
        </View>
        <Input
          value={value}
          onChangeText={(key) => onChange({ key })}
          onBlur={normalize}
          multiline
          placeholder={
            isEdit
              ? t("hosts.keys.keyInput.unchangedIfBlank")
              : t("hosts.keys.keyInput.beginOpensshPrivateKey")
          }
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          style={{ minHeight: 110, fontSize: 11 }}
        />
      </Field>
      <Field
        label={t("hosts.keys.keyInput.passphrase")}
        error={
          status.kind === "needsPassphrase" || status.kind === "wrongPassphrase"
            ? statusText
            : null
        }
        hint={t("hosts.keys.keyInput.onlyIfTheKeyHas")}
      >
        <Input
          value={passphrase}
          onChangeText={(keyPassword) => onChange({ keyPassword })}
          secureTextEntry
          placeholder={t("hosts.keys.keyInput.passphrase")}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
        />
      </Field>
      {status.kind === "unchecked" ? (
        <Text className="text-meta text-muted-foreground">
          {t("hosts.keys.keyInput.theKeyIsCheckedWhen")}
        </Text>
      ) : null}
    </View>
  );
}
