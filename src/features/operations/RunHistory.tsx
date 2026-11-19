import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { useActiveClient } from "@/core/accounts";
import { Badge, Button, EmptyState, ListRow, useConfirm } from "@/ui";
import { toast } from "@/utils/toast";
import {
  cancelRun,
  errorText,
  listRuns,
  runControl,
  STATE_LABELS,
  undoRun,
  type Run,
} from "./api";
import { t } from "@/i18n";

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
  const [busy, setBusy] = useState<string | null>(null);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    if (!client) return;
    try {
      setRuns(await listRuns(client));
      setError("");
    } catch (e) {
      setError(errorText(e, t("operations.runHistory.couldNotLoadHistory")));
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const control = async (run: Run, kind: "cancel" | "undo") => {
    if (!client) return;
    const ok = await confirm(
      kind === "cancel"
        ? {
            title: t("operations.runHistory.cancelThisRun"),
            description: run.hostName ?? undefined,
            confirmLabel: t("operations.runHistory.cancelRun"),
            cancelLabel: t("operations.runHistory.keep"),
          }
        : {
            title: t("operations.runHistory.undoThisRun"),
            description: t("operations.runHistory.thisRunsTheActionS"),
            confirmLabel: t("operations.runHistory.undo"),
          },
    );
    if (!ok) return;
    setBusy(run.id);
    try {
      if (kind === "cancel") {
        const cancelled = await cancelRun(client, run.id);
        if (cancelled) toast.success(t("operations.runHistory.cancelled"));
        else toast.error(t("operations.runHistory.itAlreadyFinished"));
      } else {
        const outcome = await undoRun(client, run.id);
        toast.success(
          outcome.summary ??
            STATE_LABELS[outcome.status] ??
            t("operations.runHistory.done"),
        );
      }
    } catch (e) {
      toast.error(
        errorText(
          e,
          kind === "cancel"
            ? t("operations.runHistory.couldNotCancel")
            : t("operations.runHistory.couldNotUndo"),
        ),
      );
    } finally {
      setBusy(null);
      await load();
    }
  };

  return (
    <Screen
      title={t("operations.runHistory.runHistory")}
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
      >
        {error ? (
          <EmptyState title={error} />
        ) : runs && runs.length === 0 ? (
          <EmptyState title={t("operations.runHistory.nothingHasRunYet")} />
        ) : (
          (runs ?? []).map((run, index) => {
            const kind = runControl(run);
            return (
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
                      ? t("operations.runHistory.dryRun")
                      : (STATE_LABELS[run.status] ?? run.status)}
                  </Badge>
                }
                trailing={
                  kind ? (
                    <Button
                      size="sm"
                      variant="muted"
                      disabled={busy === run.id}
                      onPress={() => void control(run, kind)}
                    >
                      {kind === "cancel"
                        ? t("operations.runHistory.cancel")
                        : t("operations.runHistory.undo")}
                    </Button>
                  ) : undefined
                }
              />
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}
