/**
 * Keyboard repeat configuration constants.
 * 
 * These constants define the default behavior for keyboard key repeat
 * (auto-repeat when keys are held down) functionality in the virtual keyboard.
 * 
 * Standard behavior across operating systems:
 * - Initial delay: 250-500ms (time before repeat starts)
 * - Repeat interval: 50-200ms (time between repeated keystrokes)
 * 
 * Optimization for touch devices:
 * - Slightly longer initial delay (250ms) to allow natural key release
 * - Slightly longer repeat interval (100ms) for comfortable touch interaction
 */

import { useRef, useEffect } from "react";

/**
 * Set of key IDs that should always auto-repeat on long-press,
 * regardless of which keyboard (main grid or top bar) they appear on.
 *
 * Arrows, backspace, delete, space, and page keys repeat to support
 * rapid navigation and text editing. Character keys are excluded so
 * mobile long-press menus (e.g. é, ñ, ü) remain functional.
 */
export const REPEATING_KEY_IDS = new Set([
  "arrowUp", "arrowDown", "arrowLeft", "arrowRight",
  "backspace", "delete",
  "space",
  "pageUp", "pageDown",
]);

/**
 * Check whether a key ID should auto-repeat on long-press.
 * Used in both CustomKeyboard (main grid) and KeyboardBar (top bar).
 */
export const isRepeatingKey = (id: string): boolean =>
  REPEATING_KEY_IDS.has(id);

/**
 * Default initial delay before key repeat starts (in milliseconds).
 * This gives users time to release the key without triggering repeat.
 * Standard OS keyboards typically use 250-500ms.
 */
export const DEFAULT_KEY_REPEAT_INITIAL_DELAY = 250;

/**
 * Default interval between repeated keystrokes (in milliseconds).
 * For touch devices, 100ms (10 presses/sec) is more natural than typical desktop 50ms.
 */
export const DEFAULT_KEY_REPEAT_INTERVAL = 100;


const clearTimers = (
  timeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  intervalRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>,
) => {
  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
  if (intervalRef.current) {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }
};

export const useKeyRepeat = (
  isPressed: boolean,
  enabled: boolean,
  onPress: () => void,
  repeatingInterval: number,
  initialDelay: number,
): void => {
  const repeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onPressRef = useRef(onPress);

  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  useEffect(() => {
    return () => clearTimers(repeatTimeoutRef, repeatIntervalRef);
  }, []);

  useEffect(() => {
    if (isPressed && enabled) {
      repeatTimeoutRef.current = setTimeout(() => {
        repeatIntervalRef.current = setInterval(() => {
          onPressRef.current();
        }, repeatingInterval);
      }, initialDelay);

      return () => clearTimers(repeatTimeoutRef, repeatIntervalRef);
    }

    clearTimers(repeatTimeoutRef, repeatIntervalRef);
  }, [isPressed, enabled, repeatingInterval, initialDelay]);
};
