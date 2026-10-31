import { useEffect, useState } from "react";
import { View } from "react-native";
import { RefreshCw, WifiOff } from "lucide-react-native";
import { Button, Text } from "@/ui";
import { useThemeColor } from "@/contexts/ThemeContext";
import type { ConnectionStatus } from "@/core/transport";

/** The banner's text, so it can be tested without rendering. */
export function bannerText(
  state: ConnectionStatus,
  now: number,
): { title: string; detail?: string } | null {
  switch (state.status) {
    case "reconnecting": {
      if (state.nextAt === null) {
        return {
          title: `Reconnecting | try ${state.attempt}`,
          detail: state.reason,
        };
      }
      const secs = Math.max(0, Math.ceil((state.nextAt - now) / 1000));
      return {
        title: `Reconnecting in ${secs}s | try ${state.attempt}`,
        detail: state.reason,
      };
    }
    case "offline":
      return { title: "Offline, waiting for network", detail: state.reason };
    default:
      return null;
  }
}

export function pendingText(count: number, held: boolean): string {
  const what = count === 1 ? "1 typed character" : `${count} typed characters`;
  return held ? `Send ${what} to the new shell?` : `${what} waiting`;
}

/**
 * Square strip at the top of a terminal while it reconnects, plus the typed
 * input waiting to be sent. The terminal stays readable under it.
 */
export function ConnectionBanner({
  state,
  pending,
  pendingHeld,
  onReconnectNow,
  onSend,
  onDiscard,
}: {
  state: ConnectionStatus;
  pending: number;
  pendingHeld: boolean;
  onReconnectNow: () => void;
  onSend: () => void;
  onDiscard: () => void;
}) {
  const color = useThemeColor();
  const [now, setNow] = useState(() => Date.now());
  const counting = state.status === "reconnecting" && state.nextAt !== null;
  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [counting, state]);

  const text = bannerText(state, now);
  if (!text && pending === 0) return null;
  const offline = state.status === "offline";

  return (
    <View
      className="border-b border-border bg-background"
      style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 125 }}
      accessibilityLiveRegion="polite"
    >
      {text ? (
        <View className="flex-row items-center gap-2 px-3 py-2">
          {offline ? (
            <WifiOff size={14} color={color("muted-foreground")} />
          ) : (
            <RefreshCw size={14} color={color("accent-brand")} />
          )}
          <View className="flex-1">
            <Text weight="medium" className="text-xs text-foreground">
              {text.title}
            </Text>
            {text.detail ? (
              <Text
                className="text-[11px] text-muted-foreground"
                numberOfLines={1}
              >
                {text.detail}
              </Text>
            ) : null}
          </View>
          <Button size="xs" variant="outline" onPress={onReconnectNow}>
            Reconnect now
          </Button>
        </View>
      ) : null}
      {pending > 0 ? (
        <View
          className={`flex-row items-center gap-2 px-3 py-2 ${text ? "border-t border-border" : ""}`}
        >
          <Text className="flex-1 text-xs text-muted-foreground">
            {pendingText(pending, pendingHeld)}
          </Text>
          {pendingHeld ? (
            <Button size="xs" variant="outline" onPress={onSend}>
              Send
            </Button>
          ) : null}
          <Button size="xs" variant="muted" onPress={onDiscard}>
            Discard
          </Button>
        </View>
      ) : null}
    </View>
  );
}
