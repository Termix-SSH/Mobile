/**
 * What gets captured (sources) and what gets made from it (outputs). The UI
 * is the same on both platforms and the frames are generic, so one capture
 * feeds both stores. Android emulators are fast, so they make the phone and
 * tablet shots; iOS simulators only make the iPhone Duo shots and the App
 * Store preview videos.
 */
export type Platform = "ios" | "android";

export interface Size {
  width: number;
  height: number;
}

export interface Source {
  /** Folder name under out/raw. */
  id: string;
  platform: Platform;
  label: string;
  /**
   * iOS: picks the newest simulator device type whose name matches.
   * Android: the AVD name the workflow creates.
   */
  match: RegExp | string;
  /** Shows the split view shot. */
  wide: boolean;
  stills: boolean;
  video: boolean;
}

export const SOURCES: Source[] = [
  {
    id: "android-phone",
    platform: "android",
    label: "Android phone",
    match: "termix_phone",
    wide: false,
    stills: true,
    video: false,
  },
  {
    id: "android-tablet",
    platform: "android",
    label: "Android tablet",
    match: "termix_tablet",
    wide: true,
    stills: true,
    video: false,
  },
  {
    id: "iphone-duo",
    platform: "ios",
    label: "iPhone Duo",
    match: /Duo/,
    wide: true,
    stills: true,
    video: false,
  },
  {
    id: "iphone",
    platform: "ios",
    label: "iPhone",
    match: /^iPhone \d+ Pro Max$/,
    wide: false,
    stills: false,
    video: true,
  },
  {
    id: "ipad",
    platform: "ios",
    label: "iPad",
    match: /^iPad Pro 13-inch/,
    wide: true,
    stills: false,
    video: true,
  },
];

export function sourcesFor(platform: Platform | "both", only?: string[]) {
  return SOURCES.filter(
    (s) =>
      (platform === "both" || s.platform === platform) &&
      (!only?.length || only.includes(s.id)),
  );
}

/** One set of store images, written to out/final/<store>/<id>. */
export interface Output {
  id: string;
  store: Platform;
  label: string;
  /** Source whose stills the slides show. */
  stills: string;
  /** Slide size. Null keeps the size the source captured at. */
  size: Size | null;
  /** Source whose recording becomes the App Preview. */
  preview?: { from: string; size: Size };
  /** App Store Connect display types. Missing ones are skipped on upload. */
  asc?: { screenshot?: string; preview?: string };
  /** Google Play image type. */
  play?: "phoneScreenshots" | "sevenInchScreenshots" | "tenInchScreenshots";
  /** F-Droid folder under fastlane/metadata/android/en-US/images. */
  fdroid?: "phoneScreenshots" | "sevenInchScreenshots" | "tenInchScreenshots";
}

export const OUTPUTS: Output[] = [
  {
    id: "iphone",
    store: "ios",
    label: 'iPhone 6.9"',
    stills: "android-phone",
    size: { width: 1320, height: 2868 },
    preview: { from: "iphone", size: { width: 886, height: 1920 } },
    // App Store Connect files 6.9" shots under the 6.7" type.
    asc: { screenshot: "APP_IPHONE_67", preview: "IPHONE_67" },
  },
  {
    id: "ipad",
    store: "ios",
    label: 'iPad 13"',
    stills: "android-tablet",
    size: { width: 2752, height: 2064 },
    preview: { from: "ipad", size: { width: 1200, height: 1600 } },
    asc: { screenshot: "APP_IPAD_PRO_3GEN_129", preview: "IPAD_PRO_3GEN_129" },
  },
  {
    id: "iphone-duo",
    store: "ios",
    label: "iPhone Duo",
    stills: "iphone-duo",
    // Kept at the simulator's own size until App Store Connect lists one.
    size: null,
    asc: {
      screenshot: process.env.STORE_DUO_SCREENSHOT_TYPE || undefined,
    },
  },
  {
    id: "phone",
    store: "android",
    label: "Play phone",
    stills: "android-phone",
    size: { width: 1080, height: 1920 },
    play: "phoneScreenshots",
    fdroid: "phoneScreenshots",
  },
  {
    id: "tablet",
    store: "android",
    label: "Play tablet",
    stills: "android-tablet",
    size: { width: 2560, height: 1600 },
    play: "tenInchScreenshots",
    fdroid: "tenInchScreenshots",
  },
];

export function outputsFor(store: Platform | "both", only?: string[]) {
  return OUTPUTS.filter(
    (o) =>
      (store === "both" || o.store === store) &&
      (!only?.length || only.includes(o.id)),
  );
}

/** One capture: a scenario in a theme. */
export interface Capture {
  /** File name under out/raw/<source>. */
  id: string;
  scenario: string;
  theme?: string;
  wideOnly?: boolean;
}

/** Themes shown together on the one themes slide, top to bottom. */
export const THEME_SHOTS = ["light", "dracula", "solarized"];

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

export function capturesFor(source: Source): Capture[] {
  return CAPTURES.filter((c) => source.wide || !c.wideOnly);
}

/** Google Play takes at most 8 per type, the App Store 10. */
export const MAX_SLIDES = { ios: 10, android: 8 } as const;
