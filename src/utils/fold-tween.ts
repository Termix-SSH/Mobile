import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** How long a pane takes to settle when the screen bends or goes flat. */
export const FOLD_TWEEN_MS = 250;

let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled?.()
  .then((on) => {
    reduceMotion = on;
  })
  .catch(() => {});
AccessibilityInfo.addEventListener?.("reduceMotionChanged", (on) => {
  reduceMotion = on;
});

const easeOut = (t: number) => 1 - (1 - t) ** 3;

type Glide = { from: number; to: number; start: number; end: number };

/**
 * A width that glides to its target for a moment after `key` changes, like a
 * fold bending or going flat, and follows it at once otherwise, so drags and
 * turns stay direct. A fold's frame can settle a render later, so a target that
 * moves mid glide is glided to as well.
 *
 * The glide runs through React state rather than a UI thread animation. The
 * panes around it re-render as it moves, and each of those renders would put a
 * UI thread width back to the one React last knew, so it flashed.
 */
export function useFoldTweenWidth(target: number, key: unknown): number {
  const [, setFrame] = useState(0);
  const shown = useRef(target);
  const lastKey = useRef(key);
  const glide = useRef<Glide | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const now = Date.now();
    const turned = lastKey.current !== key;
    lastKey.current = key;
    const gliding = glide.current !== null && now < glide.current.end;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (reduceMotion || (!turned && !gliding) || shown.current === target) {
      glide.current = null;
      const held = shown.current !== target;
      shown.current = target;
      // A render that waited for this effect still shows the old width.
      if (turned && held) setFrame((n) => n + 1);
      return;
    }
    glide.current = {
      from: shown.current,
      to: target,
      start: now,
      end: turned ? now + FOLD_TWEEN_MS : glide.current!.end,
    };
    const step = () => {
      const g = glide.current;
      if (!g) return;
      const t = Math.min(1, (Date.now() - g.start) / (g.end - g.start));
      shown.current = g.from + (g.to - g.from) * easeOut(t);
      if (t < 1) {
        frame.current = requestAnimationFrame(step);
      } else {
        shown.current = g.to;
        glide.current = null;
        frame.current = null;
      }
      setFrame((n) => n + 1);
    };
    frame.current = requestAnimationFrame(step);
  }, [target, key]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  // Before the effect starts a glide, hold the old width, so the first frame doesn't jump.
  // The refs are read on purpose: state would lag this render by one frame.
  /* eslint-disable react-hooks/refs */
  const waiting = lastKey.current !== key;
  return waiting || glide.current ? shown.current : target;
  /* eslint-enable react-hooks/refs */
}
