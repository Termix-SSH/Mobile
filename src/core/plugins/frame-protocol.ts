/**
 * Messages between the app and a plugin web view. The page is built from
 * scripts/plugin-host and imports this file, so both sides share it.
 */

export interface FrameTheme {
  id: string;
  mode: "light" | "dark";
}

export interface FrameViewTarget {
  view: string;
  hostId?: string;
  data?: Record<string, unknown>;
}

/** A request or response body: none, plain text, or bytes as base64. */
export type FrameBody =
  | { kind: "none" }
  | { kind: "text"; value: string }
  | { kind: "base64"; value: string };

export type ShellCall =
  | "openTab"
  | "openSingletonTab"
  | "connectHost"
  | "closeTab"
  | "renameTab"
  | "openHostEditor";

/** What the page sends the app. */
export type PageMessage =
  | { t: "loaded"; tabs: string[]; panels: string[] }
  | { t: "failed"; reason: "link" | "activate" | "view"; message: string }
  | {
      t: "http";
      id: string;
      method: string;
      url: string;
      headers: Record<string, string>;
      body: FrameBody;
    }
  | { t: "http.abort"; id: string }
  | { t: "ws.open"; id: string; url: string; protocols: string[] }
  | { t: "ws.send"; id: string; body: FrameBody }
  | { t: "ws.close"; id: string; code?: number; reason?: string }
  | { t: "shell"; call: ShellCall; args: unknown[] }
  | { t: "link"; url: string }
  | { t: "back.result"; handled: boolean }
  | { t: "log"; level: "info" | "warn" | "error"; message: string };

/** What the app sends the page. */
export type AppMessage =
  | {
      t: "http.head";
      id: string;
      status: number;
      headers: Record<string, string>;
    }
  | { t: "http.chunk"; id: string; base64: string }
  | { t: "http.end"; id: string; error?: string }
  | { t: "ws.open"; id: string; protocol: string }
  | { t: "ws.message"; id: string; body: FrameBody }
  | { t: "ws.close"; id: string; code: number; reason: string }
  | { t: "ws.error"; id: string; message: string }
  | { t: "theme"; theme: FrameTheme; css: string }
  | { t: "view"; view: FrameViewTarget }
  | { t: "reload" }
  | { t: "back" };

/** Everything the page needs at start, put into the HTML by the app. */
export interface FrameBoot {
  /** The server's `GET /plugins` entry for this plugin. */
  summary: Record<string, unknown> & { id: string; name: string };
  code: string;
  css: string | null;
  locales: {
    language?: string;
    en?: Record<string, unknown>;
    translated?: Record<string, unknown>;
  };
  view: FrameViewTarget;
  theme: FrameTheme;
  themeCss: string;
  /** The server's path prefix, like "/termix", or "". */
  basePath: string;
}

/** Sent through injectJavaScript; the page defines this function. */
export const PAGE_RECEIVER = "__termixFrame";

export function parsePageMessage(raw: string): PageMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const t = (value as { t?: unknown }).t;
  return typeof t === "string" ? (value as PageMessage) : null;
}
