/**
 * TermixSessionService - the Android foreground service that keeps open
 * sessions alive in the background, and the short iOS finishing time.
 * Every call is safe where the module is missing (web, Expo Go, tests).
 */
import { requireOptionalNativeModule } from "expo-modules-core";

interface NativeSessionService {
  isSupported?: boolean;
  show(
    title: string,
    lines: string[],
    actionLabel: string,
    channelName: string,
  ): boolean;
  hide(): void;
  isRunning(): boolean;
  notificationsEnabled(): boolean;
  ignoresBatteryOptimizations(): boolean;
  openBatteryOptimizationSettings(): boolean;
  openNotificationSettings(): boolean;
  beginGrace(): Promise<void>;
  endGrace(): Promise<void>;
  addListener(event: "onDisconnectAll", cb: () => void): { remove(): void };
}

const native = requireOptionalNativeModule<NativeSessionService>(
  "TermixSessionService",
);

export interface ServiceContent {
  title: string;
  lines: string[];
  actionLabel: string;
  channelName: string;
}

export const isSessionServiceAvailable = native?.isSupported === true;

/** Starts or updates the notification. False when Android did not allow it. */
export function showSessionService(content: ServiceContent): boolean {
  if (!native) return false;
  try {
    return native.show(
      content.title,
      content.lines,
      content.actionLabel,
      content.channelName,
    );
  } catch {
    return false;
  }
}

export function hideSessionService(): void {
  try {
    native?.hide();
  } catch {}
}

export function isSessionServiceRunning(): boolean {
  try {
    return native?.isRunning() ?? false;
  } catch {
    return false;
  }
}

export function notificationsEnabled(): boolean {
  try {
    return native?.notificationsEnabled() ?? true;
  } catch {
    return true;
  }
}

export function ignoresBatteryOptimizations(): boolean {
  try {
    return native?.ignoresBatteryOptimizations() ?? true;
  } catch {
    return true;
  }
}

export function openBatteryOptimizationSettings(): boolean {
  try {
    return native?.openBatteryOptimizationSettings() ?? false;
  } catch {
    return false;
  }
}

export function openNotificationSettings(): boolean {
  try {
    return native?.openNotificationSettings() ?? false;
  } catch {
    return false;
  }
}

/** iOS: ask for the short finishing time before suspending. */
export function beginGrace(): void {
  native?.beginGrace().catch(() => {});
}

export function endGrace(): void {
  native?.endGrace().catch(() => {});
}

/** The notification's Disconnect all button. */
export function addDisconnectAllListener(cb: () => void): () => void {
  if (!native) return () => {};
  const sub = native.addListener("onDisconnectAll", cb);
  return () => sub.remove();
}
