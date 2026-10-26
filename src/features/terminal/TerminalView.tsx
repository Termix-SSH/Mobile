import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Linking, TouchableOpacity, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import {
  TerminalView as NativeTerminalView,
  type ClipboardRequest,
  type StickyState,
  type TerminalKeyName,
  type TerminalSearchOptions,
  type TerminalSearchResult,
  type TerminalViewHandle,
} from "@/modules/termix-terminal";
import { fromBase64 } from "@/modules/termix-ssh/src/base64";
import { utf8Decode } from "@/core/db/bytes";
import { useUiColors } from "@/contexts/ThemeContext";
import { trace } from "@/core/log/trace";
import { useConfirm } from "@/ui/Confirm";
import { showToast } from "@/utils/toast";
import type { TerminalSettings } from "./settings";
import {
  OutputBatcher,
  clipboardPrompt,
  isOpenableLink,
  linkPrompt,
} from "./output";

export interface ModifierState {
  ctrl: StickyState;
  alt: StickyState;
}

export interface TerminalViewApi {
  /** Output that came through JS (relay, docker). Piped output never passes here. */
  write(text: string): void;
  paste(text: string): void;
  scrollToBottom(): void;
  copySelection(): void;
  selectAll(): void;
  focus(): void;
  blur(): void;
  /** Sizes the grid to the view again and draws. */
  refit(): void;
  sendKey(name: TerminalKeyName, shift?: boolean): void;
  typeText(text: string): void;
  toggleModifier(name: "ctrl" | "alt"): void;
  search(query: string, options?: TerminalSearchOptions): void;
  searchNext(): void;
  searchPrevious(): void;
  clearSearch(): void;
}

interface Props {
  settings: TerminalSettings;
  /** Native pipe the local SSH engine writes into. */
  pipeId?: string;
  /** Typed keys and terminal replies, as text. */
  onInput: (text: string) => void;
  onResize: (cols: number, rows: number) => void;
  onModifiers?: (state: ModifierState) => void;
  /** Pinch zoom picked a new base size. */
  onFontSize?: (size: number) => void;
  showScrollButton?: boolean;
  /** Report the prompt line for password fill and history. */
  watchPrompt?: boolean;
  /** False while the tab is hidden, so it redraws when shown again. */
  visible?: boolean;
  onPromptLine?: (line: string) => void;
  onSearch?: (result: TerminalSearchResult) => void;
  onTitle?: (title: string) => void;
  onMenu?: () => void;
  onShortcut?: (id: string) => void;
}

/** The native terminal every session renders, with its scroll button and prompts. */
export const TerminalView = forwardRef<TerminalViewApi, Props>(
  function TerminalView(
    {
      settings,
      pipeId,
      onInput,
      onResize,
      onModifiers,
      onFontSize,
      showScrollButton = true,
      watchPrompt,
      visible = true,
      onPromptLine,
      onSearch,
      onTitle,
      onMenu,
      onShortcut,
    },
    ref,
  ) {
    const ui = useUiColors();
    const confirm = useConfirm();
    const native = useRef<TerminalViewHandle>(null);
    const [atBottom, setAtBottom] = useState(true);
    const batcher = useMemo(
      () => new OutputBatcher((b64) => native.current?.write(b64)),
      [],
    );
    useEffect(() => () => batcher.dispose(), [batcher]);

    useImperativeHandle(
      ref,
      () => ({
        write: (text) => batcher.push(text),
        paste: (text) => native.current?.paste(text),
        scrollToBottom: () => native.current?.scrollToBottom(),
        copySelection: () => native.current?.copySelection(),
        selectAll: () => native.current?.selectAll(),
        focus: () => native.current?.focus(),
        blur: () => native.current?.blur(),
        refit: () => native.current?.refit(),
        sendKey: (name, shift) => native.current?.sendKey(name, shift),
        typeText: (text) => native.current?.typeText(text),
        toggleModifier: (name) => native.current?.toggleModifier(name),
        search: (query, options) => native.current?.search(query, options),
        searchNext: () => native.current?.searchNext(),
        searchPrevious: () => native.current?.searchPrevious(),
        clearSearch: () => native.current?.clearSearch(),
      }),
      [batcher],
    );

    const handleInput = useCallback(
      (b64: string) => onInput(utf8Decode(fromBase64(b64))),
      [onInput],
    );

    const handleLink = useCallback(
      async (url: string) => {
        if (!isOpenableLink(url)) {
          showToast.warning("Only web links can open from the terminal");
          return;
        }
        if (settings.linkPolicy !== "direct") {
          const ok = await confirm(linkPrompt(url));
          if (!ok) return;
        }
        Linking.openURL(url).catch(() =>
          showToast.error("Could not open link"),
        );
      },
      [confirm, settings.linkPolicy],
    );

    const handleClipboard = useCallback(
      async (request: ClipboardRequest) => {
        const ok = await confirm(clipboardPrompt(request));
        native.current?.answerClipboard(request.id, ok);
      },
      [confirm],
    );

    const handleCopy = useCallback((_text: string, fromProgram: boolean) => {
      showToast.success(fromProgram ? "Copied from the terminal" : "Copied");
    }, []);

    const fontSizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleFontSize = useCallback(
      (size: number) => {
        if (!onFontSize) return;
        if (fontSizeTimer.current) clearTimeout(fontSizeTimer.current);
        // Save once the pinch settles.
        fontSizeTimer.current = setTimeout(() => onFontSize(size), 400);
      },
      [onFontSize],
    );
    useEffect(
      () => () => {
        if (fontSizeTimer.current) clearTimeout(fontSizeTimer.current);
      },
      [],
    );

    return (
      <View style={{ flex: 1, backgroundColor: settings.colors.background }}>
        <NativeTerminalView
          ref={native}
          style={{ flex: 1 }}
          pipeId={pipeId}
          fontSize={settings.scaledFontSize}
          fontFamily={settings.fontFamily}
          lineHeight={settings.lineHeight}
          letterSpacing={settings.letterSpacing}
          theme={settings.theme}
          cursor={settings.cursor}
          scrollback={settings.scrollback}
          bell={settings.bell}
          optionAsMeta={settings.optionAsMeta}
          accentColor={ui.brand}
          onInput={handleInput}
          onResize={onResize}
          onScrollState={(atBottom) => {
            trace("term", "scroll", { pipe: pipeId, atBottom });
            setAtBottom(atBottom);
          }}
          onLink={handleLink}
          onCopy={handleCopy}
          onClipboardRequest={handleClipboard}
          onFontSize={handleFontSize}
          onModifiers={onModifiers}
          watchPrompt={watchPrompt}
          surfaceVisible={visible}
          onFocusResult={(result) =>
            trace("kb", "native focus", { pipe: pipeId, ...result })
          }
          onPromptLine={onPromptLine}
          onSearch={onSearch}
          onTitle={onTitle}
          onMenu={onMenu}
          onShortcut={onShortcut}
        />
        {showScrollButton && !atBottom ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Scroll to bottom"
            onPress={() => {
              setAtBottom(true);
              native.current?.scrollToBottom();
            }}
            style={{
              position: "absolute",
              right: 14,
              bottom: 16,
              width: 40,
              height: 40,
              backgroundColor: ui.card,
              borderWidth: 1,
              borderColor: ui.brand,
              alignItems: "center",
              justifyContent: "center",
              zIndex: 20,
              elevation: 6,
            }}
          >
            <ChevronDown size={20} color={ui.brand} />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  },
);
