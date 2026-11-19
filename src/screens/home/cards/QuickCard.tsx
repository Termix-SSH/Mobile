import { useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronRight, LayoutGrid, Zap } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useCapability, useQuickActions } from "@/core/features/hooks";
import { QuickConnect } from "@/screens/hosts/QuickConnect";
import { ListRow, Text } from "@/ui";
import { HomeCard } from "../HomeCard";
import { t } from "@/i18n";

/** Quick connect, and screens from features and server plugins. */
export function QuickCard() {
  const color = useThemeColor();
  const muted = color("muted-foreground");
  const canQuickConnect = useCapability("host.quickConnect");
  const { ctx, actions } = useQuickActions();
  const [quickOpen, setQuickOpen] = useState(false);
  if (!canQuickConnect && actions.length === 0) return null;

  return (
    <HomeCard title={t("home.cards.quickCard.quickAccess")} icon={LayoutGrid}>
      {canQuickConnect ? (
        <ListRow
          title={t("home.cards.quickCard.quickConnect")}
          icon={<Zap size={16} color={muted} />}
          meta={
            <Text className="text-meta text-muted-foreground">
              {t("home.cards.quickCard.userHostPortWithoutSaving")}
            </Text>
          }
          trailing={<ChevronRight size={16} color={muted} />}
          onPress={() => setQuickOpen(true)}
        />
      ) : null}
      {actions.length > 0 ? (
        <View
          className={`flex-row flex-wrap ${canQuickConnect ? "border-t border-border" : ""}`}
        >
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Pressable
                key={action.id}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                onPress={() => action.run(ctx)}
                className="w-1/4 items-center gap-1.5 px-1 py-3 active:bg-muted/40"
              >
                <Icon size={20} color={color("foreground")} />
                <Text
                  className="text-center text-[11px] text-muted-foreground"
                  numberOfLines={2}
                >
                  {action.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <QuickConnect visible={quickOpen} onClose={() => setQuickOpen(false)} />
    </HomeCard>
  );
}
