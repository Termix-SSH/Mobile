import { View } from "react-native";
import { Users } from "lucide-react-native";
import { LoginEvent, ServerMetrics } from "@/types";
import { Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { MONO_FONT } from "@/constants/fonts";
import { WidgetCard, Stats } from "./WidgetCard";

function LoginRows({
  title,
  rows,
  failed = false,
}: {
  title: string;
  rows: LoginEvent[];
  failed?: boolean;
}) {
  if (!rows.length) return null;
  return (
    <View className="gap-1">
      <Text
        className={`text-2xs uppercase tracking-wide ${failed ? "text-destructive-text" : "text-muted-foreground"}`}
      >
        {title}
      </Text>
      {rows.map((e, i) => (
        <View key={i} className="flex-row gap-2">
          <Text
            weight="medium"
            className={`w-20 text-meta ${failed ? "text-destructive-text" : "text-foreground"}`}
            numberOfLines={1}
            style={{ fontFamily: MONO_FONT }}
          >
            {e.user}
          </Text>
          <Text
            className="flex-1 text-meta text-muted-foreground"
            numberOfLines={1}
          >
            {[e.ip, e.time].filter(Boolean).join(" | ")}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function LoginStatsWidget({ metrics }: { metrics: ServerMetrics }) {
  const color = useThemeColor();
  const login = metrics.loginStats;

  const recent = login?.recentLogins?.slice(0, 5) ?? [];
  const failed = login?.failedLogins?.slice(0, 5) ?? [];
  const total = login?.totalLogins ?? 0;
  const uniqueIPs = login?.uniqueIPs ?? 0;

  return (
    <WidgetCard
      icon={<Users size={15} color={color("accent-brand")} />}
      title="Login activity"
    >
      {recent.length === 0 && failed.length === 0 ? (
        <Text className="text-meta text-muted-foreground">
          No login activity recorded
        </Text>
      ) : (
        <View className="gap-2.5">
          <Stats
            items={[
              { label: "Logins", value: String(total) },
              { label: "Unique IPs", value: String(uniqueIPs) },
              {
                label: "Failed",
                value: login?.failedLogins?.length
                  ? String(login.failedLogins.length)
                  : null,
              },
            ]}
          />
          <LoginRows title="Recent" rows={recent} />
          <LoginRows title="Failed" rows={failed} failed />
        </View>
      )}
    </WidgetCard>
  );
}
