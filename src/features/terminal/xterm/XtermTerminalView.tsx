import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { WebView } from "react-native-webview";
import { LOCAL_PAGE_ORIGINS, stayOnLocalPage } from "@/utils/webview";
import { ChevronDown } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { showToast } from "@/utils/toast";
import { useUiColors } from "@/contexts/ThemeContext";
import type { TerminalConfig } from "@/types";
import type { TerminalThemeColors } from "@/constants/terminal-themes";
import { loadXtermAssets } from "../loadXtermAssets";

// The xterm fonts for the family names the native view uses.
const XTERM_FONTS: Record<string, string> = {
  "CaskaydiaCove NFM":
    '"Caskaydia Cove Nerd Font Mono", "SF Mono", Consolas, "Liberation Mono", monospace',
  "JetBrainsMono NFM":
    '"JetBrains Mono", "SF Mono", Consolas, "Liberation Mono", monospace',
  "FiraCode Nerd Font Mono":
    '"Fira Code", "SF Mono", Consolas, "Liberation Mono", monospace',
  monospace: '"SF Mono", Consolas, "Liberation Mono", monospace',
};

export interface XtermTerminalApi {
  write(text: string): void;
  notifyConnected(fromBackground: boolean, isReattach: boolean): void;
  fit(): void;
  scrollToBottom(): void;
  isSelecting(): boolean;
}

interface Props {
  config: Partial<TerminalConfig>;
  colors: TerminalThemeColors;
  fontFamily: string;
  fontSize: number;
  /** Hidden until the shell sends its first output. */
  hasData: boolean;
  /** The page is up, with its first size. */
  onReady: (cols: number, rows: number) => void;
  onResize: (cols: number, rows: number) => void;
  /** Wheel input xterm makes from touch scrolling. */
  onInput: (data: string) => void;
  onFailure: (message: string) => void;
}

