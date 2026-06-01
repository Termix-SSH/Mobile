import { View, ActivityIndicator, ScrollView } from "react-native";
import { AlertCircle, RotateCcw } from "lucide-react-native";
import { Text, Button } from "@/app/components/ui";
import { useThemeColor } from "@/app/contexts/ThemeContext";
import { ConnectionLog } from "./useConnectionLog";
import type { ConnectionLogEntry } from "@/types";

export type SessionFrameStatus =
  | "loading"
  | "ready"
  | "error"
  | "empty";

/**
 * SessionFrame — the standard chrome shared by every session type (file
 * manager, docker, stats, tunnel). Renders an optional header (title/subtitle +
 * trailing actions), a connection-log panel, and centralized loading / error /
 * empty states so each session type doesn't reinvent them.
 *
 * The terminal and remote-desktop canvases are full-bleed and manage their own
 * chrome, so they don't use this.
 */
export function SessionFrame({
  title,
  subtitle,
  headerActions,
  toolbar,
  status = "ready",
  loadingLabel = "Connecting…",
  errorMessage,
  emptyMessage = "Nothing to show",
  emptyIcon,
  onRetry,
  logEntries,
  isConnecting,
  isConnected,
  hasConnectionError,
  onLogClear,
  scroll = false,
  children,
}: {
  title?: string;
  subtitle?: string;
  headerActions?: React.ReactNode;
  toolbar?: React.ReactNode;
  status?: SessionFrameStatus;
  loadingLabel?: string;
  errorMessage?: string;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  onRetry?: () => void;
  logEntries?: ConnectionLogEntry[];
  isConnecting?: boolean;
  isConnected?: boolean;
  hasConnectionError?: boolean;
  onLogClear?: () => void;
  scroll?: boolean;
  children?: React.ReactNode;
}) {
  const color = useThemeColor();

  const Body: any = scroll ? ScrollView : View;
  const bodyProps = scroll
    ? { contentContainerStyle: { flexGrow: 1 } }
    : { className: "flex-1" };

  return (
    <View className="flex-1 bg-background">
      {(title || headerActions) && (
        <View className="flex-row items-center gap-2 px-4 py-3 border-b border-border">
          <View className="flex-1 min-w-0">
            {title ? (
              <Text
                weight="bold"
                className="text-base text-foreground"
                numberOfLines={1}
              >
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text
                className="text-xs text-muted-foreground"
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          {headerActions ? (
            <View className="flex-row items-center gap-1.5">{headerActions}</View>
          ) : null}
        </View>
      )}

      {toolbar ? (
        <View className="border-b border-border">{toolbar}</View>
      ) : null}

      {/* Connection log overlay — covers the frame while connecting/errored */}
      {logEntries !== undefined && onLogClear !== undefined ? (
        <ConnectionLog
          entries={logEntries}
          isConnecting={isConnecting ?? false}
          isConnected={isConnected ?? false}
          hasConnectionError={hasConnectionError ?? false}
          onClear={onLogClear}
        />
      ) : null}

      {/* Suppress the loading spinner when the log overlay is covering the screen */}
      {status === "loading" && !(logEntries && logEntries.length > 0 && !isConnected) ? (
        <View className="flex-1 items-center justify-center gap-3">
          <ActivityIndicator size="large" color={color("accent-brand")} />
          <Text className="text-sm text-muted-foreground">{loadingLabel}</Text>
        </View>
      ) : status === "error" ? (
        <View className="flex-1 items-center justify-center px-8 gap-3">
          <AlertCircle size={36} color={color("destructive")} />
          <Text className="text-sm text-muted-foreground text-center leading-5">
            {errorMessage || "Something went wrong"}
          </Text>
          {onRetry ? (
            <Button
              variant="outline"
              size="sm"
              icon={<RotateCcw size={14} color={color("foreground")} />}
              onPress={onRetry}
            >
              Retry
            </Button>
          ) : null}
        </View>
      ) : status === "empty" ? (
        <View className="flex-1 items-center justify-center px-8 gap-3">
          {emptyIcon ?? <AlertCircle size={32} color={color("muted-foreground")} />}
          <Text className="text-sm text-muted-foreground text-center">
            {emptyMessage}
          </Text>
          {onRetry ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw size={14} color={color("foreground")} />}
              onPress={onRetry}
            >
              Refresh
            </Button>
          ) : null}
        </View>
      ) : (
        <Body {...bodyProps}>{children}</Body>
      )}
    </View>
  );
}
