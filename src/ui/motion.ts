import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

let reduced = false;
const listeners = new Set<(on: boolean) => void>();
let watching = false;

function watch() {
  if (watching) return;
  watching = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then(set)
    .catch(() => {});
  AccessibilityInfo.addEventListener("reduceMotionChanged", set);
}

function set(on: boolean) {
  if (on === reduced) return;
  reduced = on;
  listeners.forEach((l) => l(on));
}

/** The system Reduce motion setting, kept current. */
export function useReduceMotion(): boolean {
  const [on, setOn] = useState(reduced);
  useEffect(() => {
    watch();
    listeners.add(setOn);
    setOn(reduced);
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  return on;
}

/** For code outside components, like LayoutAnimation calls. */
export function reduceMotionOn(): boolean {
  watch();
  return reduced;
}
