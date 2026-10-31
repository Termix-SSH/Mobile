import { inlineJson } from "@/utils/webview";
import type { ThemeVars } from "@/constants/theme";
import type { FrameBoot, FrameTheme } from "./frame-protocol";

/**
 * The page has no network of its own: requests and sockets go through the
 * app (connect-src only allows blob and data URLs the page made itself).
 * Images and fonts may load from the server.
 */
export function framePolicy(origin: string): string {
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline' blob:",
    "style-src 'unsafe-inline'",
    `img-src ${origin} data: blob:`,
    `font-src ${origin} data:`,
    `media-src ${origin} data: blob:`,
    "connect-src blob: data:",
    "worker-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** The app's theme as the CSS variables core's components read. */
export function frameThemeCss(
  theme: FrameTheme,
  vars: ThemeVars,
  accent: string,
): string {
  const lines = Object.entries(vars).map(
    ([name, triplet]) => `--${name}:rgb(${triplet});`,
  );
  lines.push(`--accent-brand:${accent};`, `color-scheme:${theme.mode};`);
  const id = theme.id.replace(/[^a-z0-9-]/gi, "");
  return [
    `html.${id}{${lines.join("")}}`,
    "html,body,#root{margin:0;height:100%;background:var(--background);color:var(--foreground)}",
    "body{overscroll-behavior:none;-webkit-tap-highlight-color:transparent}",
    ".termix-pull{position:fixed;top:0;left:0;right:0;height:0;background:var(--accent-brand);z-index:9999;pointer-events:none}",
  ].join("\n");
}

export function buildFramePage(options: {
  script: string;
  boot: FrameBoot;
  origin: string;
}): string {
  const { script, boot, origin } = options;
  const safeScript = script.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html>
<html class="${escapeAttr(boot.theme.id)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${escapeAttr(framePolicy(origin))}">
<meta name="termix-base-path" content="${escapeAttr(boot.basePath)}">
<style id="termix-theme">${boot.themeCss}</style>
</head><body><div id="root"></div>
<script>window.__termixFrameBoot=${inlineJson(boot)};</script>
<script>${safeScript}</script>
</body></html>`;
}
