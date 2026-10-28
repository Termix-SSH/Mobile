/**
 * Every device the store media is made for. Capture, render and upload all
 * read this table, so adding a device is one entry here.
 */
export type Platform = "ios" | "android";

export interface Size {
  width: number;
  height: number;
}

export interface Device {
  /** Folder name under out/raw and out/final. */
  id: string;
  platform: Platform;
  label: string;
  /**
   * iOS: picks the newest simulator device type whose name matches.
   * Android: the AVD name the workflow creates.
   */
  match: RegExp | string;
  /** Final screenshot size. Null keeps the size the device captured at. */
  still: Size | null;
  /** App Preview size (iOS only). Null keeps the captured size. */
  preview?: Size | null;
  /** Shows the split view shot. */
  wide: boolean;
  /** App Store Connect display types. Missing ones are skipped on upload. */
  asc?: { screenshot?: string; preview?: string };
  /** Google Play image type. */
  play?: "phoneScreenshots" | "sevenInchScreenshots" | "tenInchScreenshots";
  /** F-Droid folder under fastlane/metadata/android/en-US/images. */
  fdroid?: "phoneScreenshots" | "sevenInchScreenshots" | "tenInchScreenshots";
}

export const DEVICES: Device[] = [
  {
    id: "iphone",
    platform: "ios",
    label: 'iPhone 6.9"',
    match: /^iPhone \d+ Pro Max$/,
    still: { width: 1320, height: 2868 },
    preview: { width: 886, height: 1920 },
    wide: false,
    // App Store Connect files 6.9" shots under the 6.7" type.
    asc: { screenshot: "APP_IPHONE_67", preview: "IPHONE_67" },
  },
  {
    id: "ipad",
    platform: "ios",
    label: 'iPad 13"',
    match: /^iPad Pro 13-inch/,
    still: { width: 2064, height: 2752 },
    preview: { width: 1200, height: 1600 },
    wide: true,
    asc: { screenshot: "APP_IPAD_PRO_3GEN_129", preview: "IPAD_PRO_3GEN_129" },
  },
  {
    id: "iphone-duo",
    platform: "ios",
    label: "iPhone Duo",
    match: /Duo/,
    // Kept at the simulator's own size until App Store Connect lists one.
    still: null,
    preview: null,
    wide: true,
    asc: {
      screenshot: process.env.STORE_DUO_SCREENSHOT_TYPE || undefined,
      preview: process.env.STORE_DUO_PREVIEW_TYPE || undefined,
    },
  },
  {
    id: "android-phone",
    platform: "android",
    label: "Android phone",
    match: "termix_phone",
    still: { width: 1080, height: 1920 },
    wide: false,
    play: "phoneScreenshots",
    fdroid: "phoneScreenshots",
  },
  {
    id: "android-tablet",
    platform: "android",
    label: "Android tablet",
    match: "termix_tablet",
    still: { width: 1600, height: 2560 },
    wide: true,
    play: "tenInchScreenshots",
    fdroid: "tenInchScreenshots",
  },
];

export function devicesFor(platform: Platform | "both", only?: string[]) {
  return DEVICES.filter(
    (d) =>
      (platform === "both" || d.platform === platform) &&
      (!only?.length || only.includes(d.id)),
  );
}

/** One capture: a scenario in a theme. */
export interface Capture {
  /** File name under out/raw/<device>. */
  id: string;
  scenario: string;
  theme?: string;
  wideOnly?: boolean;
}

/** Themes shown side by side on the themes slide. */
export const THEME_SHOTS = ["light", "dracula", "nord"];

export const CAPTURES: Capture[] = [
  { id: "hosts", scenario: "hosts" },
  { id: "terminal", scenario: "terminal" },
  { id: "split", scenario: "split", wideOnly: true },
  { id: "files", scenario: "files" },
  { id: "metrics", scenario: "metrics" },
  { id: "docker", scenario: "docker" },
  { id: "snippets", scenario: "snippets" },
  { id: "home", scenario: "home" },
  ...THEME_SHOTS.map((theme) => ({
    id: `themes-${theme}`,
    scenario: "hosts",
    theme,
  })),
];

export function capturesFor(device: Device): Capture[] {
  return CAPTURES.filter((c) => device.wide || !c.wideOnly);
}

/** Google Play takes at most 8 per type, the App Store 10. */
export const MAX_SLIDES = { ios: 10, android: 8 } as const;
