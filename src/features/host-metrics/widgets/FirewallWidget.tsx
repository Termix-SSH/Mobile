import { View } from "react-native";
import { Shield } from "lucide-react-native";
import { ServerMetrics } from "@/types";
import { Text, Badge } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { WidgetCard } from "./WidgetCard";
import { t } from "@/i18n";

export function FirewallWidget({ metrics }: { metrics: ServerMetrics }) {
  const color = useThemeColor();
  const fw = metrics.firewall;
  const status = fw?.status ?? "unknown";
  const ruleCount =
    fw?.chains?.reduce((sum, c) => sum + (c.rules?.length ?? 0), 0) ?? 0;

  return (
    <WidgetCard
      icon={<Shield size={15} color={color("accent-brand")} />}
      title={t("hostMetrics.widgets.firewallWidget.firewall")}
      trailing={
        <Badge variant={status === "active" ? "success" : "muted"}>
          {status}
        </Badge>
      }
    >
      <View className="gap-0.5">
        {fw?.type && fw.type !== "none" ? (
          <Text className="text-meta text-muted-foreground">
            {t("hostMetrics.widgets.firewallWidget.rules", {
              type: fw.type,
              ruleCount,
            })}
          </Text>
        ) : (
          <Text className="text-meta text-muted-foreground">
            {t("hostMetrics.widgets.firewallWidget.noFirewallDetected")}
          </Text>
        )}
      </View>
    </WidgetCard>
  );
}
