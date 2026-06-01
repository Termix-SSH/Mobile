import { View } from "react-native";
import { Users } from "lucide-react-native";
import { ServerMetrics } from "@/types";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { MONO_FONT } from "@/app/constants/fonts";
import { WidgetCard } from "./WidgetCard";

export function LoginStatsWidget({ metrics }: { metrics: ServerMetrics }) {
  const color = useThemeColor();
  const login = metrics.loginStats;

  const recent = login?.recentLogins?.slice(0, 5) ?? [];
  const failed = login?.failedLogins?.slice(0, 5) ?? [];
  const total = login?.totalLogins ?? 0;
  const uniqueIPs = login?.uniqueIPs ?? 0;

  const isEmpty = recent.length === 0 && failed.length === 0;

  return (
    <WidgetCard
      icon={<Users size={15} color={color("accent-brand")} />}
      title="Login Activity"
      trailing={
        total > 0 ? (
          <Text className="text-xs text-muted-foreground">{total} total</Text>
        ) : undefined
      }
    >
      {isEmpty ? (
        <Text className="text-[11px] text-muted-foreground">
          No login activity recorded
        </Text>
      ) : (
        <View className="gap-2">
          <Text className="text-[10px] text-muted-foreground">
            {total} logins · {uniqueIPs} unique IP{uniqueIPs !== 1 ? "s" : ""}
          </Text>

          {recent.length > 0 ? (
            <View className="gap-1">
              <Text className="text-[9px] text-muted-foreground uppercase tracking-wide">
                Recent
              </Text>
              {recent.map((e, i) => (
                <View key={i} className="flex-row gap-2">
                  <Text
                    weight="medium"
                    className="text-[10px] text-foreground w-20"
                    numberOfLines={1}
                    style={{ fontFamily: MONO_FONT }}
                  >
                    {e.user}
                  </Text>
                  <Text
                    className="text-[10px] text-muted-foreground flex-1"
                    numberOfLines={1}
                  >
                    {[e.from, e.time, e.type].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {failed.length > 0 ? (
            <View className="gap-1">
              <Text className="text-[9px] text-destructive uppercase tracking-wide">
                Failed
              </Text>
              {failed.map((e, i) => (
                <View key={i} className="flex-row gap-2">
                  <Text
                    weight="medium"
                    className="text-[10px] text-destructive w-20"
                    numberOfLines={1}
                    style={{ fontFamily: MONO_FONT }}
                  >
                    {e.user}
                  </Text>
                  <Text
                    className="text-[10px] text-muted-foreground flex-1"
                    numberOfLines={1}
                  >
                    {[e.from, e.time, e.type].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </WidgetCard>
  );
}
