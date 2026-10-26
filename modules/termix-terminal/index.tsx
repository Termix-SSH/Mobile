/**
 * TermixTerminal - the native terminal view, on libghostty.
 *
 * iOS renders with Metal through libghostty-spm; Android draws on a Canvas
 * over libghostty-vt. The view parses and draws, handles the keyboard, IME,
 * selection, links and the clipboard. Pty output comes from a native pipe
 * (`pipeId`, the local SSH engine) or from write; typed bytes go out through
 * onInput, so any transport works. Binary data is base64 on the bridge.
 */
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import type { ComponentType, Ref } from "react";
import type { NativeSyntheticEvent, StyleProp, ViewStyle } from "react-native";
import { requireNativeView } from "expo";
import { requireOptionalNativeModule } from "expo-modules-core";

import type {
  ClipboardRequest,
  StickyState,
  TerminalBell,
  TerminalCursor,
  TerminalSearchOptions,
  TerminalStats,
  TerminalTheme,
  TerminalViewHandle,
  TerminalViewProps,
} from "./src/types";

export * from "./src/types";

type Ev<T> = NativeSyntheticEvent<T>;

interface NativeHandle {
  write(base64: string): Promise<void>;
  paste(text: string): Promise<void>;
  scrollToBottom(): Promise<void>;
  copySelection(): Promise<void>;
  selectAll(): Promise<void>;
  focus(): Promise<void>;
  blur(): Promise<void>;
  toggleModifier(name: string): Promise<void>;
  sendKey(name: string, shift: boolean): Promise<void>;
  typeText(text: string): Promise<void>;
  answerClipboard(id: number, allow: boolean): Promise<void>;
  getStats(): Promise<TerminalStats>;
  search(query: string, options: TerminalSearchOptions): Promise<void>;
  searchNext(): Promise<void>;
  searchPrevious(): Promise<void>;
  clearSearch(): Promise<void>;
}

interface NativeProps {
  pipeId?: string | null;
  fontSize: number;
  fontFamily?: string;
  lineHeight?: number;
  letterSpacing?: number;
  theme: Record<string, unknown>;
  cursor?: TerminalCursor;
  scrollback?: number;
  bell?: TerminalBell;
  optionAsMeta?: boolean;
  accentColor?: string;
  onInput: (e: Ev<{ data: string }>) => void;
  onResize: (e: Ev<{ cols: number; rows: number }>) => void;
  onBell?: (e: Ev<object>) => void;
  onTitleChange?: (e: Ev<{ title: string }>) => void;
  onScrollState?: (e: Ev<{ atBottom: boolean }>) => void;
  onLink?: (e: Ev<{ url: string }>) => void;
  onCopy?: (e: Ev<{ text: string; fromProgram: boolean }>) => void;
  onClipboardRequest?: (e: Ev<ClipboardRequest>) => void;
  onFontSize?: (e: Ev<{ size: number }>) => void;
  onModifiers?: (e: Ev<{ ctrl: StickyState; alt: StickyState }>) => void;
  watchPrompt?: boolean;
  /** False while the tab is hidden, so the surface stops drawing and redraws when shown. */
  surfaceVisible?: boolean;
  onPromptLine?: (e: Ev<{ line: string }>) => void;
  onSearch?: (e: Ev<{ total: number; index: number }>) => void;
  onMenu?: (e: Ev<object>) => void;
  onShortcut?: (e: Ev<{ id: string }>) => void;
  style?: StyleProp<ViewStyle>;
  ref?: Ref<NativeHandle>;
}

const MODULE = "TermixTerminal";

/**
 * False in Expo Go, on web, in builds without the module and on 32 bit
 * Android phones, which libghostty-vt is not built for.
 */
export const isTerminalEngineAvailable =
  requireOptionalNativeModule<{ engineLoaded?: boolean }>(MODULE)
    ?.engineLoaded === true;

const NativeView: ComponentType<NativeProps> | null = isTerminalEngineAvailable
  ? requireNativeView(MODULE)
  : null;

export function nativeTheme(theme: TerminalTheme): Record<string, unknown> {
  return {
    background: theme.background,
    foreground: theme.foreground,
    cursorColor: theme.cursor,
    cursorAccent: theme.cursorAccent,
    selectionBackground: theme.selectionBackground,
    selectionForeground: theme.selectionForeground,
    palette: theme.palette,
  };
}

