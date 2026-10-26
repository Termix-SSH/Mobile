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
            label="Keep sessions running"
            description="Shows a notification while sessions are open, so Android keeps them going when you leave the app"
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
              Battery optimization
            </Text>
            <Text className="text-[11px] text-muted-foreground">
              {state.battery
                ? "Termix is not restricted, so sessions can stay open with the screen off."
                : "Android may still stop sessions to save battery. Open the battery settings, find Termix and pick Not optimized or Unrestricted."}
            </Text>
            {!state.battery ? (
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                onPress={() => openBatteryOptimizationSettings()}
              >
                Open battery settings
              </Button>
            ) : null}
          </View>
          {!state.notifications ? (
            <View className="gap-2 border-t border-border/40 pt-3">
              <Text weight="medium" className="text-sm text-foreground">
                Notifications are off
              </Text>
              <Text className="text-[11px] text-muted-foreground">
                Sessions still run, but the list of open sessions and the
                Disconnect all button stay hidden.
              </Text>
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                onPress={() => openNotificationSettings()}
              >
                Open notification settings
              </Button>
            </View>
          ) : null}
        </>
      ) : (
        <Text className="text-meta text-muted-foreground">
          {os === "android"
            ? "This build can't keep sessions running in the background. They reconnect when you come back."
            : "iOS stops apps soon after you leave them, so sessions can't run in the background. They reconnect when you come back, and tmux or screen picks up where you were."}
        </Text>
      )}
      {state.lowPower ? (
        <Text className="text-[11px] text-muted-foreground">
          {os === "ios" ? "Low Power Mode" : "Battery saver"} is on. Termix
          checks connections less often and waits longer between reconnect
          tries.
        </Text>
      ) : null}
    </View>
  );

  if (!onToggle) return body;
  return (
    <AccordionSection
      label="Background sessions"
      icon={<BatteryCharging size={14} color={color("muted-foreground")} />}
      open={!!open}
      onToggle={onToggle}
    >
      {body}
    </AccordionSection>
  );
}
