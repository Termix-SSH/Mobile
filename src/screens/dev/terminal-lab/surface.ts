import type { StyleProp, ViewStyle } from "react-native";
import { TERMINAL_THEMES } from "@/constants/terminal-themes";

// The one contract every candidate engine is wrapped in, so the lab can swap
// them and feed each the same bytes.

export interface SurfaceTheme {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  /** ANSI 0 to 15. */
  palette: string[];
}

export interface EngineStats {
  /** Frames the engine itself drew, where it can tell. */
  renderedFrames?: number;
  /** Time spent drawing a frame on the engine's own render path. */
  renderMsP50?: number;
  renderMsP95?: number;
  renderMsMax?: number;
  bytesParsed?: number;
}

export interface TerminalSurfaceProps {
  fontSize: number;
  theme: SurfaceTheme;
  /** Bytes the user typed or the terminal answered, base64. */
  onInput: (base64: string) => void;
  onResize: (cols: number, rows: number) => void;
  onBell?: () => void;
  onTitle?: (title: string) => void;
  style?: StyleProp<ViewStyle>;
}

export interface TerminalSurfaceHandle {
  /** Feed pty output, base64. */
  write(base64: string): void;
  paste(text: string): void;
  scrollToBottom(): void;
  copySelection(): void;
  focus(): void;
  blur(): void;
  getStats(): Promise<EngineStats | null>;
}

export const LAB_FONT_FAMILY = "CaskaydiaCove NFM";

export function surfaceTheme(name = "termix"): SurfaceTheme {
  const c = (TERMINAL_THEMES[name] ?? TERMINAL_THEMES.termix).colors;
  return {
    background: c.background,
    foreground: c.foreground,
    cursor: c.cursor ?? c.foreground,
    selectionBackground: c.selectionBackground ?? "#3a3a3d",
    palette: [
      c.black,
      c.red,
      c.green,
      c.yellow,
      c.blue,
      c.magenta,
      c.cyan,
      c.white,
      c.brightBlack,
      c.brightRed,
      c.brightGreen,
      c.brightYellow,
      c.brightBlue,
      c.brightMagenta,
      c.brightCyan,
      c.brightWhite,
    ],
  };
}
