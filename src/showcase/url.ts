import type { ThemeId } from "@/constants/theme";

export interface ShowcaseLaunch {
  scenario: string;
  theme: ThemeId;
  accent: string;
  /** Run the timed tour for a recording instead of holding still. */
  video: boolean;
}

const THEMES: ThemeId[] = [
  "light",
  "dark",
  "dracula",
  "catppuccin",
  "nord",
  "solarized",
  "tokyo-night",
  "one-dark",
  "gruvbox",
];

/**
 * Reads `termix-mobile://showcase/<scenario>?theme=dark&accent=f59145&video=1`.
 * Null when the URL is not a showcase link.
 */
export function parseShowcaseUrl(
  url: string | null | undefined,
): ShowcaseLaunch | null {
  if (!url) return null;
  const m =
    /^[a-z][a-z0-9+.-]*:\/\/showcase\/([a-z0-9-]+)\/?(?:\?(.*))?$/i.exec(url);
  if (!m) return null;
  const params = new Map<string, string>();
  for (const pair of (m[2] ?? "").split("&")) {
    if (!pair) continue;
    const [k, v = ""] = pair.split("=");
    params.set(decodeURIComponent(k), decodeURIComponent(v));
  }
  const theme = params.get("theme") as ThemeId | undefined;
  const accent = (params.get("accent") ?? "").replace(/^#/, "");
  return {
    scenario: m[1].toLowerCase(),
    theme: theme && THEMES.includes(theme) ? theme : "dark",
    accent: /^[0-9a-f]{6}$/i.test(accent) ? `#${accent}` : "#f59145",
    video: params.get("video") === "1",
  };
}
