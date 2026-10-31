import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { Text } from "@/ui";
import { useSideInsets, useTopInset } from "@/ui/bottom-inset";
import { useThemeColor } from "@/contexts/ThemeContext";
import { HEIGHTS, ICON_SIZES } from "@/constants/tokens";

/** The one Back button every header uses. */
export function BackButton({
  onPress,
  label = "Back",
}: {
  onPress: () => void;
  label?: string;
}) {
  const color = useThemeColor();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      className="h-9 w-9 items-center justify-center active:bg-muted"
    >
      <ArrowLeft size={ICON_SIZES.lg} color={color("foreground")} />
    </Pressable>
  );
}

/** Header row: Back, title and subtitle, actions on the right. */
export function ScreenHeader({
  title,
  titleNode,
  subtitle,
  onBack,
  headerLeft,
  headerRight,
}: {
  title?: string;
  titleNode?: React.ReactNode;
  subtitle?: string;
  onBack?: () => void;
  headerLeft?: React.ReactNode;
  headerRight?: React.ReactNode;
}) {
  const left = onBack ? <BackButton onPress={onBack} /> : headerLeft;
  return (
    <View
      style={{ minHeight: HEIGHTS.header }}
      className={`flex-row items-center justify-between border-b border-border py-2 ${left ? "pl-1.5 pr-3" : "px-3"}`}
    >
      {left ? <View className="mr-2 shrink-0">{left}</View> : null}
      <View className="min-w-0 flex-1">
        {titleNode ?? (
          <Text
            weight="bold"
            numberOfLines={1}
            accessibilityRole="header"
            className="text-title text-foreground"
          >
            {title}
          </Text>
        )}
        {subtitle ? (
          <Text
            numberOfLines={1}
            className="mt-0.5 text-meta text-muted-foreground"
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {headerRight ? (
        <View className="ml-3 shrink-0 flex-row items-center gap-1">
          {headerRight}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Screen - top-level themed container with safe-area top padding and an
 * optional header (title + actions).
 */
export function Screen({
  title,
  titleNode,
  subtitle,
  onBack,
  headerLeft,
  headerRight,
  children,
  scrollableHeader,
  keyboardAvoiding,
  overlay,
}: {
  title?: string;
  /** Drawn in place of the title, like the account switcher. */
  titleNode?: React.ReactNode;
  subtitle?: string;
  /** Shows a Back button on the left. */
  onBack?: () => void;
  headerLeft?: React.ReactNode;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  /** When true, the header is part of the scroll content (caller handles it). */
  scrollableHeader?: boolean;
  /** Lift the body over the keyboard, for screens with text fields. */
  keyboardAvoiding?: boolean;
  /** Inline views drawn over the whole screen, header included. */
  overlay?: React.ReactNode;
}) {
  const topInset = useTopInset();
  const side = useSideInsets();
  const body = <View className="flex-1">{children}</View>;

  return (
    <View
      className="flex-1 bg-background"
      style={{
        paddingTop: topInset,
        paddingLeft: side.left,
        paddingRight: side.right,
      }}
    >
      {(title || titleNode) && !scrollableHeader ? (
        <ScreenHeader
          title={title}
          titleNode={titleNode}
          subtitle={subtitle}
          onBack={onBack}
          headerLeft={headerLeft}
          headerRight={headerRight}
        />
      ) : null}
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
      {overlay}
    </View>
  );
}
