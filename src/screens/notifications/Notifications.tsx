import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Bell, Check, CheckCheck, Trash2 } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useActiveClient } from "@/core/accounts";
import type { AlertItem } from "@/core/api/modules/alerts";
import { setUnread } from "@/screens/notifications/unread";
import { toast } from "@/utils/toast";
import {
  Button,
  EmptyState,
  ListRow,
  ListRowAction,
  Tabs,
  type ListRowTone,
} from "@/ui";
import { t } from "@/i18n";

const TONE: Record<string, ListRowTone> = {
  critical: "destructive",
  error: "destructive",
  warning: "warning",
  success: "success",
  info: "brand",
};

type Filter = "unread" | "all";

/** The server's alerts for this user, newest first. */
export default function Notifications() {
  const router = useRouter();
  const color = useThemeColor();
  const muted = color("muted-foreground");
  const client = useActiveClient();
  const [view, setView] = useState<Filter>("unread");
  const [items, setItems] = useState<AlertItem[] | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const canDelete = client?.api.alerts.canDelete() ?? false;

  const load = useCallback(async () => {
    if (!client) return;
    try {
      const page = await client.api.alerts.list({ unread: view === "unread" });
      setItems(page.items);
      setUnread(page.unread);
      setError("");
    } catch (e: any) {
      setError(e?.message || t("notifications.couldNotLoadNotifications"));
      setItems([]);
    }
  }, [client, view]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (work: () => Promise<void>, failed: string) => {
    setBusy(true);
    try {
      await work();
    } catch (e: any) {
      toast.error(e?.message || failed);
    } finally {
      setBusy(false);
      await load();
    }
  };

  const markRead = (item: AlertItem) => {
    // Hide it right away in the unread view.
    setItems((prev) =>
      view === "unread"
        ? (prev ?? []).filter((a) => a.id !== item.id)
        : (prev ?? []).map((a) =>
            a.id === item.id ? { ...a, read: true } : a,
          ),
    );
    void run(
      () => client!.api.alerts.markRead([item.id]),
      t("notifications.couldNotMarkRead"),
    );
  };

  const remove = (item: AlertItem) => {
    setItems((prev) => (prev ?? []).filter((a) => a.id !== item.id));
    void run(
      () => client!.api.alerts.remove(item.id),
      t("notifications.couldNotDelete"),
    );
  };

  const hasUnread = (items ?? []).some((a) => !a.read);

  return (
    <Screen
      title={t("notifications.notifications")}
      onBack={() => router.back()}
      headerRight={
        <View className="flex-row items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            accessibilityLabel={t("notifications.markAllRead")}
            disabled={busy || !hasUnread}
            onPress={() =>
              void run(
                () => client!.api.alerts.markRead("all"),
                t("notifications.couldNotMarkRead"),
              )
            }
            icon={<CheckCheck size={18} color={muted} />}
          />
          {canDelete ? (
            <Button
              variant="ghost"
              size="icon"
              accessibilityLabel={t("notifications.clearReadNotifications")}
              disabled={busy}
              onPress={() =>
                void run(
                  () => client!.api.alerts.clear(true),
                  t("notifications.couldNotClear"),
                )
              }
              icon={<Trash2 size={18} color={muted} />}
            />
          ) : null}
        </View>
      }
    >
      {canDelete ? (
        <View className="px-3 pt-3">
          <Tabs
            value={view}
            onChange={(next) => {
              if (next === view) return;
              setItems(null);
              setView(next);
            }}
            options={[
              { id: "unread", label: t("notifications.unread2") },
              { id: "all", label: t("notifications.all") },
            ]}
          />
        </View>
      ) : null}
      {items === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={color("accent-brand")} />
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          contentContainerStyle={{ paddingTop: 12 }}
        >
          {error ? (
            <EmptyState title={error} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={
                view === "unread"
                  ? t("notifications.noUnreadNotifications")
                  : t("notifications.nothingHere")
              }
            />
          ) : (
            items.map((item, index) => (
              <ListRow
                key={item.id}
                index={index}
                tone={TONE[item.severity] ?? "muted"}
                dimmed={item.read}
                title={item.title}
                meta={[
                  item.message,
                  item.createdAt
                    ? new Date(item.createdAt).toLocaleString()
                    : null,
                ]
                  .filter(Boolean)
                  .join(" | ")}
                trailing={
                  <View className="flex-row items-center">
                    {!item.read ? (
                      <ListRowAction
                        label={t("notifications.markRead")}
                        onPress={() => markRead(item)}
                      >
                        <Check size={15} color={muted} />
                      </ListRowAction>
                    ) : null}
                    {canDelete ? (
                      <ListRowAction
                        label={t("notifications.delete")}
                        tone="destructive"
                        onPress={() => remove(item)}
                      >
                        <Trash2 size={15} color={muted} />
                      </ListRowAction>
                    ) : null}
                  </View>
                }
              />
            ))
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
