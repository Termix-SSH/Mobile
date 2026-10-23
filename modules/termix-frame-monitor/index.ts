// Frame timing and memory for the terminal lab. Spike only.
import { requireOptionalNativeModule } from "expo-modules-core";

export interface FrameCapture {
  /** Time between UI thread vsync callbacks. */
  intervalsMs: number[];
  /** Android only: what each drawn frame cost, render thread included. */
  frameTotalsMs: number[];
}

export interface MemorySample {
  residentMb: number;
  nativeHeapMb?: number;
  graphicsMb?: number;
}

interface FrameMonitorNative {
  log(line: string): void;
  launchUrl(): string | null;
  refreshRate(): number;
  start(): Promise<void>;
  stop(): Promise<FrameCapture>;
  memory(): Promise<MemorySample>;
}

export const FrameMonitor =
  requireOptionalNativeModule<FrameMonitorNative>("TermixFrameMonitor");
