// Log lines and the launch URL for the showcase build that makes store media.
import { requireOptionalNativeModule } from "expo-modules-core";

interface FrameMonitorNative {
  log(line: string): void;
  launchUrl(): string | null;
}

export const FrameMonitor =
  requireOptionalNativeModule<FrameMonitorNative>("TermixFrameMonitor");
