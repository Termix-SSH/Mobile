import { useWindowDimensions } from "react-native";

export type Orientation = "portrait" | "landscape";

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

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
