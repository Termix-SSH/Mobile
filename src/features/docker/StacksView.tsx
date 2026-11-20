import { useCallback, useState } from "react";
import { ScreenHeader } from "@/components/Screen";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { Layers } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { MONO_FONT } from "@/constants/fonts";
import { usePoll } from "@/core/exec";
import { Badge, EmptyState, Text } from "@/ui";
import type { DockerBackend, StackSummary, StackDetail } from "./backend/types";
import { t } from "@/i18n";

const STATE_LABEL: Record<StackSummary["state"], string> = {
  running: t("docker.stacksView.running"),
  partial: t("docker.stacksView.partlyUp"),
  stopped: t("docker.stacksView.stopped"),
  paused: t("docker.stacksView.paused"),
  "not-deployed": t("docker.stacksView.notDeployed"),
};

const errorText = (e: unknown) => {
  const message = e instanceof Error ? e.message : "";
  if (/403|forbidden|turned off|disabled/i.test(message)) {
    return t("docker.stacksView.stacksAreTurnedOffOn");
  }
  return message || t("docker.stacksView.couldNotLoadStacks");
};

/** Compose stacks on the host. Read only for now. */
export function StacksView({ backend }: { backend: DockerBackend }) {
  const color = useThemeColor();
  const [stacks, setStacks] = useState<StackSummary[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<StackSummary | null>(null);

  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        setStacks(await backend.stacks(signal));
        setError("");
      } catch (e) {
        if (!signal.aborted) setError(errorText(e));
      }
    },
    [backend],
  );
  usePoll(load, { intervalMs: 10_000, enabled: !open });

  if (open) {
    return (
      <StackScreen
        backend={backend}
        stack={open}
        onBack={() => setOpen(null)}
      />
    );
  }
  if (error) {
    return (
      <EmptyState
        icon={Layers}
        title={t("docker.stacksView.noStacks")}
        hint={error}
      />
    );
  }
  if (!stacks) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color={color("accent-brand")} />
      </View>
    );
  }
  if (stacks.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title={t("docker.stacksView.noStacks")}
        hint={t("docker.stacksView.composeProjectsOnThisHost")}
      />
    );
  }
  return (
    <ScrollView
      contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 24 }}
    >
      {stacks.map((s) => (
        <Pressable
          key={s.name}
          onPress={() => setOpen(s)}
          className="flex-row items-center gap-2.5 border border-border bg-card px-3 py-3 active:bg-muted/30"
        >
          <Layers size={15} color={color("muted-foreground")} />
          <View className="min-w-0 flex-1">
            <Text
              weight="medium"
              className="text-sm text-foreground"
              numberOfLines={1}
            >
              {s.name}
            </Text>
            <Text
              className="text-[10px] text-muted-foreground"
              numberOfLines={1}
            >
              {t("docker.stacksView.ofRunning", {
                running: s.running,
                total: s.total,
              })}
            </Text>
          </View>
          <Badge variant={s.state === "running" ? "success" : "muted"}>
            {STATE_LABEL[s.state] ?? s.state}
          </Badge>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function StackScreen({
  backend,
  stack,
  onBack,
}: {
  backend: DockerBackend;
  stack: StackSummary;
  onBack: () => void;
}) {
  const color = useThemeColor();
  const [detail, setDetail] = useState<StackDetail | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setDetail(await backend.stack(stack));
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }, [backend, stack]);
  usePoll(load, { intervalMs: 10_000 });

  return (
    <View className="flex-1">
      <ScreenHeader title={stack.name} onBack={onBack} />
      {error ? (
        <EmptyState
          icon={Layers}
          title={t("docker.stacksView.couldNotLoadTheStack")}
          hint={error}
        />
      ) : !detail ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={color("accent-brand")} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 24 }}
        >
          <Text className="text-[10px] uppercase tracking-[1px] text-muted-foreground">
            {t("docker.stacksView.services")}
          </Text>
          {detail.services.length === 0 ? (
            <Text className="text-sm text-muted-foreground">
              {t("docker.stacksView.nothingIsRunning")}
            </Text>
          ) : (
            detail.services.map((s) => (
              <View
                key={s.name || s.service}
                className="border border-border bg-card px-3 py-2.5"
              >
                <View className="flex-row items-center gap-2">
                  <Text
                    weight="medium"
                    className="flex-1 text-sm text-foreground"
                    numberOfLines={1}
                  >
                    {s.service}
                  </Text>
                  <Badge variant={s.state === "running" ? "success" : "muted"}>
                    {s.health || s.state}
                  </Badge>
                </View>
                <Text
                  className="text-[10px] text-muted-foreground"
                  numberOfLines={1}
                >
                  {[s.image, s.ports].filter(Boolean).join(" | ")}
                </Text>
              </View>
            ))
          )}
          {detail.compose !== null ? (
            <>
              <Text className="mt-2 text-[10px] uppercase tracking-[1px] text-muted-foreground">
                {detail.composeFile ?? t("docker.stacksView.composeFile")}
              </Text>
              <View className="border border-border bg-card p-3">
                <Text
                  selectable
                  className="text-[11px] text-muted-foreground"
                  style={{ fontFamily: MONO_FONT }}
                >
                  {detail.compose}
                </Text>
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
