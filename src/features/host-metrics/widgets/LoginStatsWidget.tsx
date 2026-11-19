import { View } from "react-native";
import { Users } from "lucide-react-native";
import { LoginEvent, ServerMetrics } from "@/types";
import { Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { MONO_FONT } from "@/constants/fonts";
import { WidgetCard, Stats } from "./WidgetCard";
import { t } from "@/i18n";

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
      title={t("hostMetrics.widgets.loginStatsWidget.loginActivity")}
    >
      {recent.length === 0 && failed.length === 0 ? (
        <Text className="text-meta text-muted-foreground">
          {t("hostMetrics.widgets.loginStatsWidget.noLoginActivityRecorded")}
        </Text>
      ) : (
        <View className="gap-2.5">
          <Stats
            items={[
              {
                label: t("hostMetrics.widgets.loginStatsWidget.logins"),
                value: String(total),
              },
              {
                label: t("hostMetrics.widgets.loginStatsWidget.uniqueIps"),
                value: String(uniqueIPs),
              },
              {
                label: t("hostMetrics.widgets.loginStatsWidget.failed"),
                value: login?.failedLogins?.length
                  ? String(login.failedLogins.length)
                  : null,
              },
            ]}
          />
          <LoginRows
            title={t("hostMetrics.widgets.loginStatsWidget.recent")}
            rows={recent}
          />
          <LoginRows
            title={t("hostMetrics.widgets.loginStatsWidget.failed")}
            rows={failed}
            failed
          />
        </View>
      )}
    </WidgetCard>
  );
}
