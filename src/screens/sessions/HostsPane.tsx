import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Hosts from "@/screens/hosts/Hosts";
import { SideInsetsPadded } from "@/ui/bottom-inset";
import { useFoldTweenWidth } from "@/utils/fold-tween";
import {
  HOSTS_PANE_MIN_WIDTH,
  SESSION_MIN_WIDTH,
} from "@/screens/shell/layout";

export const HOSTS_PANE_WIDTH = 340;
export const HOSTS_PANE_HIDDEN_KEY = "sessions.hostsPaneHidden";
export const HOSTS_PANE_WIDTH_KEY = "sessions.hostsPaneWidth";
export const SPLIT_RATIO_KEY = "sessions.splitRatio";

/** A dragged pane width, kept between the narrowest list and the narrowest terminal. */
export function clampHostsPaneWidth(width: number, available: number): number {
  const max = Math.max(HOSTS_PANE_MIN_WIDTH, available - SESSION_MIN_WIDTH);
  return Math.round(Math.min(max, Math.max(HOSTS_PANE_MIN_WIDTH, width)));
}

/**
 * The host list width the user chose, or null to follow the fold or the default.
 * Half folded it is always null, so the list ends at the crease.
 */
export function chosenHostsPaneWidth({
  bentFold,
  dragged,
  saved,
  available,
}: {
  bentFold: boolean;
  dragged: number | null;
  saved: number | null;
  available: number;
}): number | null {
  if (bentFold) return null;
  if (dragged != null) return dragged;
  return saved == null ? null : clampHostsPaneWidth(saved, available);
}

/** Pane width that ends at a window position, like the left edge of a fold. */
export function hostsPaneWidth(left: number | null, edge?: number): number {
  if (edge == null || left == null) return HOSTS_PANE_WIDTH;
  return Math.max(HOSTS_PANE_MIN_WIDTH, edge - left);
}

/**
 * The host list beside the terminal on wide windows. With an edge it fills
 * up to that window position, so on a foldable it ends at the crease. A
 * dragged width wins over both.
 */
export function HostsPane({
  edge,
  width,
  onLeft,
  tweenKey,
}: {
  edge?: number;
  width?: number | null;
  /** Window position of the pane's left side, for drags that snap to a fold. */
  onLeft?: (left: number) => void;
  /** The width glides when this changes, like the screen bending or going flat. */
  tweenKey?: unknown;
}) {
  const ref = useRef<View>(null);
  const [left, setLeft] = useState<number | null>(null);
  const measure = () =>
    ref.current?.measureInWindow((x) => {
      setLeft((prev) => (prev === x ? prev : x));
      onLeft?.(x);
    });
  const shown = useFoldTweenWidth(
    width ?? hostsPaneWidth(left, edge),
    tweenKey,
  );
  return (
    <View
      ref={ref}
      onLayout={measure}
      className="border-r border-border bg-background"
      style={{ width: shown }}
    >
      {/* Sessions already pads for side insets, like the Duo status rail, so the list
          doesn't pad for them again and leave a gap before the divider. */}
      <SideInsetsPadded.Provider value>
        <Hosts />
      </SideInsetsPadded.Provider>
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

/** A number kept across launches, or null when none was saved. */
export function useStoredNumber(
  key: string,
): [number | null, (value: number | null) => void] {
  const [value, setValue] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setValue(null);
    AsyncStorage.getItem(key)
      .then((v) => {
        const n = v == null ? NaN : Number(v);
        if (live && Number.isFinite(n)) setValue(n);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [key]);

  const set = useCallback(
    (next: number | null) => {
      setValue(next);
      (next == null
        ? AsyncStorage.removeItem(key)
        : AsyncStorage.setItem(key, String(next))
      ).catch(() => {});
    },
    [key],
  );

  return [value, set];
}
