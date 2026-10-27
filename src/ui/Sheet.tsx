import { Fragment, isValidElement, useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { ReduceMotion, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { Text } from "./Text";
import { useThemeColor } from "@/contexts/ThemeContext";

/** Sheets stop growing wider than this, so a sideways phone or tablet keeps them readable. */
const SHEET_MAX_WIDTH = 640;

/**
 * Keyboard height on Android. Edge to edge dialogs don't resize, and a
 * KeyboardAvoidingView misses a keyboard that was already up at mount.
 */
function useAndroidKeyboard(active: boolean): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!active || Platform.OS !== "android") return;
    if (Keyboard.isVisible()) setHeight(Keyboard.metrics()?.height ?? 0);
    const show = Keyboard.addListener("keyboardDidShow", (e) =>
      setHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
      setHeight(0);
    };
  }, [active]);
  return height;
}

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
  const { width, height } = useWindowDimensions();
  const color = useThemeColor();
  const close = dismissable ? onClose : () => {};
  // A full width sheet keeps its rows clear of a notch held sideways.
  const fullWidth =
    width <= SHEET_MAX_WIDTH + 2 * Math.max(insets.left, insets.right);
  // On a short window any sheet can run past its cap, so it always scrolls.
  const scrolls = scroll || height < 500;
  const androidKeyboard = useAndroidKeyboard(visible);

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
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        enabled={Platform.OS === "ios"}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        {/* Fills the whole window, so a sheet stopped short of the bottom
            never leaves a gap without the dim. */}
        <Pressable
          className="absolute inset-0 bg-overlay"
          onPress={close}
          // The X button closes too; the backdrop is skipped by screen readers.
          accessible={false}
          importantForAccessibility="no"
        />
        <Animated.View
          entering={SlideInDown.duration(220).reduceMotion(ReduceMotion.System)}
          accessibilityViewIsModal
          onAccessibilityEscape={close}
          className={`border-t bg-popover ${fullWidth ? "" : "border-x"} ${tone === "destructive" ? "border-destructive/40" : "border-border"}`}
          style={{
            paddingBottom: Math.max(insets.bottom, androidKeyboard),
            paddingLeft: fullWidth ? insets.left : 0,
            paddingRight: fullWidth ? insets.right : 0,
            maxHeight: "85%",
            width: "100%",
            maxWidth: SHEET_MAX_WIDTH,
            alignSelf: "center",
          }}
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
            scrolls ? (
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
