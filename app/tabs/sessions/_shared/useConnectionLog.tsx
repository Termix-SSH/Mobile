import { useCallback, useEffect, useRef, useState } from "react";
import { View, Pressable, ScrollView } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react-native";
import { Text } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { toast } from "@/app/utils/toast";
import type {
  ConnectionLogEntry,
  ConnectionLogLevel,
  ConnectionLogPayload,
} from "@/types";

let logSeq = 0;

/**
 * Connection-log state for a session. Mirrors the web `connection-log`: connect
 * endpoints return arrays of `{type, stage, message}` (sans id/timestamp); this
 * stamps each with an id/timestamp and exposes append/ingest/clear plus the
 * highest level seen (so the UI can auto-expand on error).
 */
export function useConnectionLog() {
  const [entries, setEntries] = useState<ConnectionLogEntry[]>([]);
  const highestLevelRef = useRef<ConnectionLogLevel>("info");

  const append = useCallback((payload: ConnectionLogPayload) => {
    const entry: ConnectionLogEntry = {
      ...payload,
      id: `log_${++logSeq}`,
      timestamp: Date.now(),
    };
    setEntries((prev) => [...prev, entry]);
    if (rank(payload.level) > rank(highestLevelRef.current)) {
      highestLevelRef.current = payload.level;
    }
  }, []);

  /**
   * Ingest a backend `connectionLogs` array (the `type` field maps to `level`).
   */
  const ingest = useCallback(
    (logs: { type?: string; level?: string; stage?: string; message: string }[]) => {
      for (const l of logs) {
        const level = (l.level || l.type || "info") as ConnectionLogLevel;
        append({ level, stage: l.stage, message: l.message });
      }
    },
    [append],
  );

  const clear = useCallback(() => {
    setEntries([]);
    highestLevelRef.current = "info";
  }, []);

  return {
    entries,
    append,
    ingest,
    clear,
    hasError: entries.some((e) => e.level === "error"),
  };
}

function rank(level: ConnectionLogLevel): number {
  switch (level) {
    case "error":
      return 3;
    case "warning":
      return 2;
    case "success":
      return 1;
    default:
      return 0;
  }
}

const LEVEL_ICON: Record<
  ConnectionLogLevel,
  (color: string) => React.ReactNode
> = {
  info: (c) => <Info size={12} color={c} />,
  success: (c) => <CheckCircle2 size={12} color={c} />,
  warning: (c) => <AlertTriangle size={12} color={c} />,
  error: (c) => <XCircle size={12} color={c} />,
};

/**
 * Full-screen connection-log overlay. Mirrors the web ConnectionLog: covers the
 * entire session panel while connecting, auto-expands on error, auto-clears when
 * the connection succeeds. The collapsed state shows only a slim bar at the bottom.
 */
export function ConnectionLog({
  entries,
  isConnecting,
  isConnected,
  hasConnectionError,
  onClear,
}: {
  entries: ConnectionLogEntry[];
  isConnecting: boolean;
  isConnected: boolean;
  hasConnectionError: boolean;
  onClear: () => void;
}) {
  const color = useThemeColor();
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const shouldShow =
    !isConnected && (isConnecting || hasConnectionError || entries.length > 0);

  // Auto-clear when successfully connected.
  useEffect(() => {
    if (isConnected && !hasConnectionError && !isConnecting) {
      onClear();
    }
  }, [isConnected, hasConnectionError, isConnecting, onClear]);

  // Auto-expand on error.
  useEffect(() => {
    if (hasConnectionError) {
      setExpanded(true);
    }
  }, [hasConnectionError]);

  // Auto-scroll to latest entry when expanded.
  useEffect(() => {
    if (expanded && entries.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [entries, expanded]);

  if (!shouldShow) return null;

  const levelColor = (level: ConnectionLogLevel): string => {
    switch (level) {
      case "error":
        return color("destructive") ?? "#ef4444";
      case "warning":
        return "#f59e0b";
      case "success":
        return "#22c55e";
      default:
        return color("muted-foreground") ?? "#888";
    }
  };

  const copyAll = async () => {
    const text = entries
      .map((e) => `[${e.level.toUpperCase()}] ${e.message}`)
      .join("\n");
    await Clipboard.setStringAsync(text);
    toast.success("Logs copied");
  };

  const showBackground = expanded || hasConnectionError;

  return (
    <View
      pointerEvents={showBackground ? "auto" : "box-none"}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 110,
        justifyContent: expanded ? "flex-start" : "flex-end",
      }}
    >
      {/* Solid background when expanded */}
      {showBackground && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
          className="bg-background"
        />
      )}

      {/* Log panel */}
      <View
        className={`relative bg-background border-border ${expanded ? "flex-1" : "border-t"}`}
      >
        {/* Header bar */}
        <Pressable
          onPress={hasConnectionError ? undefined : () => setExpanded((v) => !v)}
          className="flex-row items-center gap-2 px-3 py-2 active:bg-muted/30"
        >
          {expanded ? (
            <ChevronDown size={14} color={color("muted-foreground")} />
          ) : (
            <ChevronUp size={14} color={color("muted-foreground")} />
          )}
          <Text
            weight="medium"
            className="flex-1 text-xs text-muted-foreground uppercase tracking-[1px]"
          >
            Connection Log ({entries.length})
          </Text>
          {entries.length > 0 && (
            <Pressable onPress={copyAll} hitSlop={8}>
              <Copy size={13} color={color("muted-foreground")} />
            </Pressable>
          )}
        </Pressable>

        {/* Log entries */}
        {expanded && (
          <ScrollView
            ref={scrollRef}
            className="border-t border-border flex-1"
            contentContainerStyle={{ padding: 8, gap: 4 }}
          >
            {entries.length === 0 ? (
              <Text className="text-xs text-muted-foreground text-center py-4">
                {isConnecting ? "Waiting for connection…" : "No log entries"}
              </Text>
            ) : (
              entries.map((e) => (
                <View key={e.id} className="flex-row items-start gap-2">
                  <View className="mt-0.5">
                    {LEVEL_ICON[e.level](levelColor(e.level))}
                  </View>
                  <Text
                    className="flex-1 text-[11px] font-mono"
                    style={{ color: levelColor(e.level) }}
                  >
                    {e.message}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}
