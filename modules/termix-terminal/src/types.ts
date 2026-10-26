import type { StyleProp, ViewStyle } from "react-native";

export interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  /** Text under a block cursor. */
  cursorAccent?: string;
  selectionBackground: string;
  selectionForeground?: string;
  /** ANSI 0 to 15, more are allowed up to 256. */
  palette: string[];
}

export interface TerminalCursor {
  style: "block" | "bar" | "underline";
  blink: boolean;
}

export interface TerminalBell {
  style: "none" | "sound" | "visual" | "both";
  /** A short vibration on bell and long press. */
  haptics: boolean;
}

export type StickyState = "inactive" | "armed" | "locked";

export interface ClipboardRequest {
  id: number;
  /** paste: unsafe text the user pasted. read and write: a program asked (OSC 52). */
  kind: "paste" | "read" | "write";
  text: string;
}

/** Key names for `sendKey`, as KeyboardEvent.key spells them. */
export type TerminalKeyName =
  | "Escape"
  | "Tab"
  | "Enter"
  | "Backspace"
  | "Delete"
  | "Insert"
  | "ArrowUp"
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight"
  | "Home"
  | "End"
  | "PageUp"
  | "PageDown"
  | `F${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12}`;

export interface TerminalStats {
  /** Frames the engine drew. Android only. */
  renderedFrames?: number;
  /** Time spent drawing one frame. Android only. */
  renderMsP50?: number;
  renderMsP95?: number;
  renderMsMax?: number;
  /** Pty output fed in since the view was created. */
  bytesParsed?: number;
}

export interface TerminalViewProps {
  /**
   * Native pipe to read pty output from. The SSH engine writes into the same id, so
   * output never crosses the JS bridge. Without one, output comes from `write`.
   */
  pipeId?: string;
  /** Points. Pinch zoom steps from it and reports through `onFontSize`. */
  fontSize: number;
  /** Family name of a bundled font, or "monospace". */
  fontFamily?: string;
  /** Row height as a multiple of the font's own, 1 by default. */
  lineHeight?: number;
  /** Extra points between cells. */
  letterSpacing?: number;
  theme: TerminalTheme;
  cursor?: TerminalCursor;
  /** Lines kept above the screen. Read once, before the first output. */
  scrollback?: number;
  bell?: TerminalBell;
  /** iPad keyboards: Option sends Alt. */
  optionAsMeta?: boolean;
  /** Selection handles and similar accents. */
  accentColor?: string;
  /** Bytes the user typed or the terminal answered, base64. */
  onInput: (base64: string) => void;
  onResize: (cols: number, rows: number) => void;
  onBell?: () => void;
  onTitle?: (title: string) => void;
  /** Whether the screen shows the newest output. */
  onScrollState?: (atBottom: boolean) => void;
  /** A tapped link, or Open link from the long press menu. */
  onLink?: (url: string) => void;
  /** Text went to the clipboard, from the menu or a program. */
  onCopy?: (text: string, fromProgram: boolean) => void;
  /** Something needs a yes first. Answer with `answerClipboard`. */
  onClipboardRequest?: (request: ClipboardRequest) => void;
  /** Pinch zoom changed the size. */
  onFontSize?: (size: number) => void;
  /** The sticky Ctrl and Alt changed. */
  onModifiers?: (state: { ctrl: StickyState; alt: StickyState }) => void;
  /** Report the line at the prompt when output settles, through `onPromptLine`. */
  watchPrompt?: boolean;
  /** False while the tab is hidden behind another. iOS stops drawing it and redraws when shown. */
  surfaceVisible?: boolean;
  /** The prompt line changed, while `watchPrompt` is on. */
  onPromptLine?: (line: string) => void;
  /** Hits of the current search, and which one shows (-1 for none). */
  onSearch?: (result: TerminalSearchResult) => void;
  /** More in the long press menu: the app's own menu for the session. */
  onMenu?: () => void;
  /** An app shortcut from a hardware keyboard, like "newTab". The shell never sees it. */
  onShortcut?: (id: string) => void;
  style?: StyleProp<ViewStyle>;
}

export interface TerminalViewHandle {
  /** Feed pty output, base64. Calls before the first resize are queued. */
  write(base64: string): void;
  /** Bracketed when the program asks for it. Unsafe text asks first. */
  paste(text: string): void;
  scrollToBottom(): void;
  copySelection(): void;
  selectAll(): void;
  /** Shows the keyboard. */
  focus(): void;
  blur(): void;
  /** Tap arms Ctrl or Alt for the next key, a quick double tap locks it. */
  toggleModifier(name: "ctrl" | "alt"): void;
  /** A key from the app's key row, with the sticky modifiers. */
  sendKey(name: TerminalKeyName, shift?: boolean): void;
  /** Text from the app's key row, with the sticky modifiers. */
  typeText(text: string): void;
  answerClipboard(id: number, allow: boolean): void;
  getStats(): Promise<TerminalStats | null>;
  /** Finds text in the screen and scrollback and shows the newest hit. */
  search(query: string, options?: TerminalSearchOptions): void;
  searchNext(): void;
  searchPrevious(): void;
  clearSearch(): void;
}

/** iOS searches plain text and ignores these. */
export interface TerminalSearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
}

export interface TerminalSearchResult {
  total: number;
  /** -1 when nothing is shown. */
  index: number;
}
