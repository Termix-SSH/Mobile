import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Shield, AlertTriangle, Copy } from "lucide-react-native";
import {
  BORDERS,
  BORDER_COLORS,
  RADIUS,
  BACKGROUNDS,
} from "@/app/constants/designTokens";
import { useOrientation } from "@/app/utils/orientation";
import { getResponsivePadding } from "@/app/utils/responsive";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { HostKeyData } from "@/app/tabs/sessions/terminal/NativeWebSocketManager";

interface HostKeyVerificationDialogProps {
  visible: boolean;
  scenario: "new" | "changed";
  data: HostKeyData | null;
  onAccept: () => void;
  onReject: () => void;
}

const formatFingerprint = (fp: string) => fp.match(/.{1,2}/g)?.join(":") || fp;

const FingerprintRow: React.FC<{
  label: string;
  algorithm: string;
  fingerprint: string;
  keyType: string;
}> = ({ label, algorithm, fingerprint, keyType }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(formatFingerprint(fingerprint));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  }, [fingerprint]);

  return (
    <View style={{ marginBottom: 12 }}>
      <Text
        style={{
          color: "#9ca3af",
          fontSize: 12,
          fontWeight: "500",
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          backgroundColor: "#141416",
          borderWidth: BORDERS.STANDARD,
          borderColor: BORDER_COLORS.BUTTON,
          borderRadius: RADIUS.BUTTON,
          padding: 12,
        }}
      >
        <Text
          style={{
            color: "#6b7280",
            fontSize: 11,
            marginBottom: 4,
          }}
        >
          {algorithm.toUpperCase()} ({keyType})
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <Text
            style={{
              flex: 1,
              color: "#e5e7eb",
              fontSize: 12,
              fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
              lineHeight: 18,
            }}
            selectable
          >
            {formatFingerprint(fingerprint)}
          </Text>
          <TouchableOpacity
            onPress={handleCopy}
            style={{
              backgroundColor: copied ? "#16a34a" : "#1a1a1a",
              borderWidth: BORDERS.STANDARD,
              borderColor: copied ? "#16a34a" : BORDER_COLORS.BUTTON,
              borderRadius: RADIUS.BUTTON,
              paddingHorizontal: 10,
              paddingVertical: 6,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              minWidth: 70,
              justifyContent: "center",
            }}
            activeOpacity={0.7}
          >
            <Copy size={12} color={copied ? "#ffffff" : "#9ca3af"} />
            <Text
              style={{
                color: copied ? "#ffffff" : "#9ca3af",
                fontSize: 11,
                fontWeight: "500",
              }}
            >
              {copied ? "Copied!" : "Copy"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const HostKeyVerificationDialogComponent: React.FC<
  HostKeyVerificationDialogProps
> = ({ visible, scenario, data, onAccept, onReject }) => {
  const { isLandscape } = useOrientation();
  const insets = useSafeAreaInsets();
  const padding = getResponsivePadding(isLandscape);

  const isChanged = scenario === "changed";
  const accentColor = isChanged ? "#ef4444" : "#22c55e";
  const accentBorder = isChanged ? "#dc2626" : "#16a34a";

  const hostLabel = data ? `${data.hostname || data.ip}:${data.port}` : "";

  return (
    <Modal
      visible={visible}
      animationType="fade"
      supportedOrientations={["portrait", "landscape"]}
      presentationStyle="overFullScreen"
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, backgroundColor: BACKGROUNDS.DARK }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingTop: insets.top + padding,
            paddingBottom: insets.bottom + padding,
            paddingHorizontal: padding,
          }}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={true}
        >
          <View
            style={{
              backgroundColor: "#1f1f23",
              padding: 24,
              borderWidth: BORDERS.MAJOR,
              borderColor: isChanged ? "#7f1d1d" : BORDER_COLORS.PRIMARY,
              borderRadius: RADIUS.LARGE,
              maxWidth: isLandscape ? 600 : "100%",
              width: "100%",
              alignSelf: "center",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                marginBottom: 6,
              }}
            >
              {isChanged ? (
                <AlertTriangle size={22} color="#ef4444" />
              ) : (
                <Shield size={22} color="#22c55e" />
              )}
              <Text
                style={{
                  color: isChanged ? "#ef4444" : "#ffffff",
                  fontSize: 20,
                  fontWeight: "bold",
                  flex: 1,
                }}
              >
                {isChanged ? "Host Key Changed!" : "Verify Host Key"}
              </Text>
            </View>

            <Text
              style={{
                color: "#6b7280",
                fontSize: 13,
                marginBottom: 16,
                fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
              }}
            >
              {hostLabel}
            </Text>

            <View
              style={{
                backgroundColor: isChanged
                  ? "rgba(239,68,68,0.08)"
                  : "rgba(34,197,94,0.06)",
                borderWidth: 1,
                borderColor: isChanged
                  ? "rgba(239,68,68,0.3)"
                  : "rgba(34,197,94,0.25)",
                borderRadius: RADIUS.BUTTON,
                padding: 12,
                marginBottom: 20,
              }}
            >
              <Text
                style={{
                  color: isChanged ? "#fca5a5" : "#86efac",
                  fontSize: 13,
                  lineHeight: 20,
                }}
              >
                {isChanged
                  ? "The host key has changed."
                  : "First time connecting."}
              </Text>
            </View>

            {data && isChanged && data.oldFingerprint ? (
              <>
                <FingerprintRow
                  label="Previous Key"
                  algorithm={data.algorithm}
                  fingerprint={data.oldFingerprint}
                  keyType={data.oldKeyType || data.keyType}
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

            <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
              <TouchableOpacity
                onPress={onReject}
                style={{
                  flex: 1,
                  backgroundColor: "#1a1a1a",
                  paddingVertical: 14,
                  borderWidth: BORDERS.STANDARD,
                  borderColor: BORDER_COLORS.BUTTON,
                  borderRadius: RADIUS.BUTTON,
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={{
                    color: "#ffffff",
                    textAlign: "center",
                    fontWeight: "600",
                    fontSize: 16,
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onAccept}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  backgroundColor: accentColor,
                  borderWidth: BORDERS.STANDARD,
                  borderColor: accentBorder,
                  borderRadius: RADIUS.BUTTON,
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={{
                    color: "#ffffff",
                    textAlign: "center",
                    fontWeight: "600",
                    fontSize: 16,
                  }}
                >
                  {isChanged ? "Accept New Key" : "Connect & Trust"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export const HostKeyVerificationDialog = React.memo(
  HostKeyVerificationDialogComponent,
);
