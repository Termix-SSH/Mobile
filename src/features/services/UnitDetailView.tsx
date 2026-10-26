import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import {
  ArrowLeft,
  Play,
  RotateCcw,
  ScrollText,
  Square,
} from "lucide-react-native";
import { MONO_FONT } from "@/constants/fonts";
import { useThemeColor } from "@/contexts/ThemeContext";
import { usePoll } from "@/core/exec";
import { Badge, Text, useConfirm } from "@/ui";
import { toast } from "@/utils/toast";
import type {
  ServiceAction,
  ServicesBackend,
  UnitDetail,
} from "./backend/types";
import { errorText, stateTone } from "./Services";

const SHOWN_PROPS: [string, string][] = [
  ["Description", "Description"],
  ["UnitFileState", "Starts at boot"],
  ["MainPID", "Main PID"],
  ["MemoryCurrent", "Memory"],
  ["ActiveEnterTimestamp", "Active since"],
  ["NRestarts", "Restarts"],
  ["FragmentPath", "Unit file"],
];

/** systemd prints bytes; "[not set]" and huge sentinels mean nothing. */
export function propValue(key: string, raw: string | undefined): string | null {
  if (!raw || raw === "[not set]" || (raw === "0" && key === "MainPID"))
    return null;
  if (key === "MemoryCurrent") {
    const n = Number(raw);
    if (!Number.isFinite(n) || n > 2 ** 60) return null;
    return n >= 1 << 30
      ? `${(n / (1 << 30)).toFixed(1)} GB`
      : `${(n / (1 << 20)).toFixed(1)} MB`;
  }
  return raw;
}

export function UnitDetailView({
  backend,
  name,
  readOnly,
  onBack,
  onJournal,
}: {
  backend: ServicesBackend;
  name: string;
  readOnly: boolean;
  onBack: () => void;
  onJournal: (unit: string) => void;
}) {
  const color = useThemeColor();
  const confirm = useConfirm();
  const [detail, setDetail] = useState<UnitDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<ServiceAction | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setDetail(await backend.unit(name, signal));
        setError("");
      } catch (e) {
        if (!signal?.aborted)
          setError(errorText(e, "Could not read the service"));
      }
    },
    [backend, name],
  );
  usePoll(load, { intervalMs: 5000 });

  const run = async (action: ServiceAction) => {
    if (action !== "start") {
      const ok = await confirm({
        title: `${action === "stop" ? "Stop" : "Restart"} ${name}?`,
        description:
          action === "stop"
            ? "It stays stopped until it is started again or the host boots."
            : "It stops for a moment and starts again.",
        confirmLabel: action === "stop" ? "Stop" : "Restart",
      });
      if (!ok) return;
    }
    setBusy(action);
    try {
      const state = await backend.action(name, action);
      toast.success(`${name} is ${state}`);
      await load();
    } catch (e) {
      const message = errorText(e, `Could not ${action} ${name}`);
      if (message !== "Cancelled") toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const active = detail?.props.ActiveState ?? "";
  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center gap-2.5 border-b border-border px-3 py-3">
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
          className="min-w-0 flex-1 text-base text-foreground"
          numberOfLines={1}
        >
          {name}
        </Text>
        {active ? (
          <Badge variant={stateTone(active)}>
            {active === "active" ? detail?.props.SubState || active : active}
          </Badge>
        ) : null}
      </View>

      <View className="flex-row flex-wrap gap-1.5 border-b border-border px-3 py-2">
        {!readOnly ? (
          <>
            <Chip
              icon={<Play size={13} color={color("accent-brand")} />}
              label="Start"
              busy={busy === "start"}
              onPress={() => void run("start")}
            />
            <Chip
              icon={<Square size={13} color={color("foreground")} />}
              label="Stop"
              busy={busy === "stop"}
              onPress={() => void run("stop")}
            />
            <Chip
              icon={<RotateCcw size={13} color={color("foreground")} />}
              label="Restart"
              busy={busy === "restart"}
              onPress={() => void run("restart")}
            />
          </>
        ) : null}
        <Chip
          icon={<ScrollText size={13} color={color("foreground")} />}
          label="Journal"
          onPress={() => onJournal(name)}
        />
      </View>

      {error && !detail ? (
        <Text className="p-4 text-sm text-destructive">{error}</Text>
      ) : !detail ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={color("accent-brand")} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 120 }}
        >
          {SHOWN_PROPS.map(([key, label]) => {
            const value = propValue(key, detail.props[key]);
            if (!value) return null;
            return (
              <View
                key={key}
                className="flex-row gap-3 border-b border-border pb-1.5"
              >
                <Text className="w-28 text-[11px] text-muted-foreground">
                  {label}
                </Text>
                <Text selectable className="flex-1 text-[11px] text-foreground">
                  {value}
                </Text>
              </View>
            );
          })}
          {detail.status ? (
            <View className="border border-border bg-card p-3">
              <Text
                selectable
                className="text-[11px] text-muted-foreground"
                style={{ fontFamily: MONO_FONT }}
              >
                {detail.status}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function Chip({
  icon,
  label,
  busy,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  busy?: boolean;
  onPress: () => void;
}) {
  const color = useThemeColor();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      className="flex-row items-center gap-1 border border-border px-2.5 py-1.5 active:opacity-80"
    >
      {busy ? (
        <ActivityIndicator size="small" color={color("accent-brand")} />
      ) : (
        icon
      )}
      <Text className="text-[11px] text-muted-foreground">{label}</Text>
    </Pressable>
  );
}
