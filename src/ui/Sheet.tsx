import { Fragment, isValidElement } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import Animated, { ReduceMotion, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { Text } from "./Text";
import { useThemeColor } from "@/contexts/ThemeContext";

/**
 * Sheet - square panel that slides up from the bottom. Used for menus,
 * pickers, confirms and short forms, where core uses a pane prompt.
 */
export function Sheet({
  visible,
  onClose,
  onDismiss,
  title,
  description,
  icon,
  tone = "default",
  footer,
  children,
  scroll = false,
  dismissable = true,
}: {
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  title?: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "destructive";
  /** Pinned under the body, usually Cancel and a main action. */
  footer?: React.ReactNode;
  children?: React.ReactNode;
  scroll?: boolean;
  /** When false, tapping outside and the back button do nothing. */
  dismissable?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const color = useThemeColor();
  const close = dismissable ? onClose : () => {};

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
      onDismiss={onDismiss}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <Pressable
          className="flex-1 bg-overlay"
          onPress={close}
          // The X button closes too; the backdrop is skipped by screen readers.
          accessible={false}
          importantForAccessibility="no"
        />
        <Animated.View
          entering={SlideInDown.duration(220).reduceMotion(ReduceMotion.System)}
          accessibilityViewIsModal
          onAccessibilityEscape={close}
          className={`border-t bg-popover ${tone === "destructive" ? "border-destructive/40" : "border-border"}`}
          style={{ paddingBottom: insets.bottom, maxHeight: "85%" }}
        >
          <View className="items-center pb-1 pt-2">
            <View className="h-1 w-9 bg-muted-foreground/30" />
          </View>
          {title ? (
            <View className="flex-row items-start gap-2.5 px-4 pb-3 pt-2">
              {icon ? <View className="mt-0.5 shrink-0">{icon}</View> : null}
              <View className="min-w-0 flex-1 gap-1">
                <Text
                  weight="bold"
                  accessibilityRole="header"
                  className="text-sm text-foreground"
                >
                  {title}
                </Text>
                {typeof description === "string" ? (
                  <Text className="text-xs leading-snug text-muted-foreground">
                    {description}
                  </Text>
                ) : (
                  (description ?? null)
                )}
              </View>
              {dismissable ? (
                <Pressable
                  onPress={onClose}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  className="mt-0.5 shrink-0"
                >
                  <X size={16} color={color("muted-foreground")} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {children ? (
            scroll ? (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                className={title ? "border-t border-border" : ""}
              >
                {children}
              </ScrollView>
            ) : (
              <View className={title ? "border-t border-border" : ""}>
                {children}
              </View>
            )
          ) : null}
          {footer ? (
            <View
              className={`border-t border-border px-4 py-3 ${isValidElement(footer) && footer.type === Fragment ? "flex-row justify-end gap-2" : ""}`}
            >
              {footer}
            </View>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Padded body for a Sheet that holds a form or text instead of rows. */
export function SheetBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={`gap-3 px-4 py-4 ${className ?? ""}`}>{children}</View>
  );
}

/** A tappable row inside a Sheet (icon + label, optional destructive). */
export function SheetRow({
  icon,
  label,
  description,
  onPress,
  destructive,
  selected,
  disabled,
  trailing,
}: {
  icon?: React.ReactNode;
  label: string;
  description?: string;
  onPress: () => void;
  destructive?: boolean;
  selected?: boolean;
  disabled?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      className={`min-h-12 flex-row items-center gap-3 border-b border-l-2 border-b-border/40 px-4 py-3 active:bg-muted/50 ${selected ? "border-l-accent-brand bg-accent-brand/10" : "border-l-transparent"} ${disabled ? "opacity-50" : ""}`}
    >
      {icon ? <View className="w-5 items-center">{icon}</View> : null}
      <View className="min-w-0 flex-1">
        <Text
          weight="medium"
          className={`text-row ${destructive ? "text-destructive-text" : selected ? "text-accent-text" : "text-foreground"}`}
        >
          {label}
        </Text>
        {description ? (
          <Text className="mt-0.5 text-meta text-muted-foreground">
            {description}
          </Text>
        ) : null}
      </View>
      {trailing ?? null}
    </Pressable>
  );
}
