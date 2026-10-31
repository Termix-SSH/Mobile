import { useCallback, useEffect } from "react";
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Animated, { ReduceMotion, SlideInRight } from "react-native-reanimated";
import { ArrowLeft } from "lucide-react-native";
import { Text } from "./Text";
import { useThemeColor } from "@/contexts/ThemeContext";
import { HEIGHTS } from "@/constants/tokens";
import { useBottomInset, useSideInsets, useTopInset } from "./bottom-inset";

/**
 * What used to be a full screen modal: a view that covers the screen it was
 * opened from, with a Back button. Put it last inside a full screen parent.
 */
export function InlineView({
  open,
  onClose,
  title,
  subtitle,
  icon,
  actions,
  footer,
  onBeforeClose,
  scroll = true,
  bare = false,
  safeTop,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: string;
  icon?: React.ReactNode;
  /** Buttons on the right of the header. */
  actions?: React.ReactNode;
  /** Pinned under the body, usually Cancel and Save. */
  footer?: React.ReactNode;
  /** Return false to stay open, for an unsaved changes guard. */
  onBeforeClose?: () => boolean | Promise<boolean>;
  scroll?: boolean;
  /** Draw children edge to edge, for views with their own layout. */
  bare?: boolean;
  /** Pad for the status bar. By default only when the parent does not. */
  safeTop?: boolean;
  children: React.ReactNode;
}) {
  const topInset = useTopInset();
  const side = useSideInsets();
  const bottomInset = useBottomInset();
  const color = useThemeColor();

  const requestClose = useCallback(async () => {
    if (onBeforeClose && !(await onBeforeClose())) return;
    onClose();
  }, [onBeforeClose, onClose]);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      void requestClose();
      return true;
    });
    return () => sub.remove();
  }, [open, requestClose]);

  if (!open) return null;

  const body = bare ? children : <View className="gap-3 p-3">{children}</View>;

  return (
    <Animated.View
      entering={SlideInRight.duration(220).reduceMotion(ReduceMotion.System)}
      accessibilityViewIsModal
      onAccessibilityEscape={() => void requestClose()}
      style={[
        StyleSheet.absoluteFill,
        {
          zIndex: 50,
          paddingTop: (safeTop ?? true) ? topInset : 0,
          paddingLeft: side.left,
          paddingRight: side.right,
        },
      ]}
      className="bg-background"
    >
      <KeyboardAvoidingView
        // Edge to edge Android no longer resizes for the keyboard.
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View
          style={{ minHeight: HEIGHTS.header }}
          className="flex-row items-center gap-2 border-b border-border px-1.5"
        >
          <Pressable
            onPress={() => void requestClose()}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Back"
            className="h-11 w-11 items-center justify-center active:bg-muted"
          >
            <ArrowLeft size={20} color={color("foreground")} />
          </Pressable>
          {icon ? <View className="shrink-0">{icon}</View> : null}
          <View className="min-w-0 flex-1 py-2">
            {typeof title === "string" ? (
              <Text
                weight="bold"
                numberOfLines={1}
                accessibilityRole="header"
                className="text-title text-foreground"
              >
                {title}
              </Text>
            ) : (
              title
            )}
            {subtitle ? (
              <Text
                numberOfLines={1}
                className="text-meta text-muted-foreground"
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          {actions ? (
            <View className="shrink-0 flex-row items-center gap-1 pr-1.5">
              {actions}
            </View>
          ) : null}
        </View>
        {scroll ? (
          <ScrollView
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingBottom: footer ? 0 : bottomInset,
            }}
          >
            {body}
          </ScrollView>
        ) : (
          <View className="flex-1">{body}</View>
        )}
        {footer ? (
          <View
            className="border-t border-border px-3 pt-3"
            style={{ paddingBottom: Math.max(bottomInset, 12) }}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Animated.View>
  );
}
