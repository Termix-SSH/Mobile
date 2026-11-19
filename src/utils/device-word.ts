import * as Device from "expo-device";

function isTablet(): boolean {
  try {
    return (
      !!Device.DeviceType && Device.deviceType === Device.DeviceType.TABLET
    );
  } catch {
    return false;
  }
}

/** What the app calls the device it runs on, so iPads and tablets aren't called phones. */
export const deviceWord: string = isTablet() ? "tablet" : "phone";

export const DeviceWord: string =
  deviceWord.charAt(0).toUpperCase() + deviceWord.slice(1);
