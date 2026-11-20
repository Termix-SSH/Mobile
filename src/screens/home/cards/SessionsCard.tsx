import { View } from "react-native";
import { SquareTerminal } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import { displayTitle } from "@/contexts/session-tabs";
import { features } from "@/core/features/registry";
import { useSessionStatuses } from "@/core/sessions/status";
import {
  statusLabel,
  TabStatusMark,
} from "@/screens/sessions/navigation/TabStatusMark";
import { openTab } from "@/screens/shell/navigate";
import { ListRow, Text } from "@/ui";
import { HomeCard } from "../HomeCard";
import { t } from "@/i18n";

/** The tabs that are open, to jump back in. */
export function SessionsCard() {
  const color = useThemeColor();
  const { sessions, activeSessionId, setActiveSession } = useTerminalSessions();
  const statuses = useSessionStatuses();
  if (sessions.length === 0) return null;
  const muted = color("muted-foreground");

  return (
    <HomeCard
      title={t("home.cards.sessionsCard.openSessions")}
      icon={SquareTerminal}
      meta={String(sessions.length)}
      action="All"
      onAction={() => openTab("/(tabs)/sessions")}
    >
      <View>
        {sessions.map((session, index) => {
          const Icon =
            features.sessionTab(session.type)?.icon ?? SquareTerminal;
          const state = statuses[session.id]?.state;
          return (
            <ListRow
              key={session.id}
              index={index}
              selected={session.id === activeSessionId}
              title={displayTitle(session)}
              icon={<Icon size={16} color={muted} />}
              meta={
                <Text className="text-meta text-muted-foreground">
                  {statusLabel(state) ??
                    (state === "connected"
                      ? t("home.cards.sessionsCard.connected")
                      : session.host.ip)}
                </Text>
              }
              trailing={<TabStatusMark state={state} />}
              onPress={() => {
                setActiveSession(session.id);
                openTab("/(tabs)/sessions");
              }}
            />
          );
        })}
      </View>
    </HomeCard>
  );
}
