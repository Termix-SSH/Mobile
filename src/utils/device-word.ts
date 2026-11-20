import * as Device from "expo-device";
import { t } from "@/i18n";

export function isTablet(): boolean {
  try {
    return (
      !!Device.DeviceType && Device.deviceType === Device.DeviceType.TABLET
    );
  } catch {
    return false;
  }
}

/** What the app calls the device it runs on, so iPads and tablets aren't called phones. */
export const deviceWord: string = isTablet()
  ? t("common.device.tablet")
  : t("common.device.phone");

export const DeviceWord: string =
  deviceWord.charAt(0).toUpperCase() + deviceWord.slice(1);
