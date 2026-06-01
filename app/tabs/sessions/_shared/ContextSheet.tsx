import { View } from "react-native";
import { BottomSheet, SheetRow, Text } from "@/app/components/ui";

export interface ContextAction {
  key: string;
  icon: React.ReactNode;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

/**
 * ContextSheet — a long-press action menu built on BottomSheet + SheetRow.
 * Replaces the old absolutely-positioned context menus that could render
 * off-screen. Pass a title (e.g. the file name) and a flat list of actions;
 * tapping a row fires its handler and closes the sheet.
 */
export function ContextSheet({
  visible,
  onClose,
  title,
  subtitle,
  actions,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  actions: (ContextAction | null | false)[];
}) {
  const items = actions.filter(Boolean) as ContextAction[];

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {title ? (
        <View className="px-4 pb-3 pt-1 border-b border-border">
          <Text weight="bold" className="text-base text-foreground" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
      {items.map((a) => (
        <SheetRow
          key={a.key}
          icon={a.icon}
          label={a.label}
          destructive={a.destructive}
          onPress={() => {
            if (a.disabled) return;
            onClose();
            // Defer so the sheet's close animation isn't janked by the action.
            requestAnimationFrame(a.onPress);
          }}
        />
      ))}
    </BottomSheet>
  );
}
