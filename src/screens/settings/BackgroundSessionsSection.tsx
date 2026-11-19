import { useCallback, useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { BatteryCharging } from "lucide-react-native";
import { AccordionSection, Button, FakeSwitch, SettingRow, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import { backgroundSessions } from "@/core/sessions/background";
import { sessionLifecycle } from "@/core/sessions/lifecycle";
import {
  ignoresBatteryOptimizations,
  isSessionServiceAvailable,
  notificationsEnabled,
  openBatteryOptimizationSettings,
  openNotificationSettings,
} from "@/modules/termix-session-service";
import { t } from "@/i18n";

interface Snapshot {
  enabled: boolean;
  battery: boolean;
  notifications: boolean;
  lowPower: boolean;
}

const read = (): Snapshot => ({
  enabled: backgroundSessions.isEnabled,
  battery: ignoresBatteryOptimizations(),
  notifications: notificationsEnabled(),
  lowPower: sessionLifecycle.isLowPower,
});

/** How open sessions behave when the app leaves the screen. */
export function BackgroundSessionsSection({
  open,
  onToggle,
  os = Platform.OS,
}: {
  /** Both left out: the content is drawn on its own, without the accordion. */
  open?: boolean;
  onToggle?: () => void;
  /** Test seam. */
  os?: string;
}) {
  const color = useThemeColor();
  const [state, setState] = useState(read);
  // Settings may change in the system screens; look again when back.
  const refresh = useCallback(() => setState(read()), []);
  useEffect(() => sessionLifecycle.watch(refresh), [refresh]);

  if (os === "web") return null;
  const android = os === "android" && isSessionServiceAvailable;

  const body = (
    <View className="gap-3 pb-2 pt-1">
      {android ? (
        <>
          <SettingRow
            label={t("settings.backgroundSessionsSection.keepSessionsRunning")}
            description={t(
              "settings.backgroundSessionsSection.showsANotificationWhileSessions",
            )}
            last
          >
            <FakeSwitch
              checked={state.enabled}
              onChange={(on) => {
                void backgroundSessions.setEnabled(on).then(refresh);
              }}
            />
          </SettingRow>
          <View className="gap-2 border-t border-border/40 pt-3">
            <Text weight="medium" className="text-sm text-foreground">
              {t("settings.backgroundSessionsSection.batteryOptimization")}
            </Text>
            <Text className="text-[11px] text-muted-foreground">
              {state.battery
                ? t(
                    "settings.backgroundSessionsSection.termixIsNotRestrictedSo",
                  )
                : t(
                    "settings.backgroundSessionsSection.androidMayStillStopSessions",
                  )}
            </Text>
            {!state.battery ? (
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                onPress={() => openBatteryOptimizationSettings()}
              >
                {t("settings.backgroundSessionsSection.openBatterySettings")}
              </Button>
            ) : null}
          </View>
          {!state.notifications ? (
            <View className="gap-2 border-t border-border/40 pt-3">
              <Text weight="medium" className="text-sm text-foreground">
                {t("settings.backgroundSessionsSection.notificationsAreOff")}
              </Text>
              <Text className="text-[11px] text-muted-foreground">
                {t("settings.backgroundSessionsSection.sessionsStillRunButThe")}
              </Text>
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                onPress={() => openNotificationSettings()}
              >
                {t(
                  "settings.backgroundSessionsSection.openNotificationSettings",
                )}
              </Button>
            </View>
          ) : null}
        </>
      ) : (
        <Text className="text-meta text-muted-foreground">
          {os === "android"
            ? t("settings.backgroundSessionsSection.thisBuildCanTKeep")
            : t("settings.backgroundSessionsSection.iosStopsAppsSoonAfter")}
        </Text>
      )}
      {state.lowPower ? (
        <Text className="text-[11px] text-muted-foreground">
          {t("settings.backgroundSessionsSection.isOnTermixChecksConnections", {
            value:
              os === "ios"
                ? t("settings.backgroundSessionsSection.lowPowerMode")
                : t("settings.backgroundSessionsSection.batterySaver"),
          })}
        </Text>
      ) : null}
    </View>
  );

  if (!onToggle) return body;
  return (
    <AccordionSection
      label={t("settings.backgroundSessionsSection.backgroundSessions")}
      icon={<BatteryCharging size={14} color={color("muted-foreground")} />}
      open={!!open}
      onToggle={onToggle}
    >
      {body}
    </AccordionSection>
  );
}
