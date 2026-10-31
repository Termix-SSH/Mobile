import { useMemo, useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import type { CompanionDef, CompanionProps } from "@/core/features/types";

export const MIN_COMPANION = 280;

/** Keeps a panel between the smallest width and 60 percent of the screen. */
export function clampCompanion(size: number, screenWidth: number): number {
  const max = Math.max(MIN_COMPANION, Math.floor(screenWidth * 0.6));
  return Math.round(Math.min(max, Math.max(MIN_COMPANION, size)));
}

/** A companion panel beside a tab on a tablet, with an edge to drag its width. */
export function CompanionPane({
  def,
  screenWidth,
  side,
  props,
}: {
  def: CompanionDef;
  screenWidth: number;
  side: "left" | "right";
  props: CompanionProps;
}) {
  const start = def.layout?.().size ?? 380;
  const [width, setWidth] = useState(() => clampCompanion(start, screenWidth));
  const base = useRef(width);
  const latest = useRef(width);
  latest.current = width;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          base.current = latest.current;
        },
        onPanResponderMove: (_, g) => {
          const delta = side === "right" ? -g.dx : g.dx;
          setWidth(clampCompanion(base.current + delta, screenWidth));
        },
        onPanResponderRelease: () => def.onResize?.(latest.current),
        onPanResponderTerminate: () => def.onResize?.(latest.current),
      }),
    [def, side, screenWidth],
  );

  const handle = (
    <View
      {...pan.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel={`Resize the ${def.title} panel`}
      hitSlop={{ left: 8, right: 8 }}
      className="w-1.5 items-center justify-center bg-border active:bg-accent-brand"
    >
      <View className="h-8 w-0.5 bg-muted-foreground/50" />
    </View>
  );

  const Body = def.component;
  return (
    <View
      style={{
        width,
        flexDirection: side === "right" ? "row" : "row-reverse",
      }}
    >
      {handle}
      <View className="flex-1 bg-background">
        <Body {...props} />
      </View>
    </View>
  );
}
