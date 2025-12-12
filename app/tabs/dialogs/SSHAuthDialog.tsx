import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
} from "react-native";
import {
  BORDERS,
  BORDER_COLORS,
  RADIUS,
  BACKGROUNDS,
} from "@/app/constants/designTokens";
import { useOrientation } from "@/app/utils/orientation";
import { getResponsivePadding } from "@/app/utils/responsive";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface SSHAuthDialogProps {
  visible: boolean;
  onSubmit: (credentials: {
    password?: string;
    sshKey?: string;
    keyPassword?: string;
  }) => void;
  onCancel: () => void;
  hostInfo: {
    name?: string;
    ip: string;
    port: number;
    username: string;
  };
  reason: "no_keyboard" | "auth_failed" | "timeout";
}

const SSHAuthDialogComponent: React.FC<SSHAuthDialogProps> = ({
  visible,
  onSubmit,
  onCancel,
  hostInfo,
  reason,
}) => {
  const [authMethod, setAuthMethod] = useState<"password" | "key">("password");
  const [password, setPassword] = useState("");
  const [sshKey, setSshKey] = useState("");
  const [keyPassword, setKeyPassword] = useState("");
  const { isLandscape } = useOrientation();
  const insets = useSafeAreaInsets();
  const padding = getResponsivePadding(isLandscape);
  const passwordInputRef = useRef<TextInput>(null);
  const sshKeyInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) {
      setPassword("");
      setSshKey("");
      setKeyPassword("");
      setAuthMethod("password");
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        if (authMethod === "password") {
          passwordInputRef.current?.focus();
        } else {
          sshKeyInputRef.current?.focus();
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visible, authMethod]);

  const getReasonMessage = useCallback(() => {
    switch (reason) {
      case "no_keyboard":
        return "Keyboard-interactive authentication is not supported on mobile. Please provide credentials directly.";
      case "auth_failed":
        return "Authentication failed. Please re-enter your credentials.";
      case "timeout":
        return "Connection timed out. Please try again with your credentials.";
      default:
        return "Please provide your credentials to connect.";
    }
  }, [reason]);

  const handleSubmit = useCallback(() => {
    if (authMethod === "password" && password.trim()) {
      onSubmit({ password });
      setPassword("");
    } else if (authMethod === "key" && sshKey.trim()) {
      onSubmit({
        sshKey,
        keyPassword: keyPassword.trim() || undefined,
      });
      setSshKey("");
      setKeyPassword("");
    }
  }, [authMethod, password, sshKey, keyPassword, onSubmit]);

  const handleCancel = useCallback(() => {
    setPassword("");
    setSshKey("");
    setKeyPassword("");
    onCancel();
  }, [onCancel]);

  const handleSetAuthMethod = useCallback((method: "password" | "key") => {
    setAuthMethod(method);
  }, []);

  const isValid = useMemo(
    () =>
      authMethod === "password"
        ? password.trim().length > 0
        : sshKey.trim().length > 0,
    [authMethod, password, sshKey],
  );

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
              borderColor: BORDER_COLORS.PRIMARY,
              borderRadius: RADIUS.LARGE,
              maxWidth: isLandscape ? 600 : "100%",
              width: "100%",
              alignSelf: "center",
            }}
          >
            <Text
              style={{
                color: "#ffffff",
                fontSize: 20,
                fontWeight: "bold",
                marginBottom: 16,
              }}
            >
              SSH Authentication Required
            </Text>

            <View
              style={{
                marginBottom: 24,
                padding: 16,
                backgroundColor: "rgba(113, 63, 18, 0.2)",
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "#ca8a04",
              }}
            >
              <Text style={{ color: "#fef08a", fontSize: 14, lineHeight: 20 }}>
                {getReasonMessage()}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 12, marginBottom: 24 }}>
              <TouchableOpacity
                onPress={() => handleSetAuthMethod("password")}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  backgroundColor:
                    authMethod === "password" ? "#16a34a" : "#1a1a1a",
                  borderWidth: BORDERS.STANDARD,
                  borderColor:
                    authMethod === "password"
                      ? "#16a34a"
                      : BORDER_COLORS.BUTTON,
                  borderRadius: RADIUS.BUTTON,
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={{
                    color: "#ffffff",
                    textAlign: "center",
                    fontWeight: "600",
                  }}
                >
                  Password
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleSetAuthMethod("key")}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  backgroundColor: authMethod === "key" ? "#16a34a" : "#1a1a1a",
                  borderWidth: BORDERS.STANDARD,
                  borderColor:
                    authMethod === "key" ? "#16a34a" : BORDER_COLORS.BUTTON,
                  borderRadius: RADIUS.BUTTON,
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={{
                    color: "#ffffff",
                    textAlign: "center",
                    fontWeight: "600",
                  }}
                >
                  SSH Key
                </Text>
              </TouchableOpacity>
            </View>

            {authMethod === "password" && (
              <View style={{ marginBottom: 24 }}>
                <Text
                  style={{
                    color: "#d1d5db",
                    fontSize: 14,
                    fontWeight: "500",
                    marginBottom: 8,
                  }}
                >
                  Password
                </Text>
                <TextInput
                  ref={passwordInputRef}
                  style={{
                    backgroundColor: "#1a1a1a",
                    borderWidth: BORDERS.STANDARD,
                    borderColor: BORDER_COLORS.BUTTON,
                    borderRadius: RADIUS.BUTTON,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    fontSize: 16,
                    color: "#ffffff",
                  }}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter password"
                  placeholderTextColor="#6B7280"
                  secureTextEntry
                  autoFocus={false}
                  onSubmitEditing={handleSubmit}
                />
              </View>
            )}

            {authMethod === "key" && (
              <>
                <View style={{ marginBottom: 16 }}>
                  <Text
                    style={{
                      color: "#d1d5db",
                      fontSize: 14,
                      fontWeight: "500",
                      marginBottom: 8,
                    }}
                  >
                    Private SSH Key
                  </Text>
                  <TextInput
                    ref={sshKeyInputRef}
                    style={{
                      backgroundColor: "#1a1a1a",
                      borderWidth: BORDERS.STANDARD,
                      borderColor: BORDER_COLORS.BUTTON,
                      borderRadius: RADIUS.BUTTON,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      fontSize: 14,
                      color: "#ffffff",
                      minHeight: 120,
                      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                      textAlignVertical: "top",
                    }}
                    value={sshKey}
                    onChangeText={setSshKey}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;Paste your private key here...&#10;-----END OPENSSH PRIVATE KEY-----"
                    placeholderTextColor="#6B7280"
                    multiline
                    numberOfLines={6}
                    autoFocus={false}
                  />
                </View>
                <View style={{ marginBottom: 24 }}>
                  <Text
                    style={{
                      color: "#d1d5db",
                      fontSize: 14,
                      fontWeight: "500",
                      marginBottom: 8,
                    }}
                  >
                    Key Password (optional)
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: "#1a1a1a",
                      borderWidth: BORDERS.STANDARD,
                      borderColor: BORDER_COLORS.BUTTON,
                      borderRadius: RADIUS.BUTTON,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      fontSize: 16,
                      color: "#ffffff",
                    }}
                    value={keyPassword}
                    onChangeText={setKeyPassword}
                    placeholder="Key password (if encrypted)"
                    placeholderTextColor="#6B7280"
                    secureTextEntry
                    onSubmitEditing={handleSubmit}
                  />
                </View>
              </>
            )}

            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={handleCancel}
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
                onPress={handleSubmit}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  backgroundColor: isValid ? "#22c55e" : "#374151",
                  borderWidth: BORDERS.STANDARD,
                  borderColor: isValid ? "#16a34a" : BORDER_COLORS.BUTTON,
                  borderRadius: RADIUS.BUTTON,
                  opacity: isValid ? 1 : 0.5,
                }}
                activeOpacity={0.7}
                disabled={!isValid}
              >
                <Text
                  style={{
                    color: "#ffffff",
                    textAlign: "center",
                    fontWeight: "600",
                    fontSize: 16,
                  }}
                >
                  Connect
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export const SSHAuthDialog = React.memo(SSHAuthDialogComponent);
