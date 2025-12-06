import { useWindowDimensions } from "react-native";

export type Orientation = "portrait" | "landscape";

/**
 * Hook to get current orientation and dimensions
 */
export function useOrientation() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const orientation: Orientation = isLandscape ? "landscape" : "portrait";

  return {
    width,
    height,
    isLandscape,
    isPortrait: !isLandscape,
    orientation,
  };
}

/**
 * Get responsive value based on orientation
 */
export function getResponsiveValue<T>(
  portraitValue: T,
  landscapeValue: T,
  isLandscape: boolean,
): T {
  return isLandscape ? landscapeValue : portraitValue;
}

/**
 * Get percentage of dimension
 */
export function percentOf(dimension: number, percent: number): number {
  return (dimension * percent) / 100;
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
