import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { useActiveClient } from "@/core/accounts";
import { toast } from "@/utils/toast";
import { Button, EmptyState, Text } from "@/ui";
import {
  decide,
  errorText,
  listApprovals,
  STATE_LABELS,
  type Approval,
} from "./api";
import { t } from "@/i18n";

/**
 * Requests waiting for a person, with the exact input that would run.
 * Deciding needs the app's signed in session, which an API key can't do.
 */
export default function Approvals() {
  const router = useRouter();
  const client = useActiveClient();
  const [items, setItems] = useState<Approval[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      setItems(await listApprovals(client));
    } catch (error) {
      toast.error(
        errorText(error, t("operations.approvals.couldNotLoadApprovals")),
      );
      setItems([]);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const answer = async (item: Approval, approve: boolean) => {
    if (!client) return;
    setBusy(item.id);
    try {
      const outcome = await decide(client, item.id, approve);
      toast.success(
        approve
          ? (outcome.summary ??
              STATE_LABELS[outcome.status] ??
              t("operations.approvals.done"))
          : t("operations.approvals.rejected"),
      );
    } catch (error) {
      toast.error(errorText(error, t("operations.approvals.couldNotDecide")));
    } finally {
      setBusy(null);
      await load();
    }
  };

  return (
    <Screen
      title={t("operations.approvals.approvals")}
      onBack={() => router.back()}
    >
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
        contentContainerStyle={{ padding: 12, gap: 12 }}
      >
        {items && items.length === 0 ? (
          <EmptyState
            title={t("operations.approvals.nothingIsWaiting")}
            hint={t("operations.approvals.actionsARuleHoldsFor")}
          />
        ) : (
          (items ?? []).map((item) => (
            <View key={item.id} className="gap-2 border border-border p-3">
              <Text className="text-body font-medium">{item.run.actionId}</Text>
              <Text className="text-meta text-muted-foreground">
                {[item.run.hostName, item.run.username, item.reason]
                  .filter(Boolean)
                  .join(" | ")}
              </Text>
              <Text className="font-mono text-meta">
                {JSON.stringify(item.run.input ?? {}, null, 2)}
              </Text>
              <View className="flex-row gap-2">
                <Button
                  size="sm"
                  disabled={busy === item.id}
                  onPress={() => void answer(item, true)}
                >
                  {t("operations.approvals.approveAndRun")}
                </Button>
                <Button
                  size="sm"
                  variant="muted"
                  disabled={busy === item.id}
                  onPress={() => void answer(item, false)}
                >
                  {t("operations.approvals.reject")}
                </Button>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
