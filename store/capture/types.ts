import type { Capture } from "../devices";

export interface TourResult {
  /** Seconds into the recording where the tour starts. */
  startOffset: number;
  /** Seconds the tour ran. */
  duration: number;
  /** Seconds after the tour start each caption begins. */
  marks: { name: string; t: number }[];
}

/** A booted simulator or emulator with the showcase build on it. */
export interface CaptureTarget {
  still(
    capture: Capture,
    theme: string,
    accent: string,
    file: string,
  ): Promise<void>;
  tour(theme: string, accent: string, file: string): Promise<TourResult>;
  close(): void;
}
