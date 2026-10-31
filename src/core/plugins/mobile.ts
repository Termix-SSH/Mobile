/**
 * A plugin's `contributes.mobile` (Plugin API 1.13, Termix 26.10.6). The
 * server checks it with the SDK; this reads it loosely so a field a newer
 * SDK adds never breaks an older app.
 */

export type MobileMode = "webview" | "native" | "none";
export type MobileSize = "phone" | "tablet";

export interface MobileContribution {
  mode: MobileMode;
  /** webview: a bundle made for the app, served beside the frontend one. */
  entry?: string;
  /** webview: screen sizes the UI works at. */
  sizes?: MobileSize[];
  /** webview: tab, panel or card ids the app offers. */
  views?: string[];
  /** native: the app feature that stands in for the plugin. */
  feature?: string;
  /** i18n key in the plugin's namespace, or plain text. */
  note?: string;
}

const MODES: MobileMode[] = ["webview", "native", "none"];
const SIZES: MobileSize[] = ["phone", "tablet"];

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter((v): v is string => typeof v === "string" && v !== ""),
    ),
  ];
}

/** Null when there is no usable contribution. Bad parts are dropped. */
export function parseMobileContribution(
  raw: unknown,
): MobileContribution | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const mode = value.mode as MobileMode;
  if (!MODES.includes(mode)) return null;

  const out: MobileContribution = { mode };
  if (mode === "webview") {
    if (typeof value.entry === "string" && /^[\w./-]+\.js$/.test(value.entry)) {
      if (!value.entry.split("/").includes("..")) out.entry = value.entry;
    }
    const sizes = strings(value.sizes).filter((s): s is MobileSize =>
      SIZES.includes(s as MobileSize),
    );
    if (sizes.length) out.sizes = sizes;
    const views = strings(value.views);
    if (views.length) out.views = views;
  }
  if (
    mode === "native" &&
    typeof value.feature === "string" &&
    /^[a-z][a-z0-9-]{1,39}$/.test(value.feature)
  ) {
    out.feature = value.feature;
  }
  if (typeof value.note === "string" && value.note.trim()) {
    out.note = value.note.trim();
  }
  return out;
}
