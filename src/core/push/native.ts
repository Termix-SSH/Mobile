import { Platform } from "react-native";
import { isFdroid } from "@/core/distribution";

type NotificationsModule = typeof import("expo-notifications");

let cached: NotificationsModule | null | undefined;

/**
 * expo-notifications, or null where it is missing: the F-Droid build has no
 * push service and checks for alerts in the background instead.
 */
export function notificationsModule(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (isFdroid || Platform.OS === "web") return (cached = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-notifications") as NotificationsModule;
    cached = typeof mod?.getPermissionsAsync === "function" ? mod : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Test seam. */
export function setNotificationsModule(
  mod: NotificationsModule | null | undefined,
): void {
  cached = mod;
}

/** How this build gets alerts: pushed, checked in the background, or not at all. */
export function pushMode(): "push" | "poll" | "none" {
  if (notificationsModule()) return "push";
  return isFdroid && Platform.OS === "android" ? "poll" : "none";
}
