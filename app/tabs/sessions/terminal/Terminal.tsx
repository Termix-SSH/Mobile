import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Dimensions,
  AccessibilityInfo,
} from "react-native";
import { WebView } from "react-native-webview";
import { logActivity, getSnippets } from "../../../main-axios";
import { showToast } from "../../../utils/toast";
import { useTerminalCustomization } from "../../../contexts/TerminalCustomizationContext";
import { BACKGROUNDS, BORDER_COLORS } from "../../../constants/designTokens";
import {
  TOTPDialog,
  SSHAuthDialog,
  HostKeyVerificationDialog,
} from "@/app/tabs/dialogs";
import { TERMINAL_THEMES, TERMINAL_FONTS } from "@/constants/terminal-themes";
import { MOBILE_DEFAULT_TERMINAL_CONFIG } from "@/constants/terminal-config";
import type { TerminalConfig } from "@/types";
import {
  NativeWebSocketManager,
  type TerminalHostConfig,
  type HostKeyData,
} from "./NativeWebSocketManager";

interface TerminalProps {
  hostConfig: {
    id: number;
    name: string;
    ip: string;
    port: number;
    username: string;
    authType: "password" | "key" | "credential" | "none";
    password?: string;
    key?: string;
    keyPassword?: string;
    keyType?: string;
    credentialId?: number;
    terminalConfig?: Partial<TerminalConfig>;
  };
  isVisible: boolean;
  title?: string;
  onClose?: () => void;
  onBackgroundColorChange?: (color: string) => void;
}

export type TerminalHandle = {
  sendInput: (data: string) => void;
  fit: () => void;
  isDialogOpen: () => boolean;
  notifyBackgrounded: () => void;
  notifyForegrounded: () => void;
  scrollToBottom: () => void;
  isSelecting: () => boolean;
};

