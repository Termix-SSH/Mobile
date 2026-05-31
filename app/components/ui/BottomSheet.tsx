import { Modal, Pressable, View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./Text";

/**
 * BottomSheet — slide-up themed panel. Used for host action sheets, file ops,
 * pickers, and menus. Square top corners, themed surface, scrim backdrop.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  scroll = false,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const Container: any = scroll ? ScrollView : View;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable className="flex-1 bg-black/50" onPress={onClose} />
      <View
        className="border-t border-border bg-popover"
        style={{ paddingBottom: insets.bottom + 8, maxHeight: "80%" }}
      >
        <View className="items-center pb-1 pt-2.5">
          <View className="h-1 w-9 rounded-full bg-muted-foreground/40" />
        </View>
        {title ? (
          <View className="border-b border-border px-4 pb-2">
            <Text
              weight="bold"
              className="text-[11px] uppercase tracking-[2px] text-muted-foreground"
            >
              {title}
            </Text>
          </View>
        ) : null}
        <Container className={scroll ? "" : ""}>{children}</Container>
      </View>
    </Modal>
  );
}

/** A tappable row inside a BottomSheet (icon + label, optional destructive). */
export function SheetRow({
  icon,
  label,
  onPress,
  destructive,
  trailing,
}: {
  icon?: React.ReactNode;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 border-b border-border/60 px-4 py-3.5 active:bg-muted/40"
    >
      {icon ? <View className="w-5 items-center">{icon}</View> : null}
      <Text
        weight="medium"
        className={`flex-1 text-sm ${destructive ? "text-destructive" : "text-foreground"}`}
      >
        {label}
      </Text>
      {trailing ?? null}
    </Pressable>
  );
}
