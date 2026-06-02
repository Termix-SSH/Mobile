import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from "react-native";
import { X } from "lucide-react-native";
import { Text } from "./Text";
import { useThemeColor } from "@/app/contexts/ThemeContext";

/**
 * Dialog — centered modal card. Square corners, themed surface, optional
 * title/description and close button. Mirrors the web shadcn dialog.
 */
export function Dialog({
  visible,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const muted = useThemeColor()("muted-foreground");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/50 px-5"
          onPress={onClose}
        >
          <Pressable
            className="w-full max-w-md border border-border bg-popover"
            onPress={(e) => e.stopPropagation()}
          >
            {title ? (
              <View className="flex-row items-start gap-2.5 border-b border-border px-4 pb-3 pt-4">
                {icon ? (
                  <View className="h-8 w-8 shrink-0 items-center justify-center border border-border bg-muted">
                    {icon}
                  </View>
                ) : null}
                <View className="min-w-0 flex-1">
                  <Text weight="bold" className="text-base text-foreground">
                    {title}
                  </Text>
                  {description ? (
                    <Text className="mt-0.5 text-xs text-muted-foreground">
                      {description}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={onClose}
                  hitSlop={8}
                  className="mt-0.5 shrink-0"
                >
                  <X size={16} color={muted} />
                </Pressable>
              </View>
            ) : null}
            {children ? <View className="px-4 py-4">{children}</View> : null}
            {footer ? (
              <View className={`px-4 py-3 ${children ? "border-t border-border" : ""}`}>
                {footer}
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
