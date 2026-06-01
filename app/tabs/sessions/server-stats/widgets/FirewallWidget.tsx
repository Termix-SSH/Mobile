import { View } from "react-native";
import { Shield } from "lucide-react-native";
import { ServerMetrics } from "@/types";
import { Text, Badge } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { WidgetCard } from "./WidgetCard";

export function FirewallWidget({ metrics }: { metrics: ServerMetrics }) {
  const color = useThemeColor();
  const fw = metrics.firewall;
  const status = fw?.status ?? "unknown";
  const ruleCount =
    fw?.chains?.reduce((sum, c) => sum + (c.rules?.length ?? 0), 0) ?? 0;

  return (
    <WidgetCard
      icon={<Shield size={15} color={color("accent-brand")} />}
      title="Firewall"
      trailing={
        <Badge variant={status === "active" ? "success" : "muted"}>
          {status}
        </Badge>
      }
    >
      <View className="gap-0.5">
        {fw?.type && fw.type !== "none" ? (
          <Text className="text-[11px] text-muted-foreground">
            {fw.type} · {ruleCount} rules
          </Text>
        ) : (
          <Text className="text-[11px] text-muted-foreground">
            No firewall detected
          </Text>
        )}
      </View>
    </WidgetCard>
  );
}
