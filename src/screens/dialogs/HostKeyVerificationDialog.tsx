import { useState, useCallback } from "react";
import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Shield, AlertTriangle, Copy, Check } from "lucide-react-native";
import { Button, Label, Sheet, SheetBody, Text } from "@/ui";
import { MONO_FONT } from "@/constants/fonts";
import { useThemeColor } from "@/contexts/ThemeContext";
import type { HostKeyData } from "@/core/transport/types";
import { t } from "@/i18n";

interface HostKeyVerificationDialogProps {
  visible: boolean;
  scenario: "new" | "changed";
  data: HostKeyData | null;
  onAccept: () => void;
  onReject: () => void;
}

// The server sends the key as hex; the phone sends SHA256:... like OpenSSH prints.
export const formatFingerprint = (fp: string) =>
  fp.startsWith("SHA256:") ? fp : (fp.match(/.{1,2}/g)?.join(":") ?? fp);

function FingerprintRow({
  label,
  algorithm,
  fingerprint,
  keyType,
}: {
  label: string;
  algorithm: string;
  fingerprint: string;
  keyType: string;
}) {
  const color = useThemeColor();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(formatFingerprint(fingerprint));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [fingerprint]);

  return (
    <View>
      <Label className="mb-1.5">{label}</Label>
      <View className="border border-border bg-card p-3">
        <Text className="mb-1.5 text-xs text-muted-foreground">
          {algorithm.toUpperCase()} ({keyType})
        </Text>
        <View className="flex-row items-start gap-2">
          <Text
            className="flex-1 text-xs text-foreground"
            style={{ fontFamily: MONO_FONT, lineHeight: 18 }}
            selectable
          >
            {formatFingerprint(fingerprint)}
          </Text>
          <Button
            variant={copied ? "default" : "muted"}
            size="sm"
            onPress={handleCopy}
            icon={
              copied ? (
                <Check size={12} color={color("accent-brand")} />
              ) : (
                <Copy size={12} color={color("muted-foreground")} />
              )
            }
          >
            {copied
              ? t("dialogs.hostKeyVerificationDialog.copied")
              : t("dialogs.hostKeyVerificationDialog.copy")}
          </Button>
        </View>
      </View>
    </View>
  );
}

export function HostKeyVerificationDialog({
  visible,
  scenario,
  data,
  onAccept,
  onReject,
}: HostKeyVerificationDialogProps) {
  const color = useThemeColor();
  const isChanged = scenario === "changed";
  const hostLabel = data ? `${data.hostname ?? data.ip}:${data.port}` : "";

  return (
    <Sheet
      visible={visible}
      onClose={onReject}
      scroll
      tone={isChanged ? "destructive" : "default"}
      title={
        isChanged
          ? t("dialogs.hostKeyVerificationDialog.hostKeyChanged")
          : t("dialogs.hostKeyVerificationDialog.verifyHostKey")
      }
      description={hostLabel}
      icon={
        isChanged ? (
          <AlertTriangle size={16} color={color("destructive")} />
        ) : (
          <Shield size={16} color={color("accent-brand")} />
        )
      }
      footer={
        <View className="flex-row gap-2">
          <Button variant="muted" className="flex-1" onPress={onReject}>
            {t("dialogs.hostKeyVerificationDialog.cancel")}
          </Button>
          <Button
            variant={isChanged ? "destructive" : "default"}
            className="flex-1"
            onPress={onAccept}
          >
            {isChanged
              ? t("dialogs.hostKeyVerificationDialog.acceptNewKey")
              : t("dialogs.hostKeyVerificationDialog.connectAndTrust")}
          </Button>
        </View>
      }
    >
      <SheetBody>
        <View
          className={`border px-3 py-2.5 ${isChanged ? "border-destructive/40 bg-destructive/10" : "border-accent-brand/30 bg-accent-brand/5"}`}
        >
          <Text
            className={`text-xs ${isChanged ? "text-destructive-text" : "text-accent-text"}`}
          >
            {isChanged
              ? t("dialogs.hostKeyVerificationDialog.theHostSSshKey")
              : t("dialogs.hostKeyVerificationDialog.youAreConnectingToThis")}
          </Text>
        </View>

        {data && isChanged && data.oldFingerprint ? (
          <>
            <FingerprintRow
              label={t("dialogs.hostKeyVerificationDialog.previousKey")}
              algorithm={data.algorithm}
              fingerprint={data.oldFingerprint}
              keyType={data.oldKeyType ?? data.keyType}
            />
            <FingerprintRow
              label={t("dialogs.hostKeyVerificationDialog.newFingerprint")}
              algorithm={data.algorithm}
              fingerprint={data.fingerprint}
              keyType={data.keyType}
            />
          </>
        ) : data ? (
          <FingerprintRow
            label={t("dialogs.hostKeyVerificationDialog.hostFingerprint")}
            algorithm={data.algorithm}
            fingerprint={data.fingerprint}
            keyType={data.keyType}
          />
        ) : null}
      </SheetBody>
    </Sheet>
  );
}
