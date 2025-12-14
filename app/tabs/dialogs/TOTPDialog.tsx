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
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Clipboard as ClipboardIcon } from "lucide-react-native";
import {
  BORDERS,
  BORDER_COLORS,
  RADIUS,
  BACKGROUNDS,
} from "@/app/constants/designTokens";
import { useOrientation } from "@/app/utils/orientation";
import { getResponsivePadding } from "@/app/utils/responsive";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface TOTPDialogProps {
  visible: boolean;
  onSubmit: (code: string) => void;
  onCancel: () => void;
  prompt?: string;
  isPasswordPrompt?: boolean;
}

const TOTPDialogComponent: React.FC<TOTPDialogProps> = ({
  visible,
  onSubmit,
  onCancel,
  prompt = "Two-Factor Authentication",
  isPasswordPrompt = false,
}) => {
  const [code, setCode] = useState("");
  const { isLandscape } = useOrientation();
  const insets = useSafeAreaInsets();
  const padding = getResponsivePadding(isLandscape);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) {
      setCode("");
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  const handleSubmit = useCallback(() => {
    if (code.trim()) {
      onSubmit(code);
      setCode("");
    }
  }, [code, onSubmit]);

  const handleCancel = useCallback(() => {
    setCode("");
    onCancel();
  }, [onCancel]);

  const handlePaste = useCallback(async () => {
    try {
      const clipboardContent = await Clipboard.getString();
      if (clipboardContent) {
        const pastedCode = isPasswordPrompt
          ? clipboardContent
          : clipboardContent.replace(/\D/g, "").slice(0, 6);
        setCode(pastedCode);
      }
    } catch (error) {
      console.error("Failed to paste from clipboard:", error);
    }
  }, [isPasswordPrompt]);

  const isCodeValid = useMemo(() => code.trim().length > 0, [code]);

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
              borderColor: BORDER_COLORS.PRIMARY,
              borderRadius: RADIUS.LARGE,
              maxWidth: isLandscape ? 500 : "100%",
              width: "100%",
              alignSelf: "center",
            }}
          >
            <Text
              style={{
                color: "#ffffff",
                fontSize: 20,
                fontWeight: "bold",
                marginBottom: 12,
              }}
            >
              {prompt}
            </Text>
            <Text
              style={{
                color: "#9ca3af",
                fontSize: 16,
                lineHeight: 24,
                marginBottom: 24,
              }}
            >
              {isPasswordPrompt
                ? "Enter your password to continue"
                : "Enter your TOTP verification code"}
            </Text>
            <View style={{ flexDirection: "row", gap: 12, marginBottom: 24 }}>
              <TextInput
                ref={inputRef}
                style={{
                  flex: 1,
                  backgroundColor: "#1a1a1a",
                  borderWidth: BORDERS.STANDARD,
                  borderColor: BORDER_COLORS.BUTTON,
                  borderRadius: RADIUS.BUTTON,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  fontSize: 18,
                  color: "#ffffff",
                  textAlign: "center",
                  letterSpacing: isPasswordPrompt ? 0 : 4,
                }}
                value={code}
                onChangeText={setCode}
                placeholder={isPasswordPrompt ? "Password" : "000000"}
                placeholderTextColor="#6B7280"
                keyboardType={isPasswordPrompt ? "default" : "number-pad"}
                secureTextEntry={isPasswordPrompt}
                maxLength={isPasswordPrompt ? undefined : 6}
                autoFocus={false}
                onSubmitEditing={handleSubmit}
              />
              <TouchableOpacity
                onPress={handlePaste}
                style={{
                  backgroundColor: "#1a1a1a",
                  width: 48,
                  height: 48,
                  borderWidth: BORDERS.STANDARD,
                  borderColor: BORDER_COLORS.BUTTON,
                  borderRadius: RADIUS.BUTTON,
                  justifyContent: "center",
                  alignItems: "center",
                }}
                activeOpacity={0.7}
              >
                <ClipboardIcon size={20} color="#22c55e" />
              </TouchableOpacity>
            </View>
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
                  backgroundColor: isCodeValid ? "#22c55e" : "#374151",
                  borderWidth: BORDERS.STANDARD,
                  borderColor: isCodeValid ? "#16a34a" : BORDER_COLORS.BUTTON,
                  borderRadius: RADIUS.BUTTON,
                  opacity: isCodeValid ? 1 : 0.5,
                }}
                activeOpacity={0.7}
                disabled={!isCodeValid}
              >
                <Text
                  style={{
                    color: "#ffffff",
                    textAlign: "center",
                    fontWeight: "600",
                    fontSize: 16,
                  }}
                >
                  {isPasswordPrompt ? "Submit" : "Verify"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export const TOTPDialog = React.memo(TOTPDialogComponent);
