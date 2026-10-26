import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { ArrowLeft, Layers } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { MONO_FONT } from "@/constants/fonts";
import { usePoll } from "@/core/exec";
import { Badge, EmptyState, Text } from "@/ui";
import type { DockerBackend, StackSummary, StackDetail } from "./backend/types";

const STATE_LABEL: Record<StackSummary["state"], string> = {
  running: "running",
  partial: "partly up",
  stopped: "stopped",
  paused: "paused",
  "not-deployed": "not deployed",
};

const errorText = (e: unknown) => {
  const message = e instanceof Error ? e.message : "";
  if (/403|forbidden|turned off|disabled/i.test(message)) {
    return "Stacks are turned off on this server.";
  }
  return message || "Could not load stacks";
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
    return <EmptyState icon={Layers} title="No stacks" hint={error} />;
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
        title="No stacks"
        hint="Compose projects on this host show up here."
      />
    );
  }
  return (
    <ScrollView
      contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 120 }}
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
              {s.running} of {s.total} running
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
      <View className="flex-row items-center gap-2.5 border-b border-border px-3 py-2.5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          hitSlop={8}
          className="p-1"
        >
          <ArrowLeft size={18} color={color("foreground")} />
        </Pressable>
        <Text
          weight="bold"
          className="flex-1 text-sm text-foreground"
          numberOfLines={1}
        >
          {stack.name}
        </Text>
      </View>
      {error ? (
        <EmptyState
          icon={Layers}
          title="Could not load the stack"
          hint={error}
        />
      ) : !detail ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={color("accent-brand")} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 120 }}
        >
          <Text className="text-[10px] uppercase tracking-[1px] text-muted-foreground">
            Services
          </Text>
          {detail.services.length === 0 ? (
            <Text className="text-sm text-muted-foreground">
              Nothing is running.
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
                {detail.composeFile ?? "Compose file"}
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
