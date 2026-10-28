import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Hosts from "@/screens/hosts/Hosts";
import { HOSTS_PANE_MIN_WIDTH } from "@/screens/shell/layout";

export const HOSTS_PANE_WIDTH = 340;
export const HOSTS_PANE_HIDDEN_KEY = "sessions.hostsPaneHidden";

/** Pane width that ends at a window position, like the left edge of a fold. */
export function hostsPaneWidth(left: number | null, edge?: number): number {
  if (edge == null || left == null) return HOSTS_PANE_WIDTH;
  return Math.max(HOSTS_PANE_MIN_WIDTH, edge - left);
}

/**
 * The host list beside the terminal on wide windows. With an edge it fills
 * up to that window position, so on a foldable it ends at the crease.
 */
export function HostsPane({ edge }: { edge?: number }) {
  const ref = useRef<View>(null);
  const [left, setLeft] = useState<number | null>(null);
  const measure = () =>
    ref.current?.measureInWindow((x) =>
      setLeft((prev) => (prev === x ? prev : x)),
    );
  return (
    <View
      ref={ref}
      onLayout={measure}
      className="border-r border-border bg-background"
      style={{ width: hostsPaneWidth(left, edge) }}
    >
      <Hosts />
    </View>
  );
}

/** Whether the user hid the host list pane. Kept across launches. */
export function useHostsPaneHidden(): [boolean, (hidden: boolean) => void] {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(HOSTS_PANE_HIDDEN_KEY)
      .then((v) => {
        if (live && v === "1") setHidden(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const set = useCallback((value: boolean) => {
    setHidden(value);
    AsyncStorage.setItem(HOSTS_PANE_HIDDEN_KEY, value ? "1" : "0").catch(
      () => {},
    );
  }, []);

  return [hidden, set];
}