/** The terminal before 2.0, xterm in a web view. Behind the fallback flag only. */
export const XtermTerminalView = forwardRef<XtermTerminalApi, Props>(
  function XtermTerminalView(
    {
      config: terminalConfig,
      colors: themeColors,
      fontFamily: family,
      fontSize,
      hasData,
      onReady,
      onResize,
      onInput,
      onFailure,
    },
    ref,
  ) {
    const ui = useUiColors();
    const webViewRef = useRef<WebView>(null);
    const [htmlContent, setHtmlContent] = useState("");
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectedText, setSelectedText] = useState("");
    const [showScrollToBottomButton, setShowScrollToBottomButton] =
      useState(false);
    const viewportHeightRef = useRef<number | null>(null);
    const viewportDebounceTimerRef = useRef<ReturnType<
      typeof setTimeout
    > | null>(null);
    const pendingDataRef = useRef<string[]>([]);
    const dataFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

    const generateHTML = useCallback(
      (assets: {
        xtermJs: string;
        xtermCss: string;
        fitAddonJs: string;
        nerdFontBase64?: string;
      }) => {
        const { width, height } = Dimensions.get("window");
        const baseFontSize = fontSize || 16;
        const fontFamily = XTERM_FONTS[family] ?? XTERM_FONTS.monospace;
        const nerdFontFace = assets.nerdFontBase64
          ? `@font-face {
      font-family: "Caskaydia Cove Nerd Font Mono";
      src: url("data:font/ttf;base64,${assets.nerdFontBase64}") format("truetype");
      font-style: normal;
      font-weight: 400;
      font-display: block;
    }`
          : "";

        return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terminal</title>
  <style>${assets.xtermCss}</style>
  <script>${assets.xtermJs}</script>
  <script>${assets.fitAddonJs}</script>
  <style>
    ${nerdFontFace}

    body {
      margin: 0;
      padding: 4px 4px 0 4px;
      background-color: ${themeColors.background};
      font-family: ${fontFamily};
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      box-sizing: border-box;
    }

    /* Padding lives on body, not #terminal: the fit addon derives the row
       count from #terminal's height but subtracts .xterm's padding (which is
       0), so any padding here would not be accounted for and the bottom row
       would be clipped. No bottom padding: the row count is floored, so up to
       a cell of slack already sits below the last row. */
    #terminal {
      width: 100%;
      height: 100%;
      margin: 0;
      box-sizing: border-box;
    }

    .xterm {
      width: 100% !important;
      height: 100% !important;
    }

    .xterm-viewport {
      width: 100% !important;
      height: 100% !important;
      overflow: hidden !important;
      -webkit-overflow-scrolling: auto;
    }

    /* Disable native touch-scrolling of the embedded terminal at the source.
       The terminal is scroll-driven exclusively by JS (synthetic WheelEvent →
       viewport.scrollTop). Without this, iOS WKWebView / Android WebView's
       native touch scroll of .xterm-viewport bubbles to the page when the
       (alternate) buffer is at its top, scrolling the whole WebView instead of
       the terminal. */
    html, body, #terminal, .xterm, .xterm-viewport, .xterm-screen {
      touch-action: none;
      -webkit-touch-action: none;
      -ms-touch-action: none;
    }

    .xterm {
      font-feature-settings: "liga" 1, "calt" 1;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    .xterm .xterm-screen {
      font-family: ${fontFamily} !important;
      font-variant-ligatures: contextual;
    }

    .xterm .xterm-screen .xterm-char {
      font-feature-settings: "liga" 1, "calt" 1;
    }

    .xterm .xterm-viewport::-webkit-scrollbar {
      width: 8px;
      background: transparent;
    }
    .xterm .xterm-viewport::-webkit-scrollbar-thumb {
      background: rgba(180,180,180,0.7);
      border-radius: 4px;
    }
    .xterm .xterm-viewport::-webkit-scrollbar-thumb:hover {
      background: rgba(120,120,120,0.9);
    }
    .xterm .xterm-viewport {
      scrollbar-width: thin;
      scrollbar-color: rgba(180,180,180,0.7) transparent;
    }
    * {
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
    }
    /* Native selection fights the custom touch selection, so turn it off. */
    html, body, #terminal, .xterm {
      user-select: none;
      -webkit-user-select: none;
      -ms-user-select: none;
      -moz-user-select: none;
    }

    input, textarea, [contenteditable], .xterm-helper-textarea {
      position: absolute !important;
      left: -9999px !important;
      top: -9999px !important;
      width: 1px !important;
      height: 1px !important;
      opacity: 0 !important;
      pointer-events: none !important;
      color: transparent !important;
      background: transparent !important;
      border: none !important;
      outline: none !important;
      caret-color: transparent !important;
      -webkit-text-fill-color: transparent !important;
    }

  </style>
</head>
<body>
  <div id="terminal"></div>

  <script>
    const screenWidth = ${width};
    const screenHeight = ${height};

    const baseFontSize = ${baseFontSize};

    const terminal = new Terminal({
      cursorBlink: ${terminalConfig.cursorBlink || false},
      cursorStyle: '${terminalConfig.cursorStyle || "bar"}',
      scrollback: ${terminalConfig.scrollback || 10000},
      fontSize: baseFontSize,
      fontFamily: ${JSON.stringify(fontFamily)},
      letterSpacing: ${terminalConfig.letterSpacing || 0},
      lineHeight: ${terminalConfig.lineHeight || 1.2},
      theme: {
        background: '${themeColors.background}',
        foreground: '${themeColors.foreground}',
        cursor: '${themeColors.cursor || themeColors.foreground}',
        cursorAccent: '${themeColors.cursorAccent || themeColors.background}',
        selectionBackground: '${themeColors.selectionBackground || "rgba(255, 255, 255, 0.3)"}',
        selectionForeground: '${themeColors.selectionForeground || ""}',
        black: '${themeColors.black}',
        red: '${themeColors.red}',
        green: '${themeColors.green}',
        yellow: '${themeColors.yellow}',
        blue: '${themeColors.blue}',
        magenta: '${themeColors.magenta}',
        cyan: '${themeColors.cyan}',
        white: '${themeColors.white}',
        brightBlack: '${themeColors.brightBlack}',
        brightRed: '${themeColors.brightRed}',
        brightGreen: '${themeColors.brightGreen}',
        brightYellow: '${themeColors.brightYellow}',
        brightBlue: '${themeColors.brightBlue}',
        brightMagenta: '${themeColors.brightMagenta}',
        brightCyan: '${themeColors.brightCyan}',
        brightWhite: '${themeColors.brightWhite}'
      },
      allowTransparency: true,
      convertEol: true,
      screenReaderMode: true,
      windowsMode: false,
      macOptionIsMeta: false,
      macOptionClickForcesSelection: false,
      rightClickSelectsWord: false,
      fastScrollModifier: 'alt',
      fastScrollSensitivity: 5,
      allowProposedApi: true,
      disableStdin: true,
      cursorInactiveStyle: '${terminalConfig.cursorStyle || "bar"}'
    });

    const fitAddon = new FitAddon.FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(document.getElementById('terminal'));

    // Bridge xterm-originated wheel input back to the pty. Stdin remains
    // disabled outside the synchronous wheel dispatch below, so keyboard text
    // continues to use only the React Native input path.
    terminal.onData(function(data) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'input', data: data }));
      }
    });

    fitAddon.fit();
    terminal.write('\x1b[?25h');

    setTimeout(() => {
      const inputs = document.querySelectorAll('input, textarea, .xterm-helper-textarea');
      inputs.forEach(input => {
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('spellcheck', 'false');
        input.style.color = 'transparent';
        input.style.caretColor = 'transparent';
        input.style.webkitTextFillColor = 'transparent';
      });
    }, 100);

    let isScrolledToBottom = true;
    let scrollStateFrame = null;

    function getIsScrolledToBottom() {
      try {
        return terminal.buffer.active.viewportY >= terminal.buffer.active.baseY;
      } catch(e) {
        return true;
      }
    }

    function postScrollState() {
      const nextIsAtBottom = getIsScrolledToBottom();
      if (nextIsAtBottom === isScrolledToBottom) {
        return;
      }

      isScrolledToBottom = nextIsAtBottom;
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'scrollState',
          data: { isAtBottom: isScrolledToBottom }
        }));
      }
    }

    function scheduleScrollStateUpdate() {
      if (scrollStateFrame !== null) {
        return;
      }

      scrollStateFrame = requestAnimationFrame(function() {
        scrollStateFrame = null;
        postScrollState();
      });
    }

    terminal.onScroll(scheduleScrollStateUpdate);

    // connectionEpoch is incremented each time notifyConnected fires.
    // The write callback captures its epoch at call time; if it no longer
    // matches the current epoch the connection already moved on, so we skip
    // the dataReceived notification to avoid spurious state changes.
    let connectionEpoch = 0;
    let notifiedEpoch = -1;
    window.writeToTerminal = function(data) {
      const shouldStickToBottom = getIsScrolledToBottom();
      const capturedEpoch = connectionEpoch;
      try {
        terminal.write(data, function() {
          if (notifiedEpoch !== capturedEpoch) {
            notifiedEpoch = capturedEpoch;
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dataReceived' }));
            }
          }
          if (shouldStickToBottom) {
            terminal.scrollToBottom();
          }
          scheduleScrollStateUpdate();
        });
      } catch(e) {}
    };

    window.notifyConnected = function(fromBackground, isReattach) {
      connectionEpoch += 1;
      terminal.clear();
      if (isReattach) {
        terminal.write('\\x1b[2J\\x1b[H\\x1b[?25h');
      } else {
        terminal.reset();
        terminal.write('\\x1b[2J\\x1b[H\\x1b[?25h');
      }
    };

    const terminalElement = document.getElementById('terminal');

    window.resetScroll = function() {
      terminal.scrollToBottom();
      scheduleScrollStateUpdate();
    }

    document.addEventListener('focusin', function(e) {
      if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.target && e.target.blur) {
          e.target.blur();
        }
        return false;
      }
    }, true);

    document.addEventListener('focus', function(e) {
      if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.target && e.target.blur) {
          e.target.blur();
        }
        return false;
      }
    }, true);

    terminalElement.addEventListener('contextmenu', function(e){
      e.preventDefault();
      e.stopPropagation();
      return false;
    }, { passive: false });

    // Touch text selection. xterm only selects with a mouse, so long-press
    // selects a word, dragging extends it, and the two handles resize it.
    let isCurrentlySelecting = false;
    let selectDragActive = false;
    let longPressTimeout = null;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let hasMoved = false;
    let wordStart = null;
    let wordEnd = null;
    let selStart = null;
    let selEnd = null;

    const HANDLE_SIZE = 40;
    const handleStyle = document.createElement('style');
    handleStyle.textContent =
      '.sel-handle{position:fixed;width:' + HANDLE_SIZE + 'px;height:' + HANDLE_SIZE + 'px;display:none;z-index:50;touch-action:none;}' +
      '.sel-handle .knob{position:absolute;top:2px;width:18px;height:18px;background:${ui.brand};}' +
      '.sel-handle.start .knob{right:' + (HANDLE_SIZE / 2 - 1) + 'px;border-radius:50% 0 50% 50%;}' +
      '.sel-handle.end .knob{left:' + (HANDLE_SIZE / 2 - 1) + 'px;border-radius:0 50% 50% 50%;}';
    document.head.appendChild(handleStyle);

    function makeHandle(kind) {
      const el = document.createElement('div');
      el.className = 'sel-handle ' + kind;
      const knob = document.createElement('div');
      knob.className = 'knob';
      el.appendChild(knob);
      document.body.appendChild(el);
      return el;
    }
    const startHandle = makeHandle('start');
    const endHandle = makeHandle('end');

    function postToRN(type, data) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, data: data || {} }));
      }
    }

    function postSelection() {
      postToRN('selectionChanged', { text: terminal.getSelection() || '' });
    }

    function screenRect() {
      const screen = terminal.element.querySelector('.xterm-screen') || terminal.element;
      return screen.getBoundingClientRect();
    }

    function cellSize() {
      return terminal._core._renderService.dimensions.css.cell;
    }

    // Column snaps to the nearest cell edge so handles land between letters.
    function edgeFromPoint(x, y) {
      const rect = screenRect();
      const cell = cellSize();
      let col = Math.round((x - rect.left) / cell.width);
      let row = Math.floor((y - rect.top) / cell.height);
      col = Math.max(0, Math.min(terminal.cols, col));
      row = Math.max(0, Math.min(terminal.rows - 1, row));
      return { col: col, row: row + terminal.buffer.active.viewportY };
    }

    function cellFromPoint(x, y) {
      const rect = screenRect();
      const cell = cellSize();
      let col = Math.floor((x - rect.left) / cell.width);
      let row = Math.floor((y - rect.top) / cell.height);
      col = Math.max(0, Math.min(terminal.cols - 1, col));
      row = Math.max(0, Math.min(terminal.rows - 1, row));
      return { col: col, row: row + terminal.buffer.active.viewportY };
    }

    function isWordChar(ch) {
      return !!ch && ' "()[]{}<>|;,'.indexOf(ch) === -1 && ch !== "'" && ch.charCodeAt(0) !== 96;
    }

    function wordAt(pos) {
      const line = terminal.buffer.active.getLine(pos.row);
      if (!line) return { start: pos, end: pos };
      const text = line.translateToString(false);
      let s = pos.col;
      let e = pos.col;
      if (isWordChar(text[pos.col])) {
        while (s > 0 && isWordChar(text[s - 1])) s--;
        while (e < terminal.cols - 1 && isWordChar(text[e + 1])) e++;
      }
      return { start: { col: s, row: pos.row }, end: { col: e, row: pos.row } };
    }

    function before(a, b) {
      return a.row < b.row || (a.row === b.row && a.col < b.col);
    }

    function applySelection() {
      if (!selStart || !selEnd) return;
      const len = (selEnd.row - selStart.row) * terminal.cols + (selEnd.col - selStart.col) + 1;
      terminal.select(selStart.col, selStart.row, Math.max(1, len));
      updateHandles();
    }

    function placeHandle(el, pos, isStart) {
      const visRow = pos.row - terminal.buffer.active.viewportY;
      if (visRow < 0 || visRow >= terminal.rows) {
        el.style.display = 'none';
        return;
      }
      const rect = screenRect();
      const cell = cellSize();
      const x = rect.left + (isStart ? pos.col : pos.col + 1) * cell.width;
      const y = rect.top + (visRow + 1) * cell.height;
      el.style.left = (x - HANDLE_SIZE / 2) + 'px';
      el.style.top = y + 'px';
      el.style.display = 'block';
    }

    function updateHandles() {
      if (!isCurrentlySelecting || !selStart || !selEnd) {
        startHandle.style.display = 'none';
        endHandle.style.display = 'none';
        return;
      }
      placeHandle(startHandle, selStart, true);
      placeHandle(endHandle, selEnd, false);
    }

    function endSelection() {
      selectDragActive = false;
      wordStart = null;
      wordEnd = null;
      selStart = null;
      selEnd = null;
      if (terminal.hasSelection()) terminal.clearSelection();
      if (isCurrentlySelecting) {
        isCurrentlySelecting = false;
        postToRN('selectionEnd');
      }
      updateHandles();
    }

    function extendSelectionTo(pos) {
      if (!wordStart || !wordEnd) return;
      if (before(pos, wordStart)) {
        selStart = pos;
        selEnd = wordEnd;
      } else if (before(wordEnd, pos)) {
        selStart = wordStart;
        selEnd = pos;
      } else {
        selStart = wordStart;
        selEnd = wordEnd;
      }
      applySelection();
    }

    function bindHandle(el, isStart) {
      let offsetX = 0;
      let offsetY = 0;
      let scrollTimer = null;
      let lastX = 0;
      let lastY = 0;

      function moveTo(x, y) {
        if (!selStart || !selEnd) return;
        const edge = edgeFromPoint(x - offsetX, y - offsetY);
        if (isStart) {
          let pos = { col: Math.min(edge.col, terminal.cols - 1), row: edge.row };
          if (before(selEnd, pos)) pos = { col: selEnd.col, row: selEnd.row };
          selStart = pos;
        } else {
          let pos = { col: edge.col - 1, row: edge.row };
          if (pos.col < 0) {
            pos = pos.row > 0 ? { col: terminal.cols - 1, row: pos.row - 1 } : { col: 0, row: 0 };
          }
          if (before(pos, selStart)) pos = { col: selStart.col, row: selStart.row };
          selEnd = pos;
        }
        applySelection();
      }

      // Scroll while the handle is held past the top or bottom edge.
      function autoScroll() {
        const rect = screenRect();
        const y = lastY - offsetY;
        let dir = 0;
        if (y < rect.top) dir = -1;
        else if (y > rect.bottom) dir = 1;
        if (dir !== 0) {
          terminal.scrollLines(dir);
          moveTo(lastX, lastY);
        }
      }

      el.addEventListener('touchstart', (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        e.preventDefault();
        e.stopPropagation();
        const t = e.touches[0];
        const r = el.getBoundingClientRect();
        const cell = cellSize();
        // Keep the gap between the finger and the selection edge constant.
        offsetX = t.clientX - (r.left + HANDLE_SIZE / 2);
        offsetY = t.clientY - (r.top - cell.height / 2);
        lastX = t.clientX;
        lastY = t.clientY;
        if (scrollTimer) clearInterval(scrollTimer);
        scrollTimer = setInterval(autoScroll, 80);
      }, { passive: false });

      el.addEventListener('touchmove', (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        e.preventDefault();
        e.stopPropagation();
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
        moveTo(lastX, lastY);
      }, { passive: false });

      function finish(e) {
        try { e.preventDefault(); } catch(e2) {}
        e.stopPropagation();
        if (scrollTimer) clearInterval(scrollTimer);
        scrollTimer = null;
        postSelection();
      }
      el.addEventListener('touchend', finish, { passive: false });
      el.addEventListener('touchcancel', finish, { passive: false });
    }
    bindHandle(startHandle, true);
    bindHandle(endHandle, false);

    terminal.onScroll(updateHandles);
    terminal.onRender(updateHandles);

    terminalElement.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length !== 1) {
        if (longPressTimeout) clearTimeout(longPressTimeout);
        longPressTimeout = null;
        return;
      }
      touchStartTime = Date.now();
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      hasMoved = false;

      if (longPressTimeout) clearTimeout(longPressTimeout);
      longPressTimeout = setTimeout(() => {
        longPressTimeout = null;
        if (hasMoved) return;
        const word = wordAt(cellFromPoint(touchStartX, touchStartY));
        wordStart = word.start;
        wordEnd = word.end;
        selStart = wordStart;
        selEnd = wordEnd;
        selectDragActive = true;
        if (!isCurrentlySelecting) {
          isCurrentlySelecting = true;
          postToRN('selectionStart');
        }
        applySelection();
        postSelection();
      }, 400);
    }, { passive: true });

    terminalElement.addEventListener('touchmove', (e) => {
      if (!e.touches || e.touches.length === 0) return;
      const t = e.touches[0];
      if (selectDragActive) {
        try { e.preventDefault(); } catch(e2) {}
        extendSelectionTo(cellFromPoint(t.clientX, t.clientY));
        return;
      }
      if (Math.abs(t.clientX - touchStartX) > 10 || Math.abs(t.clientY - touchStartY) > 10) {
        hasMoved = true;
        if (longPressTimeout) {
          clearTimeout(longPressTimeout);
          longPressTimeout = null;
        }
      }
    }, { passive: false });

    terminalElement.addEventListener('touchend', (e) => {
      if (longPressTimeout) {
        clearTimeout(longPressTimeout);
        longPressTimeout = null;
      }
      if (selectDragActive) {
        // Stop the synthesized mouse events, xterm would clear the selection.
        try { e.preventDefault(); } catch(e2) {}
        selectDragActive = false;
        postSelection();
        return;
      }
      if (isCurrentlySelecting) {
        try { e.preventDefault(); } catch(e2) {}
        const isTap = !hasMoved && Date.now() - touchStartTime < 400;
        if (isTap) endSelection();
      }
    }, { passive: false });

    terminalElement.addEventListener('touchcancel', () => {
      if (longPressTimeout) {
        clearTimeout(longPressTimeout);
        longPressTimeout = null;
      }
      if (selectDragActive) {
        selectDragActive = false;
        postSelection();
      }
    });

    // xterm drops the selection on its own sometimes (buffer switch, trim).
    terminal.onSelectionChange(() => {
      if (isCurrentlySelecting && !selectDragActive && !terminal.hasSelection()) {
        endSelection();
      }
    });

    window.selectAllTerminal = function() {
      wordStart = null;
      wordEnd = null;
      selStart = { col: 0, row: 0 };
      selEnd = { col: terminal.cols - 1, row: Math.max(0, terminal.buffer.active.length - 1) };
      if (!isCurrentlySelecting) {
        isCurrentlySelecting = true;
        postToRN('selectionStart');
      }
      applySelection();
      postSelection();
    };

    window.clearTerminalSelection = function() {
      endSelection();
    };

    function handleResize() {
      fitAddon.fit();
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'resize',
          data: { cols: terminal.cols, rows: terminal.rows }
        }));
      }
    }

    var lastViewportHeight = null;
    function applyViewportHeight(px, force) {
      var el = document.getElementById('terminal');
      if (!el || !px || px <= 0) return;
      if (!force && Math.abs(px - (lastViewportHeight || 0)) < 1) return;
      lastViewportHeight = px;

      // px is the RN-measured height of the whole WebView; body's vertical
      // padding has to come off before sizing #terminal, or the fit addon
      // rounds up a row that then gets clipped.
      var bodyStyle = window.getComputedStyle(document.body);
      var vPad = (parseFloat(bodyStyle.paddingTop) || 0) +
                 (parseFloat(bodyStyle.paddingBottom) || 0);
      el.style.height = Math.max(0, px - vPad) + 'px';
      el.style.minHeight = '0px';

      try {
        fitAddon.fit();
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'resize',
            data: { cols: terminal.cols, rows: terminal.rows }
          }));
        }
        // If the user was scrolled near the bottom, keep them pinned there so
        // the prompt/TUI input row stays visible after the resize.
        try {
          if (terminal.buffer.active.viewportY >= terminal.buffer.active.baseY - 1) {
            terminal.scrollToBottom();
          }
        } catch(e2) {}
      } catch(e) {}
    }
    window.setTerminalViewportHeight = function(px) {
      applyViewportHeight(px, false);
    }

    // Re-fit using the last RN-measured viewport height (if known) instead of
    // the possibly-stale 100vh, so RN-driven resizes (keyboard, orientation,
    // chrome show/hide) keep the row count in sync with the visible area.
    window.nativeFit = function() {
      if (lastViewportHeight) {
        applyViewportHeight(lastViewportHeight, true);
      } else {
        try { handleResize(); } catch(e) {}
      }
    }

    window.addEventListener('resize', function() {
      // Prefer the RN-measured height; fall back to the WebView's own viewport
      // when RN hasn't measured yet (e.g. initial load before onLayout).
      if (lastViewportHeight) {
        applyViewportHeight(lastViewportHeight, true);
      } else {
        try { handleResize(); } catch(e) {}
      }
    });

    window.addEventListener('orientationchange', function() {
      setTimeout(handleResize, 100);
    });

    // Touch-scroll for both the normal scrollback and TUI alternate-screen
    // buffers. Instead of calling terminal.scrollLines() (which is a no-op on
    // the alt buffer that Claude Code / Codex run in), synthesize a wheel
    // event on the xterm root element: xterm then routes it either to the
    // scrollback (normal buffer) or to SGR mouse / arrow-key sequences the TUI
    // understands (alternate buffer with/without mouse tracking).
    // touchmove is non-passive so we can preventDefault and stop the native
    // WebView/page from hijacking the swipe (especially up-swipe when the
    // alt buffer is already at its top).
    (function() {
      var scrollTouchY = null;
      var pendingLines = 0;
      var lineH = terminal._core._renderService.dimensions.css.cell.height || ${baseFontSize * 1.2};
      terminalElement.addEventListener('touchstart', function(e) {
        if (e.touches.length === 1) scrollTouchY = e.touches[0].clientY;
      }, { passive: true, capture: true });
      terminalElement.addEventListener('touchmove', function(e) {
        if (scrollTouchY === null || e.touches.length !== 1) return;
        // While the user is text-selecting, leave the gesture alone so xterm's
        // selection drag can track the finger.
        if (selectDragActive) {
          return;
        }
        // Claim the gesture so WKWebView / Android WebView do not scroll the
        // whole page when the terminal content cannot scroll further.
        try { e.preventDefault(); } catch(e3) {}
        var dy = scrollTouchY - e.touches[0].clientY;
        scrollTouchY = e.touches[0].clientY;
        pendingLines += dy / lineH;
        var whole = Math.trunc(pendingLines);
        if (whole !== 0) {
          pendingLines -= whole;
          try {
            terminal.options.disableStdin = false;
            try {
              terminal.element.dispatchEvent(new WheelEvent('wheel', {
                deltaY: whole,
                deltaMode: WheelEvent.DOM_DELTA_LINE,
                cancelable: true
              }));
            } finally {
              terminal.options.disableStdin = true;
            }
          } catch(e2) {}
        }
      }, { passive: false, capture: true });
      terminalElement.addEventListener('touchend', function() {
        scrollTouchY = null;
        pendingLines = 0;
      }, { passive: true, capture: true });
    })();

    terminal.clear();
    terminal.reset();
    terminal.write('\\x1b[2J\\x1b[H');

    setTimeout(function() {
      fitAddon.fit();
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'terminalReady',
          data: { cols: terminal.cols, rows: terminal.rows }
        }));
      }
    }, 150);
  </script>
