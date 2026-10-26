import { useEffect, useRef } from "react";
import { Animated } from "react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useReduceMotion } from "@/ui/motion";
import type { SessionState } from "@/core/sessions/status";

const LABELS: Partial<Record<SessionState, string>> = {
  reconnecting: "Reconnecting",
  offline: "Waiting for network",
  failed: "Connection failed",
};

/** What a tab's status adds to its accessibility label. */
export function statusLabel(state: SessionState | undefined): string | null {
  return (state && LABELS[state]) ?? null;
}

/**
 * Small square on a tab when its connection needs attention. A healthy tab
 * shows nothing.
 */
export function TabStatusMark({ state }: { state: SessionState | undefined }) {
  const color = useThemeColor();
  const pulse = useRef(new Animated.Value(1)).current;
  const reconnecting = state === "reconnecting";
  const still = useReduceMotion();

  useEffect(() => {
    if (!reconnecting || still) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.3,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reconnecting, pulse, still]);

  if (!statusLabel(state)) return null;
  const fill =
    state === "failed"
      ? color("destructive")
      : state === "offline"
        ? color("muted-foreground")
        : color("warning");
  return (
    <Animated.View
      testID="tab-status-mark"
      style={{ width: 6, height: 6, backgroundColor: fill, opacity: pulse }}
    />
  );
}