const TerminalComponent = forwardRef<TerminalHandle, TerminalProps>(
  (
    {
      hostConfig,
      isVisible,
      title = "Terminal",
      onClose,
      onBackgroundColorChange,
    },
    ref,
  ) => {
    const webViewRef = useRef<WebView>(null);
    const wsManagerRef = useRef<NativeWebSocketManager | null>(null);
    const terminalColsRef = useRef(80);
    const terminalRowsRef = useRef(24);
    const pendingDataRef = useRef<string[]>([]);
    const dataFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

    const { config } = useTerminalCustomization();
    const [webViewKey, setWebViewKey] = useState(0);
    const [screenDimensions, setScreenDimensions] = useState(
      Dimensions.get("window"),
    );
    type ConnectionState =
      | "connecting"
      | "connected"
      | "reconnecting"
      | "disconnected"
      | "failed";
    const [connectionState, setConnectionState] =
      useState<ConnectionState>("connecting");
    const [retryCount, setRetryCount] = useState(0);
    const [hasReceivedData, setHasReceivedData] = useState(false);
    const [htmlContent, setHtmlContent] = useState("");
    const [terminalBackgroundColor, setTerminalBackgroundColor] =
      useState("#09090b");

    const [totpRequired, setTotpRequired] = useState(false);
    const [totpPrompt, setTotpPrompt] = useState("");
    const [isPasswordPrompt, setIsPasswordPrompt] = useState(false);
    const [showAuthDialog, setShowAuthDialog] = useState(false);
    const [authDialogReason, setAuthDialogReason] = useState<
      "no_keyboard" | "auth_failed" | "timeout"
    >("auth_failed");
    const [isSelecting, setIsSelecting] = useState(false);
    const [hostKeyVerification, setHostKeyVerification] = useState<{
      scenario: "new" | "changed";
      data: HostKeyData;
    } | null>(null);

    const [isScreenReaderEnabled, setIsScreenReaderEnabled] = useState(false);
    const isScreenReaderEnabledRef = useRef(false);
    const [accessibilityText, setAccessibilityText] = useState("");
    const accessibilityBufferRef = useRef<string[]>([]);
    const accessibilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

    useEffect(() => {
      AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
        setIsScreenReaderEnabled(enabled);
        isScreenReaderEnabledRef.current = enabled;
      });
      const subscription = AccessibilityInfo.addEventListener(
        "screenReaderChanged",
        (enabled) => {
          setIsScreenReaderEnabled(enabled);
          isScreenReaderEnabledRef.current = enabled;
        },
      );
      return () => subscription.remove();
    }, []);

    const writeToAccessibility = useCallback((rawData: string) => {
      const cleaned = rawData
        .replace(/\x1b\[[0-9;]*[mGKHJABCDsu]/g, "")
        .replace(/\x1b\][^\x07]*\x07/g, "")
        .replace(/\x1b[()][AB012]/g, "")
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
        .trim();

      if (!cleaned) return;

      const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length === 0) return;

      accessibilityBufferRef.current.push(...lines);
      if (accessibilityBufferRef.current.length > 5) {
        accessibilityBufferRef.current =
          accessibilityBufferRef.current.slice(-5);
      }

      if (accessibilityTimerRef.current) {
        clearTimeout(accessibilityTimerRef.current);
      }
      accessibilityTimerRef.current = setTimeout(() => {
        accessibilityTimerRef.current = null;
        const text = accessibilityBufferRef.current.join("\n");
        accessibilityBufferRef.current = [];
        setAccessibilityText(text);
        AccessibilityInfo.announceForAccessibility(text);
      }, 500);
    }, []);

    useEffect(() => {
      const subscription = Dimensions.addEventListener(
        "change",
        ({ window }) => {
          setScreenDimensions(window);
        },
      );

      return () => subscription?.remove();
    }, []);

    const handleConnectionFailure = useCallback(
      (errorMessage: string) => {
        showToast.error(errorMessage);
        setConnectionState("failed");
        if (onClose) {
          onClose();
        }
      },
      [onClose],
    );

    const generateHTML = useCallback(() => {
      const { width, height } = screenDimensions;

      const terminalConfig: Partial<TerminalConfig> = {
        ...MOBILE_DEFAULT_TERMINAL_CONFIG,
        ...config,
        ...hostConfig.terminalConfig,
      };

      const baseFontSize = config.fontSize || 16;
      const charWidth = baseFontSize * 0.6;
      const lineHeight = baseFontSize * 1.2;
      const terminalWidth = Math.floor(width / charWidth);
      const terminalHeight = Math.floor(height / lineHeight);

      void terminalWidth;
      void terminalHeight;

      const themeName = terminalConfig.theme || "termix";
      const themeColors =
        TERMINAL_THEMES[themeName]?.colors || TERMINAL_THEMES.termix.colors;

      const bgColor = themeColors.background;
      setTerminalBackgroundColor(bgColor);
      if (onBackgroundColorChange) {
        onBackgroundColorChange(bgColor);
      }

      const fontConfig = TERMINAL_FONTS.find(
        (f) => f.value === terminalConfig.fontFamily,
      );
      const fontFamily = fontConfig?.fallback || TERMINAL_FONTS[0].fallback;

      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terminal</title>
  <script src="https://unpkg.com/xterm@5.3.0/lib/xterm.js"></script>
  <script src="https://unpkg.com/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>
  <link rel="stylesheet" href="https://unpkg.com/xterm@5.3.0/css/xterm.css" />
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: ${themeColors.background};
      font-family: ${fontFamily};
      overflow: hidden;
      width: 100vw;
      height: 100vh;
    }

    #terminal {
      width: 100vw;
      height: 100vh;
      min-height: 100vh;
      padding: 4px 4px 20px 4px;
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
    }

    .xterm {
      font-feature-settings: "liga" 1, "calt" 1;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    .xterm .xterm-screen {
      font-family: 'Caskaydia Cove Nerd Font Mono', 'SF Mono', Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace !important;
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
    html, body, #terminal, .xterm {
      user-select: text;
      -webkit-user-select: text;
      -ms-user-select: text;
      -moz-user-select: text;
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

    fitAddon.fit();

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

    window.writeToTerminal = function(data) {
      try { terminal.write(data); } catch(e) {}
    };

    window.notifyConnected = function(fromBackground) {
      terminal.clear();
      terminal.reset();
      terminal.write('\\x1b[2J\\x1b[H');
    };

    const terminalElement = document.getElementById('terminal');

    window.resetScroll = function() {
      terminal.scrollToBottom();
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

    let selectionEndTimeout = null;
    let isCurrentlySelecting = false;
    let lastInteractionTime = Date.now();
    let touchStartTime = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let hasMoved = false;
    let longPressTimeout = null;

    terminalElement.addEventListener('touchstart', (e) => {
      lastInteractionTime = Date.now();
      touchStartTime = Date.now();
      hasMoved = false;

      if (e.touches && e.touches.length > 0) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }

      if (longPressTimeout) {
        clearTimeout(longPressTimeout);
      }

      longPressTimeout = setTimeout(() => {
        if (!hasMoved) {
          if (!isCurrentlySelecting) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'selectionStart', data: {} }));
            isCurrentlySelecting = true;
          }
        }
      }, 350);
    }, { passive: true });

    terminalElement.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches.length > 0) {
        const deltaX = Math.abs(e.touches[0].clientX - touchStartX);
        const deltaY = Math.abs(e.touches[0].clientY - touchStartY);

        if (deltaX > 10 || deltaY > 10) {
          hasMoved = true;
          if (longPressTimeout) {
            clearTimeout(longPressTimeout);
            longPressTimeout = null;
          }
        }
      }
    }, { passive: true });

    terminalElement.addEventListener('touchend', () => {
      if (longPressTimeout) {
        clearTimeout(longPressTimeout);
        longPressTimeout = null;
      }

      const touchDuration = Date.now() - touchStartTime;

      setTimeout(() => {
        const selection = terminal.getSelection();
        const hasSelection = selection && selection.length > 0;

        if (hasSelection) {
          lastInteractionTime = Date.now();
          if (!isCurrentlySelecting) {
            isCurrentlySelecting = true;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'selectionStart', data: {} }));
          }
        } else if (!isCurrentlySelecting && (touchDuration < 350 || hasMoved)) {
          lastInteractionTime = Date.now();
          checkIfDoneSelecting();
        }
      }, 100);
    });

    terminalElement.addEventListener('mousedown', (e) => {
      lastInteractionTime = Date.now();
    });

    terminalElement.addEventListener('mouseup', () => {
      lastInteractionTime = Date.now();
      checkIfDoneSelecting();
    });

    function checkIfDoneSelecting() {
      if (selectionEndTimeout) {
        clearTimeout(selectionEndTimeout);
      }

      selectionEndTimeout = setTimeout(() => {
        const selection = terminal.getSelection();
        const hasSelection = selection && selection.length > 0;

        if (hasSelection) {
          if (!isCurrentlySelecting) {
            isCurrentlySelecting = true;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'selectionStart', data: {} }));
          }
        } else if (isCurrentlySelecting) {
          const timeSinceLastInteraction = Date.now() - lastInteractionTime;
          if (timeSinceLastInteraction >= 150) {
            isCurrentlySelecting = false;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'selectionEnd', data: {} }));
          } else {
            checkIfDoneSelecting();
          }
        }
      }, 100);
    }

    terminal.onSelectionChange(() => {
      const selection = terminal.getSelection();
      const hasSelection = selection && selection.length > 0;

      if (hasSelection) {
        lastInteractionTime = Date.now();
        if (!isCurrentlySelecting) {
          isCurrentlySelecting = true;
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'selectionStart', data: {} }));
        }
      } else if (isCurrentlySelecting) {
        lastInteractionTime = Date.now();
        checkIfDoneSelecting();
      }
    });

    function handleResize() {
      fitAddon.fit();
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'resize',
          data: { cols: terminal.cols, rows: terminal.rows }
        }));
      }
    }

    window.nativeFit = function() {
      try { handleResize(); } catch(e) {}
    }

    window.addEventListener('resize', handleResize);

    window.addEventListener('orientationchange', function() {
      setTimeout(handleResize, 100);
    });

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
    }, [
      hostConfig,
      screenDimensions,
      config.fontSize,
      onBackgroundColorChange,
    ]);

    useEffect(() => {
      setHtmlContent(generateHTML());
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handlePostConnectionSetup = useCallback(async () => {
      const terminalConfig: Partial<TerminalConfig> = {
        ...MOBILE_DEFAULT_TERMINAL_CONFIG,
        ...config,
        ...hostConfig.terminalConfig,
      };

      setTimeout(async () => {
        if (terminalConfig.environmentVariables?.length) {
          terminalConfig.environmentVariables.forEach((envVar, index) => {
            setTimeout(
              () => {
                const key = envVar.key;
                const value = envVar.value;
                wsManagerRef.current?.sendInput(`export ${key}="${value}"\n`);
              },
              100 * (index + 1),
            );
          });
        }

        if (terminalConfig.startupSnippetId) {
          const snippetDelay =
            100 * (terminalConfig.environmentVariables?.length || 0) + 200;
          setTimeout(async () => {
            try {
              const snippets = await getSnippets();
              const snippet = snippets.find(
                (s: any) => s.id === terminalConfig.startupSnippetId,
              );
              if (snippet) {
                wsManagerRef.current?.sendInput(`${snippet.content}\n`);
              }
            } catch (err) {
              console.warn("Failed to execute startup snippet:", err);
            }
          }, snippetDelay);
        }

        if (terminalConfig.autoMosh && terminalConfig.moshCommand) {
          const moshDelay =
            100 * (terminalConfig.environmentVariables?.length || 0) +
            (terminalConfig.startupSnippetId ? 400 : 200);
          setTimeout(() => {
            wsManagerRef.current?.sendInput(`${terminalConfig.moshCommand!}\n`);
          }, moshDelay);
        }
      }, 500);
    }, [config, hostConfig.terminalConfig]);

    const handleTotpSubmit = useCallback(
      (code: string) => {
        wsManagerRef.current?.sendTotpResponse(code, isPasswordPrompt);
        setTotpRequired(false);
        setTotpPrompt("");
        setIsPasswordPrompt(false);
        setConnectionState("connecting");
      },
      [isPasswordPrompt],
    );

    const handleAuthDialogSubmit = useCallback(
      (credentials: {
        password?: string;
        sshKey?: string;
        keyPassword?: string;
      }) => {
        wsManagerRef.current?.sendReconnectWithCredentials(
          credentials,
          terminalColsRef.current,
          terminalRowsRef.current,
        );
        setShowAuthDialog(false);
        setConnectionState("connecting");
      },
      [],
    );

    const handleWebViewMessage = useCallback((event: any) => {
      try {
        const message = JSON.parse(event.nativeEvent.data);

        switch (message.type) {
          case "terminalReady":
            terminalColsRef.current = message.data.cols;
            terminalRowsRef.current = message.data.rows;
            wsManagerRef.current?.connect(message.data.cols, message.data.rows);
            break;

          case "resize":
            terminalColsRef.current = message.data.cols;
            terminalRowsRef.current = message.data.rows;
            wsManagerRef.current?.sendResize(
              message.data.cols,
              message.data.rows,
            );
            break;

          case "selectionStart":
            setIsSelecting(true);
            break;

          case "selectionEnd":
            setIsSelecting(false);
            break;
        }
      } catch (error) {
        console.error("[Terminal] Error parsing WebView message:", error);
      }
    }, []);

    useEffect(() => {
      wsManagerRef.current?.destroy();

      wsManagerRef.current = new NativeWebSocketManager({
        hostConfig: hostConfig as TerminalHostConfig,
        onStateChange: (state, data) => {
          switch (state) {
            case "connecting":
              setConnectionState(
                (data?.retryCount as number) > 0
                  ? "reconnecting"
                  : "connecting",
              );
              setRetryCount((data?.retryCount as number) || 0);
              break;
            case "connected": {
              const fromBackground = data?.fromBackground as boolean;
              const isReattach = data?.isReattach as boolean;
              setConnectionState("connected");
              setRetryCount(0);
              if (!fromBackground && !isReattach) {
                setHasReceivedData(false);
              }
              if (!isReattach) {
                webViewRef.current?.injectJavaScript(
                  `window.notifyConnected(${fromBackground}); true;`,
                );
              }
              logActivity("terminal", hostConfig.id, hostConfig.name).catch(
                () => {},
              );
              break;
            }
            case "dataReceived":
              setHasReceivedData(true);
              break;
          }
        },
        onData: (data) => {
          pendingDataRef.current.push(data);
          if (!dataFlushTimerRef.current) {
            dataFlushTimerRef.current = setTimeout(() => {
              dataFlushTimerRef.current = null;
              const batch = pendingDataRef.current.join("");
              pendingDataRef.current = [];
              webViewRef.current?.injectJavaScript(
                `window.writeToTerminal(${JSON.stringify(batch)}); true;`,
              );
            }, 16);
          }
          if (isScreenReaderEnabledRef.current) {
            writeToAccessibility(data);
          }
        },
        onTotpRequired: (prompt, isPassword) => {
          setTotpPrompt(prompt);
          setIsPasswordPrompt(isPassword);
          setTotpRequired(true);
        },
        onAuthDialogNeeded: (reason) => {
          setAuthDialogReason(reason);
          setShowAuthDialog(true);
          setConnectionState("disconnected");
        },
        onHostKeyVerificationRequired: (scenario, data) => {
          setHostKeyVerification({ scenario, data });
        },
        onPostConnectionSetup: () => handlePostConnectionSetup(),
        onDisconnected: (hostName) => {
          setConnectionState("disconnected");
          showToast.warning(`Disconnected from ${hostName}`);
          if (onClose) onClose();
        },
        onConnectionFailed: (message) => handleConnectionFailure(message),
      });

      setWebViewKey((prev) => prev + 1);
      setConnectionState("connecting");
      setHasReceivedData(false);
      setRetryCount(0);

      const html = generateHTML();
      setHtmlContent(html);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hostConfig.id]);

    useEffect(() => {
      return () => {
        wsManagerRef.current?.destroy();
        wsManagerRef.current = null;
        if (dataFlushTimerRef.current) {
          clearTimeout(dataFlushTimerRef.current);
          dataFlushTimerRef.current = null;
        }
        if (accessibilityTimerRef.current) {
          clearTimeout(accessibilityTimerRef.current);
          accessibilityTimerRef.current = null;
        }
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        sendInput: (data: string) => {
          wsManagerRef.current?.sendInput(data);
        },
        fit: () => {
          try {
            webViewRef.current?.injectJavaScript(
              `window.nativeFit && window.nativeFit(); true;`,
            );
          } catch (e) {}
        },
        isDialogOpen: () => {
          return totpRequired || showAuthDialog || hostKeyVerification !== null;
        },
        notifyBackgrounded: () => {
          wsManagerRef.current?.notifyBackgrounded();
        },
        notifyForegrounded: () => {
          wsManagerRef.current?.notifyForegrounded();
        },
        scrollToBottom: () => {
          try {
            webViewRef.current?.injectJavaScript(
              `window.resetScroll && window.resetScroll(); true;`,
            );
          } catch (e) {}
        },
        isSelecting: () => {
          return isSelecting;
        },
      }),
      [totpRequired, showAuthDialog, hostKeyVerification, isSelecting],
    );

    return (
      <View
        style={{
          flex: isVisible ? 1 : 0,
          width: "100%",
          height: "100%",
          position: isVisible ? "relative" : "absolute",
          top: isVisible ? 0 : 0,
          left: isVisible ? 0 : 0,
          right: isVisible ? 0 : 0,
          bottom: isVisible ? 0 : 0,
          backgroundColor: terminalBackgroundColor,
        }}
      >
        <View
          style={{
            flex: 1,
            width: "100%",
            height: "100%",
            opacity: isVisible ? 1 : 0,
            position: "relative",
            zIndex: isVisible ? 1 : -1,
            backgroundColor: terminalBackgroundColor,
          }}
        >
          <View
            style={{ flex: 1, backgroundColor: terminalBackgroundColor }}
            pointerEvents={
              totpRequired || showAuthDialog || hostKeyVerification !== null
                ? "none"
                : "auto"
            }
          >
            <WebView
              key={`terminal-${hostConfig.id}-${webViewKey}`}
              ref={webViewRef}
              source={{ html: htmlContent }}
              style={{
                flex: 1,
                width: "100%",
                height: "100%",
                backgroundColor: terminalBackgroundColor,
                opacity:
                  connectionState === "connected" && hasReceivedData ? 1 : 0,
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
              onScroll={(event) => {}}
              scrollEventThrottle={16}
              onMessage={handleWebViewMessage}
              onError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                handleConnectionFailure(
                  `WebView error: ${nativeEvent.description}`,
                );
              }}
              onHttpError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                handleConnectionFailure(
                  `WebView HTTP error: ${nativeEvent.statusCode}`,
                );
              }}
              scrollEnabled={true}
              overScrollMode="never"
              bounces={false}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled={false}
              textZoom={100}
              setSupportMultipleWindows={false}
            />
          </View>

          {(connectionState === "connecting" ||
            connectionState === "reconnecting") && (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: terminalBackgroundColor,
                padding: 20,
              }}
            >
              <View
                style={{
                  backgroundColor: BACKGROUNDS.CARD,
                  borderRadius: 12,
                  padding: 24,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: BORDER_COLORS.PRIMARY,
                  minWidth: 280,
                }}
              >
                <ActivityIndicator size="large" color="#22C55E" />
                <Text
                  style={{
                    color: "#ffffff",
                    fontSize: 18,
                    fontWeight: "600",
                    marginTop: 16,
                    textAlign: "center",
                  }}
                >
                  {connectionState === "reconnecting"
                    ? "Reconnecting..."
                    : "Connecting..."}
                </Text>
                <Text
                  style={{
                    color: "#9CA3AF",
                    fontSize: 14,
                    marginTop: 8,
                    textAlign: "center",
                  }}
                >
                  {hostConfig.name} • {hostConfig.ip}
                </Text>
                {retryCount > 0 && (
                  <View
                    style={{
                      backgroundColor: BACKGROUNDS.DARKER,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      marginTop: 12,
                      borderWidth: 1,
                      borderColor: BORDER_COLORS.PRIMARY,
                    }}
                  >
                    <Text
                      style={{
                        color: "#EF4444",
                        fontSize: 12,
                        fontWeight: "500",
                        textAlign: "center",
                      }}
                    >
                      Retry {retryCount}/5
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>

        {isScreenReaderEnabled && (
          <View
            accessible={true}
            accessibilityLabel={accessibilityText}
            accessibilityLiveRegion="polite"
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              opacity: 0,
              top: -1000,
              left: -1000,
            }}
          />
        )}

        <TOTPDialog
          visible={totpRequired}
          onSubmit={handleTotpSubmit}
          onCancel={() => {
            setTotpRequired(false);
            setTotpPrompt("");
            setIsPasswordPrompt(false);
            if (onClose) onClose();
          }}
          prompt={totpPrompt}
          isPasswordPrompt={isPasswordPrompt}
        />

        <SSHAuthDialog
          visible={showAuthDialog}
          onSubmit={handleAuthDialogSubmit}
          onCancel={() => {
            setShowAuthDialog(false);
            if (onClose) onClose();
          }}
          hostInfo={{
            name: hostConfig.name,
            ip: hostConfig.ip,
            port: hostConfig.port,
            username: hostConfig.username,
          }}
          reason={authDialogReason}
        />

        <HostKeyVerificationDialog
          visible={hostKeyVerification !== null}
          scenario={hostKeyVerification?.scenario ?? "new"}
          data={hostKeyVerification?.data ?? null}
          onAccept={() => {
            wsManagerRef.current?.sendHostKeyResponse("accept");
            setHostKeyVerification(null);
          }}
          onReject={() => {
            wsManagerRef.current?.sendHostKeyResponse("reject");
            setHostKeyVerification(null);
            if (onClose) onClose();
          }}
        />
      </View>
    );
  },
);

TerminalComponent.displayName = "Terminal";

export { TerminalComponent as Terminal };
export default TerminalComponent;
