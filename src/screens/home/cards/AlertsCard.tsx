import { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Bell } from "lucide-react-native";
import { useClient } from "@/core/accounts";
import type { AlertItem } from "@/core/api/modules/alerts";
import { usePoll } from "@/core/exec";
import type { HomeCardProps } from "@/core/features/types";
import { setUnread } from "@/screens/notifications/unread";
import { ListRow, type ListRowTone, Text } from "@/ui";
import { ago } from "@/utils/ago";
import { HomeCard } from "../HomeCard";

const SHOWN = 5;
const POLL_MS = 60_000;

const TONE: Record<string, ListRowTone> = {
  critical: "destructive",
  error: "destructive",
  warning: "warning",
  success: "success",
  info: "brand",
};

const openInbox = () => router.push("/tabs/settings/Notifications" as never);

/** Unread notifications. Hidden when there are none. */
export function AlertsCard({ accountId, active, refreshKey }: HomeCardProps) {
  const client = useClient(accountId);
  const [page, setPage] = useState<{ items: AlertItem[]; unread: number }>();

  const load = useCallback(async () => {
    if (!client || !client.api.alerts.available()) return;
    try {
      const next = await client.api.alerts.list({ unread: true, limit: SHOWN });
      setPage(next);
      setUnread(next.unread);
    } catch {
      // Keeps what it showed when the server can't be reached.
    }
  }, [client]);

  usePoll(load, {
    intervalMs: POLL_MS,
    enabled: active,
    restartKey: refreshKey,
  });

  const unread = page?.items.filter((a) => !a.read) ?? [];
  if (unread.length === 0) return null;

  return (
    <HomeCard
      title="Notifications"
      icon={Bell}
      meta={`${page?.unread ?? unread.length} unread`}
      action="See all"
      onAction={openInbox}
    >
      <View>
        {unread.slice(0, SHOWN).map((item, index) => (
          <ListRow
            key={item.id}
            index={index}
            tone={TONE[item.severity] ?? "muted"}
            title={item.title}
            meta={
              <Text
                className="text-meta text-muted-foreground"
                numberOfLines={2}
              >
                {[item.message, ago(item.createdAt)]
                  .filter(Boolean)
                  .join(" | ")}
              </Text>
            }
            onPress={openInbox}
          />
        ))}
      </View>
    </HomeCard>
  );
}
