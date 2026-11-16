import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { useActiveClient } from "@/core/accounts";
import { Badge, EmptyState, ListRow } from "@/ui";
import { errorText, listRuns, STATE_LABELS, type Run } from "./api";

const VARIANT: Record<string, "success" | "destructive" | "warning" | "muted"> =
  {
    success: "success",
    failed: "destructive",
    pending_approval: "warning",
    needs_interaction: "warning",
    interrupted: "warning",
  };

/** Recent actions, from any device or surface, newest first. */
export default function RunHistory() {
  const router = useRouter();
  const client = useActiveClient();
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      setRuns(await listRuns(client));
      setError("");
    } catch (e) {
      setError(errorText(e, "Could not load history"));
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen title="Run history" onBack={() => router.back()}>
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
      >
        {error ? (
          <EmptyState title={error} />
        ) : runs && runs.length === 0 ? (
          <EmptyState title="Nothing has run yet" />
        ) : (
          (runs ?? []).map((run, index) => (
            <ListRow
              key={run.id}
              index={index}
              title={run.actionId}
              meta={[
                run.hostName,
                run.summary ?? run.error,
                new Date(run.createdAt).toLocaleString(),
              ]
                .filter(Boolean)
                .join(" | ")}
              badges={
                <Badge variant={VARIANT[run.status] ?? "muted"}>
                  {run.dryRun
                    ? "Dry run"
                    : (STATE_LABELS[run.status] ?? run.status)}
                </Badge>
              }
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
