import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, ScrollView, View } from "react-native";
import { ScrollText } from "lucide-react-native";
import { MONO_FONT } from "@/constants/fonts";
import { useThemeColor } from "@/contexts/ThemeContext";
import { Button, EmptyState, Tabs, Text } from "@/ui";
import type { Follow, JournalEntry, ServicesBackend } from "./backend/types";
import { errorText } from "./Services";

type Level = "all" | "warnings" | "errors";
const PRIORITY: Record<Level, number | undefined> = {
  all: undefined,
  warnings: 4,
  errors: 3,
};
const LINES = 300;
/** Lines kept while following, so a chatty unit can't fill the memory. */
export const FOLLOW_KEEP = 1000;

export function timeOf(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Recent journal lines, with live follow that stops when the app leaves. */
export function JournalView({
  backend,
  unit,
  journal,
}: {
  backend: ServicesBackend;
  unit: string | null;
  journal: boolean;
}) {
  const color = useThemeColor();
  const [level, setLevel] = useState<Level>("all");
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [error, setError] = useState("");
  const [following, setFollowing] = useState(false);
  const followRef = useRef<Follow | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const units = unit ? [unit] : [];

  const load = useCallback(async () => {
    setEntries(null);
    setError("");
    try {
      setEntries(
        await backend.journal({
          units,
          priority: PRIORITY[level],
          lines: LINES,
        }),
      );
    } catch (e) {
      setError(errorText(e, "Could not read the journal"));
      setEntries([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, unit, level]);

  useEffect(() => {
    if (journal) void load();
  }, [load, journal]);

  const stop = useCallback(() => {
    followRef.current?.stop();
    followRef.current = null;
    setFollowing(false);
  }, []);

  const start = () => {
    stop();
    setFollowing(true);
    followRef.current = backend.follow(
      { units, priority: PRIORITY[level] },
      (more) =>
        setEntries((prev) => [...(prev ?? []), ...more].slice(-FOLLOW_KEEP)),
      (err) => {
        followRef.current = null;
        setFollowing(false);
        if (err) setError(err);
      },
    );
  };

  // Following holds a channel open on the host, so it ends with the screen or the app.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background") stop();
    });
    return () => {
      sub.remove();
      stop();
    };
  }, [stop]);

  useEffect(() => stop(), [level, stop]);

  if (!journal) {
    return (
      <EmptyState
        icon={ScrollText}
        title="No journal"
        hint="This host does not keep a systemd journal."
      />
    );
  }

  const tone = (p: number) =>
    p <= 3
      ? color("destructive")
      : p === 4
        ? "#f59e0b"
        : color("muted-foreground");

  return (
    <View className="flex-1">
      <View className="flex-row items-center gap-2 border-b border-border px-3 py-2">
        <View className="flex-1">
          <Tabs<Level>
            value={level}
            onChange={setLevel}
            options={[
              { id: "all", label: "All" },
              { id: "warnings", label: "Warnings" },
              { id: "errors", label: "Errors" },
            ]}
          />
        </View>
        <Button
          size="sm"
          variant={following ? "default" : "outline"}
          onPress={following ? stop : start}
        >
          {following ? "Stop" : "Follow"}
        </Button>
      </View>
      {unit ? (
        <Text className="px-3 pt-2 text-[11px] text-muted-foreground">
          {unit}
        </Text>
      ) : null}
      {error ? (
        <Text className="px-3 pt-2 text-[11px] text-destructive-text">
          {error}
        </Text>
      ) : null}
      {entries === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={color("accent-brand")} />
        </View>
      ) : entries.length === 0 && !error ? (
        <EmptyState
          icon={ScrollText}
          title="Nothing logged"
          hint="Try another level."
        />
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 12, gap: 2, paddingBottom: 120 }}
          onContentSizeChange={() =>
            following && scrollRef.current?.scrollToEnd({ animated: false })
          }
        >
          {entries.map((e, i) => (
            <Text
              key={`${e.time}-${i}`}
              selectable
              className="text-[11px]"
              style={{ fontFamily: MONO_FONT, color: tone(e.priority) }}
            >
              {timeOf(e.time)} {e.ident || e.unit}: {e.message}
            </Text>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