</body>
</html>
    `;
      },
      [terminalConfig, themeColors, family, fontSize, ui.brand],
    );

    useEffect(() => {
      loadXtermAssets(family === "CaskaydiaCove NFM").then((assets) => {
        setHtmlContent(generateHTML(assets));
      });
      // Settings apply on the next connection, like before.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(
      () => () => {
        if (dataFlushTimerRef.current) clearTimeout(dataFlushTimerRef.current);
        if (viewportDebounceTimerRef.current)
          clearTimeout(viewportDebounceTimerRef.current);
      },
      [],
    );

    const inject = (js: string) => {
      try {
        webViewRef.current?.injectJavaScript(`${js}; true;`);
      } catch {}
    };

    useImperativeHandle(
      ref,
      () => ({
        write: (data) => {
          pendingDataRef.current.push(data);
          if (!dataFlushTimerRef.current) {
            dataFlushTimerRef.current = setTimeout(() => {
              dataFlushTimerRef.current = null;
              const batch = pendingDataRef.current.join("");
              pendingDataRef.current = [];
              inject(`window.writeToTerminal(${JSON.stringify(batch)})`);
            }, 16);
          }
        },
        notifyConnected: (fromBackground, isReattach) =>
          inject(`window.notifyConnected(${fromBackground}, ${isReattach})`),
        fit: () => inject("window.nativeFit && window.nativeFit()"),
        scrollToBottom: () => {
          setShowScrollToBottomButton(false);
          inject("window.resetScroll && window.resetScroll()");
        },
        isSelecting: () => isSelecting,
      }),
      [isSelecting],
    );

    const handleLayout = useCallback((event: LayoutChangeEvent) => {
      const h = Math.round(event.nativeEvent.layout.height || 0);
      if (h <= 0 || h === viewportHeightRef.current) return;
      viewportHeightRef.current = h;
      // Debounce so mid-animation frames don't each trigger a pty resize.
      if (viewportDebounceTimerRef.current)
        clearTimeout(viewportDebounceTimerRef.current);
      viewportDebounceTimerRef.current = setTimeout(() => {
        viewportDebounceTimerRef.current = null;
        inject(
          `window.setTerminalViewportHeight && window.setTerminalViewportHeight(${h})`,
        );
      }, 80);
    }, []);

    const clearSelection = () =>
      inject(
        "window.clearTerminalSelection && window.clearTerminalSelection()",
      );
    const selectAll = () =>
      inject("window.selectAllTerminal && window.selectAllTerminal()");
    const copySelection = async () => {
      if (!selectedText) return;
      try {
        await Clipboard.setStringAsync(selectedText);
        showToast.success("Copied");
      } catch {
        showToast.error("Could not copy");
      }
      clearSelection();
    };

    const handleMessage = (event: any) => {
      try {
        const message = JSON.parse(event.nativeEvent.data);
        switch (message.type) {
          case "terminalReady":
            if (viewportHeightRef.current) {
              inject(
                `window.setTerminalViewportHeight && window.setTerminalViewportHeight(${viewportHeightRef.current})`,
              );
            }
            onReady(message.data.cols, message.data.rows);
            break;
          case "resize":
            onResize(message.data.cols, message.data.rows);
            break;
          case "selectionStart":
            setIsSelecting(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
              () => {},
            );
            break;
          case "selectionChanged":
            setSelectedText(message.data?.text || "");
            break;
          case "selectionEnd":
            setIsSelecting(false);
            setSelectedText("");
            break;
          case "scrollState":
            setShowScrollToBottomButton(!message.data.isAtBottom);
            break;
          case "input":
            onInput(message.data);
            break;
        }
      } catch {}
    };

    return (
      <View style={{ flex: 1 }} onLayout={handleLayout}>
        <WebView
          ref={webViewRef}
          source={{ html: htmlContent }}
          originWhitelist={LOCAL_PAGE_ORIGINS}
          onShouldStartLoadWithRequest={stayOnLocalPage}
          style={{
            flex: 1,
            width: "100%",
            height: "100%",
            backgroundColor: themeColors.background,
            opacity: hasData ? 1 : 0,
          }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={false}
          scalesPageToFit={false}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          keyboardDisplayRequiresUserAction={false}
          hideKeyboardAccessoryView={true}
          cacheEnabled={false}
          cacheMode="LOAD_NO_CACHE"
          androidLayerType="hardware"
          onMessage={handleMessage}
          onError={(e) =>
            onFailure(`WebView error: ${e.nativeEvent.description}`)
          }
          onHttpError={(e) =>
            onFailure(`WebView HTTP error: ${e.nativeEvent.statusCode}`)
          }
          scrollEnabled={false}
          overScrollMode="never"
          bounces={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={false}
          textZoom={100}
          setSupportMultipleWindows={false}
        />

        {isSelecting && (
          <View
            style={{
              position: "absolute",
              top: 8,
              alignSelf: "center",
              flexDirection: "row",
              backgroundColor: ui.card,
              borderWidth: 1,
              borderColor: ui.brand,
              zIndex: 30,
              elevation: 6,
            }}
          >
            {[
              { label: "Copy", onPress: copySelection },
              { label: "Select all", onPress: selectAll },
              { label: "Cancel", onPress: clearSelection },
            ].map((action) => (
              <TouchableOpacity
                key={action.label}
                accessibilityRole="button"
                onPress={action.onPress}
                style={{ paddingVertical: 8, paddingHorizontal: 14 }}
              >
                <Text
                  style={{ color: ui.text, fontSize: 14, fontWeight: "600" }}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {showScrollToBottomButton && hasData && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Scroll to bottom"
            onPress={() => {
              setShowScrollToBottomButton(false);
              inject("window.resetScroll && window.resetScroll()");
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
        )}
      </View>
    );
  },
);
