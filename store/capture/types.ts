import type { Capture } from "../devices";

export interface TourResult {
  /** Seconds into the recording where the tour starts. */
  startOffset: number;
  /** Seconds the tour ran. */
  duration: number;
  /** Seconds after the tour start each caption begins. */
  marks: { name: string; t: number }[];
}

/** Pixels the app pads for the status bar and home bar. */
export interface Crop {
  top: number;
  bottom: number;
}

/** Reads the insets the app adds to its ready line. */
export function cropFrom(line: RegExpMatchArray): Crop {
  const m = line[0].match(/insets=(\d+),(\d+)/);
  return m
    ? { top: Number(m[1]), bottom: Number(m[2]) }
    : { top: 0, bottom: 0 };
}

/** A booted simulator or emulator with the showcase build on it. */
export interface CaptureTarget {
  still(
    capture: Capture,
    theme: string,
    accent: string,
    file: string,
  ): Promise<Crop>;
  tour(theme: string, accent: string, file: string): Promise<TourResult>;
  close(): void;
}
