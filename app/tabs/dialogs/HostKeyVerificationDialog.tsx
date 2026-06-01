import { useState, useCallback } from "react";
import { View, Platform, Modal, Pressable, ScrollView } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Shield, AlertTriangle, Copy, Check } from "lucide-react-native";
import { Button, Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import type { HostKeyData } from "@/app/tabs/sessions/terminal/NativeWebSocketManager";

interface HostKeyVerificationDialogProps {
  visible: boolean;
  scenario: "new" | "changed";
  data: HostKeyData | null;
  onAccept: () => void;
  onReject: () => void;
}

const formatFingerprint = (fp: string) => fp.match(/.{1,2}/g)?.join(":") ?? fp;

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
    <View className="mb-3">
      <Text className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">
        {label}
      </Text>
      <View className="bg-card border border-border p-3">
        <Text className="text-xs text-muted-foreground mb-1.5">
          {algorithm.toUpperCase()} ({keyType})
        </Text>
        <View className="flex-row items-start gap-2">
          <Text
            className="flex-1 text-xs text-foreground"
            style={{
              fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
              lineHeight: 18,
            }}
            selectable
          >
            {formatFingerprint(fingerprint)}
          </Text>
          <Button
            variant={copied ? "accent" : "outline"}
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
            {copied ? "Copied" : "Copy"}
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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onReject}
      statusBarTranslucent
    >
      <Pressable
        className="flex-1 bg-black/50 items-center justify-center px-5"
        onPress={onReject}
      >
        <Pressable
          className="w-full max-w-md"
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Card with scenario-aware border */}
            <View
              className="bg-popover border"
              style={{
                borderColor: isChanged
                  ? color("destructive", 0.5)
                  : color("border"),
              }}
            >
              {/* Header */}
              <View
                className="flex-row items-center gap-2.5 px-4 pt-4 pb-3 border-b"
                style={{ borderColor: isChanged ? color("destructive", 0.3) : color("border") }}
              >
                <View
                  className="w-8 h-8 border items-center justify-center shrink-0"
                  style={{
                    borderColor: isChanged
                      ? color("destructive", 0.4)
                      : color("border"),
                    backgroundColor: isChanged
                      ? color("destructive", 0.1)
                      : color("muted"),
                  }}
                >
                  {isChanged ? (
                    <AlertTriangle size={16} color={color("destructive")} />
                  ) : (
                    <Shield size={16} color={color("accent-brand")} />
                  )}
                </View>
                <View className="flex-1 min-w-0">
                  <Text
                    weight="bold"
                    className="text-base"
                    style={{ color: isChanged ? color("destructive") : color("foreground") }}
                  >
                    {isChanged ? "Host Key Changed!" : "Verify Host Key"}
                  </Text>
                  <Text
                    className="text-xs mt-0.5"
                    style={{
                      fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
                      color: color("muted-foreground"),
                    }}
                  >
                    {hostLabel}
                  </Text>
                </View>
              </View>

              {/* Body */}
              <View className="px-4 py-4">
                {/* Status banner */}
                <View
                  className="border px-3 py-2.5 mb-4"
                  style={{
                    borderColor: isChanged
                      ? color("destructive", 0.4)
                      : color("accent-brand", 0.3),
                    backgroundColor: isChanged
                      ? color("destructive", 0.08)
                      : color("accent-brand", 0.06),
                  }}
                >
                  <Text
                    className="text-xs"
                    style={{ color: isChanged ? color("destructive") : color("accent-brand") }}
                  >
                    {isChanged
                      ? "The host's SSH key has changed since your last connection. This could indicate a security risk."
                      : "You are connecting to this host for the first time. Verify the fingerprint before trusting."}
                  </Text>
                </View>

                {/* Fingerprints */}
                {data && isChanged && data.oldFingerprint ? (
                  <>
                    <FingerprintRow
                      label="Previous Key"
                      algorithm={data.algorithm}
                      fingerprint={data.oldFingerprint}
                      keyType={data.oldKeyType ?? data.keyType}
                    />
                    <FingerprintRow
                      label="New Fingerprint"
                      algorithm={data.algorithm}
                      fingerprint={data.fingerprint}
                      keyType={data.keyType}
                    />
                  </>
                ) : data ? (
                  <FingerprintRow
                    label="Host Fingerprint"
                    algorithm={data.algorithm}
                    fingerprint={data.fingerprint}
                    keyType={data.keyType}
                  />
                ) : null}
              </View>

              {/* Footer */}
              <View className="flex-row justify-end gap-2 px-4 py-3 border-t border-border">
                <Button variant="outline" className="flex-1" onPress={onReject}>
                  Cancel
                </Button>
                <Button
                  variant={isChanged ? "destructive" : "accent"}
                  className="flex-1"
                  onPress={onAccept}
                >
                  {isChanged ? "Accept New Key" : "Connect & Trust"}
                </Button>
              </View>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
