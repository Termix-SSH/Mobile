import type { TerminalConfig } from "@/types";

/**
 * The ssh-terminal host settings the phone uses, mapped to and from the
 * `terminalConfig` shape the terminal reads. Same keys and types as
 * Plugin-SSH-Terminal's shared/terminal-settings.ts.
 */

// The look. A host value equal to the plugin's default means the host never
// set it, so the phone's own setting is used instead.
const LOOK_DEFAULTS = {
  theme: "termix",
  cursorBlink: true,
  cursorStyle: "bar",
  fontSize: 14,
  fontFamily: "Caskaydia Cove Nerd Font Mono",
  scrollback: 10000,
  letterSpacing: 0,
  lineHeight: 1,
  bellStyle: "none",
  customThemeColors: null,
} as const;

// Host only behavior, always taken from the host.
const BEHAVIOR_KEYS = [
  "backspaceMode",
  "linkClickBehavior",
  "useSSHTitle",
  "autoReconnect",
  "keepOpenOnExit",
  "autoTmux",
  "autoMosh",
  "moshCommand",
  "passwordPromptAutoFill",
  "sudoPasswordAutoFill",
  "enableCommandHistory",
] as const;

const ENUMS: Record<string, readonly string[]> = {
  cursorStyle: ["block", "underline", "bar"],
  bellStyle: ["none", "sound", "visual", "both"],
  backspaceMode: ["normal", "control-h"],
  linkClickBehavior: ["default", "confirm", "direct"],
};

const NUMBERS = new Set([
  "fontSize",
  "scrollback",
  "letterSpacing",
  "lineHeight",
]);

function typed(key: string, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (ENUMS[key]) {
    return typeof value === "string" && ENUMS[key].includes(value)
      ? value
      : undefined;
  }
  if (NUMBERS.has(key)) {
    if (value === null || value === "") return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  switch (key) {
    case "theme":
      if (typeof value !== "string" || !value) return undefined;
      return [
        "Termix Dark",
        "Termix Light",
        "termixDark",
        "termixLight",
      ].includes(value)
        ? "termix"
        : value;
    case "fontFamily":
      return typeof value === "string" && value ? value : undefined;
    case "moshCommand":
      return typeof value === "string" ? value : undefined;
    case "customThemeColors": {
      let parsed = value;
      if (typeof parsed === "string") {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          return undefined;
        }
      }
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : null;
    }
    default:
      return typeof value === "boolean" ? value : undefined;
  }
}

/** The host's ssh-terminal values as the terminal reads them. */
export function terminalConfigFromPluginSettings(
  terminal: Record<string, unknown> | undefined,
  snippets?: Record<string, unknown>,
): Partial<TerminalConfig> {
  const out: Record<string, unknown> = {};
  if (terminal) {
    for (const [key, fallback] of Object.entries(LOOK_DEFAULTS)) {
      const value = typed(key, terminal[key]);
      if (value === undefined) continue;
      if (JSON.stringify(value) === JSON.stringify(fallback)) continue;
      out[key] = value;
    }
    for (const key of BEHAVIOR_KEYS) {
      const value = typed(key, terminal[key]);
      // "default" follows the phone's own link setting.
      if (value !== undefined && value !== "default") out[key] = value;
    }
  }
  // A server sends its own id, a synced copy carries the snippet's syncId.
  const startup = snippets?.startupSnippetId;
  if (
    (typeof startup === "number" && Number.isFinite(startup)) ||
    (typeof startup === "string" && startup)
  ) {
    out.startupSnippetId = startup;
  }
  return out as Partial<TerminalConfig>;
}

/** What a host form save writes back, only for keys the form set. */
export function pluginSettingsFromTerminalConfig(
  config: Partial<TerminalConfig> | undefined | null,
): {
  terminal: Record<string, unknown>;
  snippets: Record<string, unknown>;
} {
  const terminal: Record<string, unknown> = {};
  const snippets: Record<string, unknown> = {};
  if (!config) return { terminal, snippets };
  const source = config as Record<string, unknown>;
  for (const key of [...Object.keys(LOOK_DEFAULTS), ...BEHAVIOR_KEYS]) {
    if (!(key in source)) continue;
    const value = typed(key, source[key]);
    // Unset look values go back to the plugin default, which reads as unset.
    terminal[key] =
      value === undefined && key in LOOK_DEFAULTS
        ? LOOK_DEFAULTS[key as keyof typeof LOOK_DEFAULTS]
        : value;
    if (terminal[key] === undefined) delete terminal[key];
  }
  if ("startupSnippetId" in source) {
    snippets.startupSnippetId = source.startupSnippetId ?? null;
  }
  return { terminal, snippets };
}
