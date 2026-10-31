import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/**
 * A function that never changes identity but always calls the latest fn, so
 * memoized list rows don't re-render when a parent re-creates its handlers.
 */
export function useStableCallback<A extends unknown[], R>(
  fn: (...args: A) => R,
): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}

/** The value, once it stopped changing for `ms`. An empty value applies at once. */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  // Clearing applies at once, so the next search never starts from the old one.
  if (!value && settled) setSettled(value);
  useEffect(() => {
    if (!value) return;
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return value ? settled : value;
}
