import Constants from "expo-constants";

/** The F-Droid build has no Play Services, so it cannot scan QR codes. */
export const isFdroid = Constants.expoConfig?.extra?.distribution === "fdroid";
export const canScanQr = !isFdroid;
