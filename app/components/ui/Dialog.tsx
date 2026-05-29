import { Modal, Pressable, View } from "react-native";
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
      <Pressable
        className="flex-1 bg-black/50 items-center justify-center px-5"
        onPress={onClose}
      >
        <Pressable
          className="w-full max-w-md bg-popover border border-border"
          onPress={(e) => e.stopPropagation()}
        >
          {title ? (
            <View className="flex-row items-start gap-2.5 px-4 pt-4 pb-3 border-b border-border">
              {icon ? (
                <View className="w-8 h-8 border border-border bg-muted items-center justify-center shrink-0">
                  {icon}
                </View>
              ) : null}
              <View className="flex-1 min-w-0">
                <Text weight="bold" className="text-base text-foreground">
                  {title}
                </Text>
                {description ? (
                  <Text className="text-xs text-muted-foreground mt-0.5">
                    {description}
                  </Text>
                ) : null}
              </View>
              <Pressable onPress={onClose} hitSlop={8} className="shrink-0 mt-0.5">
                <X size={16} color={muted} />
              </Pressable>
            </View>
          ) : null}
          {children ? <View className="px-4 py-4">{children}</View> : null}
          {footer ? (
            <View className="flex-row justify-end gap-2 px-4 py-3 border-t border-border">
              {footer}
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
