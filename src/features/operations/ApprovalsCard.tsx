import { useCallback, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { ShieldCheck } from "lucide-react-native";
import { useClient } from "@/core/accounts";
import { usePoll } from "@/core/exec";
import type { HomeCardProps } from "@/core/features/types";
import { HomeCard } from "@/screens/home/HomeCard";
import { Button, Text } from "@/ui";
import { toast } from "@/utils/toast";
import { decide, errorText, listApprovals, type Approval } from "./api";
import { t } from "@/i18n";

const SHOWN = 3;
const POLL_MS = 30_000;

/** Actions waiting for a yes, answered right from Home. */
export function ApprovalsCard({
  accountId,
  active,
  refreshKey,
}: HomeCardProps) {
  const client = useClient(accountId);
  const [items, setItems] = useState<Approval[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      setItems(await listApprovals(client));
    } catch {
      // Keeps the last list when the server can't be reached.
    }
  }, [client]);

  usePoll(load, {
    intervalMs: POLL_MS,
    enabled: active,
    restartKey: refreshKey,
  });

  if (items.length === 0) return null;

  const answer = async (item: Approval, approve: boolean) => {
    if (!client) return;
    setBusy(item.id);
    try {
      const outcome = await decide(client, item.id, approve);
      toast.success(
        approve
          ? (outcome.summary ?? t("operations.approvalsCard.approved"))
          : t("operations.approvalsCard.rejected"),
      );
    } catch (error) {
      toast.error(
        errorText(error, t("operations.approvalsCard.couldNotDecide")),
      );
    } finally {
      setBusy(null);
      await load();
    }
  };

  return (
    <HomeCard
      title={t("operations.approvalsCard.waitingForApproval")}
      icon={ShieldCheck}
      meta={String(items.length)}
      action={t("operations.approvalsCard.seeAll")}
      onAction={() => router.push("/tabs/settings/Approvals" as never)}
      padded
    >
      <View className="gap-3">
        {items.slice(0, SHOWN).map((item) => (
          <View key={item.id} className="gap-1.5">
            <Text className="text-sm text-foreground" numberOfLines={1}>
              {item.run.actionId}
            </Text>
            <Text
              className="text-[11px] text-muted-foreground"
              numberOfLines={2}
            >
              {[item.run.hostName, item.run.username, item.reason]
                .filter(Boolean)
                .join(" | ")}
            </Text>
            <View className="flex-row gap-2">
              <Button
                size="sm"
                disabled={busy === item.id}
                onPress={() => void answer(item, true)}
              >
                {t("operations.approvalsCard.approve")}
              </Button>
              <Button
                size="sm"
                variant="muted"
                disabled={busy === item.id}
                onPress={() => void answer(item, false)}
              >
                {t("operations.approvalsCard.reject")}
              </Button>
            </View>
          </View>
        ))}
      </View>
    </HomeCard>
  );
}