/**
 * The native view registers after the first commit, so calls made before it
 * reports its first grid size are queued.
 */
export function createCallQueue() {
  let ready = false;
  const pending: (() => void)[] = [];
  return {
    run(call: () => void) {
      if (ready) call();
      else pending.push(call);
    },
    markReady() {
      if (ready) return;
      ready = true;
      for (const call of pending.splice(0)) call();
    },
    get ready() {
      return ready;
    },
  };
}

export const TerminalView = forwardRef<TerminalViewHandle, TerminalViewProps>(
  function TerminalView(props, ref) {
    const native = useRef<NativeHandle>(null);
    const queue = useMemo(createCallQueue, []);

    useImperativeHandle(ref, () => {
      const call = (fn: (n: NativeHandle) => Promise<unknown>) =>
        queue.run(() => {
          if (native.current) fn(native.current).catch(() => {});
        });
      return {
        write: (b64) => call((n) => n.write(b64)),
        paste: (text) => call((n) => n.paste(text)),
        scrollToBottom: () => call((n) => n.scrollToBottom()),
        copySelection: () => call((n) => n.copySelection()),
        selectAll: () => call((n) => n.selectAll()),
        focus: () => call((n) => n.focus()),
        blur: () => call((n) => n.blur()),
        toggleModifier: (name) => call((n) => n.toggleModifier(name)),
        sendKey: (name, shift = false) => call((n) => n.sendKey(name, shift)),
        typeText: (text) => call((n) => n.typeText(text)),
        answerClipboard: (id, allow) =>
          call((n) => n.answerClipboard(id, allow)),
        search: (query, options = {}) =>
          call((n) =>
            n.search(query, {
              caseSensitive: !!options.caseSensitive,
              wholeWord: !!options.wholeWord,
              regex: !!options.regex,
            }),
          ),
        searchNext: () => call((n) => n.searchNext()),
        searchPrevious: () => call((n) => n.searchPrevious()),
        clearSearch: () => call((n) => n.clearSearch()),
        getStats: async () =>
          queue.ready && native.current ? native.current.getStats() : null,
      };
    }, [queue]);

    if (!NativeView) return null;
    return (
      <NativeView
        ref={native}
        style={props.style}
        pipeId={props.pipeId ?? null}
        fontSize={props.fontSize}
        fontFamily={props.fontFamily}
        lineHeight={props.lineHeight}
        letterSpacing={props.letterSpacing}
        theme={nativeTheme(props.theme)}
        cursor={props.cursor}
        scrollback={props.scrollback}
        bell={props.bell}
        optionAsMeta={props.optionAsMeta}
        accentColor={props.accentColor}
        watchPrompt={props.watchPrompt ?? false}
        surfaceVisible={props.surfaceVisible ?? true}
        onPromptLine={(e) => props.onPromptLine?.(e.nativeEvent.line)}
        onMenu={() => props.onMenu?.()}
        onShortcut={(e) => props.onShortcut?.(e.nativeEvent.id)}
        onSearch={(e) =>
          props.onSearch?.({
            total: e.nativeEvent.total,
            index: e.nativeEvent.index,
          })
        }
        onInput={(e) => props.onInput(e.nativeEvent.data)}
        onResize={(e) => {
          queue.markReady();
          props.onResize(e.nativeEvent.cols, e.nativeEvent.rows);
        }}
        onBell={() => props.onBell?.()}
        onTitleChange={(e) => props.onTitle?.(e.nativeEvent.title)}
        onScrollState={(e) => props.onScrollState?.(e.nativeEvent.atBottom)}
        onLink={(e) => props.onLink?.(e.nativeEvent.url)}
        onCopy={(e) =>
          props.onCopy?.(e.nativeEvent.text, e.nativeEvent.fromProgram)
        }
        onClipboardRequest={(e) =>
          props.onClipboardRequest?.({
            id: e.nativeEvent.id,
            kind: e.nativeEvent.kind,
            text: e.nativeEvent.text,
          })
        }
        onFontSize={(e) => props.onFontSize?.(e.nativeEvent.size)}
        onModifiers={(e) =>
          props.onModifiers?.({
            ctrl: e.nativeEvent.ctrl,
            alt: e.nativeEvent.alt,
          })
        }
      />
    );
  },
);
