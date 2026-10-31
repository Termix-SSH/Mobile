import { useWindowInfo } from "@/utils/window-class";

export type Orientation = "portrait" | "landscape";

export function useOrientation() {
  const { width, height, isLandscape, isPortrait } = useWindowInfo();
  const orientation: Orientation = isLandscape ? "landscape" : "portrait";

  return {
    width,
    height,
    isLandscape,
    isPortrait,
    orientation,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
