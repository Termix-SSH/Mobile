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
  TouchableWithoutFeedback,
  Keyboard,
  TextInput,
} from "react-native";
import { WebView } from "react-native-webview";
import { getCurrentServerUrl, getCookie, logActivity, getSnippets } from "../../../main-axios";
import { showToast } from "../../../utils/toast";
import { useTerminalCustomization } from "../../../contexts/TerminalCustomizationContext";
import { BACKGROUNDS, BORDER_COLORS } from "../../../constants/designTokens";
import { TOTPDialog, SSHAuthDialog } from "@/app/tabs/dialogs";
import { TERMINAL_THEMES, TERMINAL_FONTS } from "@/constants/terminal-themes";
import { MOBILE_DEFAULT_TERMINAL_CONFIG } from "@/constants/terminal-config";
import type { TerminalConfig } from "@/types";

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
};

const TerminalComponent = forwardRef<TerminalHandle, TerminalProps>(
  ({ hostConfig, isVisible, title = "Terminal", onClose, onBackgroundColorChange }, ref) => {
    const webViewRef = useRef<WebView>(null);
    const { config } = useTerminalCustomization();
    const [webViewKey, setWebViewKey] = useState(0);
    const [screenDimensions, setScreenDimensions] = useState(
      Dimensions.get("window"),
    );
    const [isConnecting, setIsConnecting] = useState(true);
    const [isRetrying, setIsRetrying] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const [isConnected, setIsConnected] = useState(false);
    const [hasReceivedData, setHasReceivedData] = useState(false);
    const [showConnectingOverlay, setShowConnectingOverlay] = useState(true);
    const [htmlContent, setHtmlContent] = useState("");
    const [currentHostId, setCurrentHostId] = useState<number | null>(null);
    const [terminalBackgroundColor, setTerminalBackgroundColor] = useState("#09090b");
    const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

    // TOTP and Auth dialog state
    const [totpRequired, setTotpRequired] = useState(false);
    const [totpPrompt, setTotpPrompt] = useState("");
    const [isPasswordPrompt, setIsPasswordPrompt] = useState(false);
    const [showAuthDialog, setShowAuthDialog] = useState(false);
    const [authDialogReason, setAuthDialogReason] = useState<
      "no_keyboard" | "auth_failed" | "timeout"
    >("auth_failed");

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
        setIsConnecting(false);
        setIsConnected(false);
        if (onClose) {
          onClose();
        }
      },
      [onClose],
    );

    const getWebSocketUrl = async () => {
      const serverUrl = getCurrentServerUrl();

      if (!serverUrl) {
        showToast.error(
          "No server URL found - please configure a server first",
        );
        return null;
      }

      const jwtToken = await getCookie("jwt");
      if (!jwtToken || jwtToken.trim() === "") {
        showToast.error("Authentication required - please log in again");
        return null;
      }

      const wsProtocol = serverUrl.startsWith("https://") ? "wss://" : "ws://";
      const wsHost = serverUrl.replace(/^https?:\/\//, "");
      const cleanHost = wsHost.replace(/\/$/, "");
      const wsUrl = `${wsProtocol}${cleanHost}/ssh/websocket/?token=${encodeURIComponent(jwtToken)}`;

      return wsUrl;
    };

    const generateHTML = useCallback(async () => {
      const wsUrl = await getWebSocketUrl();
      const { width, height } = screenDimensions;

      if (!wsUrl) {
        return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Terminal</title>
</head>
<body style="background-color: #09090b; color: #f7f7f7; font-family: monospace; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
  <div style="text-align: center;">
    <h2>No Server Configured</h2>
    <p>Please configure a server first</p>
  </div>
</body>
</html>`;
      }

      // Merge terminal config (host config > global config > defaults)
      const terminalConfig: Partial<TerminalConfig> = {
        ...MOBILE_DEFAULT_TERMINAL_CONFIG,
        ...config,
        ...hostConfig.terminalConfig,
      };

      // Use user's custom fontSize from context, not from API
      const baseFontSize = config.fontSize || 16;
      const charWidth = baseFontSize * 0.6;
      const lineHeight = baseFontSize * 1.2;
      const terminalWidth = Math.floor(width / charWidth);
      const terminalHeight = Math.floor(height / lineHeight);

      // Get theme colors
      const themeName = terminalConfig.theme || "termix";
      const themeColors = TERMINAL_THEMES[themeName]?.colors || TERMINAL_THEMES.termix.colors;

      // Update background color state and notify parent
      const bgColor = themeColors.background;
      setTerminalBackgroundColor(bgColor);
      if (onBackgroundColorChange) {
        onBackgroundColorChange(bgColor);
      }

      // Get font family
      const fontConfig = TERMINAL_FONTS.find(
        (f) => f.value === terminalConfig.fontFamily
      );
      const fontFamily =
        fontConfig?.fallback || TERMINAL_FONTS[0].fallback;

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
    @font-face {
      font-family: 'Caskaydia Cove Nerd Font Mono';
      src: url('https://cdn.jsdelivr.net/gh/ryanoasis/nerd-fonts@master/patched-fonts/CascadiaCode/Regular/CaskaydiaCoveNerdFontMono-Regular.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: 'Caskaydia Cove Nerd Font Mono';
      src: url('https://cdn.jsdelivr.net/gh/ryanoasis/nerd-fonts@master/patched-fonts/CascadiaCode/Bold/CaskaydiaCoveNerdFontMono-Bold.ttf') format('truetype');
      font-weight: bold;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: 'Caskaydia Cove Nerd Font Mono';
      src: url('https://cdn.jsdelivr.net/gh/ryanoasis/nerd-fonts@master/patched-fonts/CascadiaCode/Italic/CaskaydiaCoveNerdFontMono-Italic.ttf') format('truetype');
      font-weight: normal;
      font-style: italic;
      font-display: swap;
    }

    @font-face {
      font-family: 'Caskaydia Cove Nerd Font Mono';
      src: url('https://cdn.jsdelivr.net/gh/ryanoasis/nerd-fonts@master/patched-fonts/CascadiaCode/BoldItalic/CaskaydiaCoveNerdFontMono-BoldItalic.ttf') format('truetype');
      font-weight: bold;
      font-style: italic;
      font-display: swap;
    }

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
    /* Disable text selection and callouts to avoid native dialogues */
    * {
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
    }
    html, body, #terminal, .xterm, .xterm * {
      user-select: none;
      -webkit-user-select: none;
      -ms-user-select: none;
      -moz-user-select: none;
    }

    /* Prevent all input elements from being focusable but keep them in DOM */
    input, textarea, [contenteditable], .xterm-helper-textarea {
      position: absolute !important;
      left: -9999px !important;
      width: 1px !important;
      height: 1px !important;
      opacity: 0 !important;
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
    
    const hostConfig = ${JSON.stringify(hostConfig)};
    const wsUrl = '${wsUrl}';

    let ws = null;
    window.ws = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;
    let reconnectTimeout = null;
    let connectionTimeout = null;
    let shouldNotReconnect = false;
    let hasNotifiedFailure = false;

    function notifyConnectionState(state, data = {}) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: state,
          data: data
        }));
      }
    }

    function notifyFailureOnce(message) {
      if (hasNotifiedFailure) return;
      hasNotifiedFailure = true;
      notifyConnectionState('connectionFailed', { hostName: hostConfig.name, message });
    }

    function isUnrecoverableError(message) {
      if (!message) return false;
      const m = String(message).toLowerCase();
      return m.includes('password') || m.includes('authentication') || m.includes('permission denied') || m.includes('invalid') || m.includes('incorrect') || m.includes('denied');
    }

    function scheduleReconnect() {
      if (shouldNotReconnect) return;
      if (reconnectAttempts >= maxReconnectAttempts) {
        notifyFailureOnce('Maximum reconnection attempts reached');
        return;
      }
      reconnectAttempts += 1;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 5000);
      notifyConnectionState('connecting', { retryCount: reconnectAttempts });
      reconnectTimeout = setTimeout(() => {
        connectWebSocket();
      }, delay);
    }
    
    window.nativeInput = function(data) {
      try {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data: data }));
        } else {
          terminal.write(data);
        }
      } catch (e) {}
    }

    const terminalElement = document.getElementById('terminal');

    document.addEventListener('focusin', function(e) {
      if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) {
        e.preventDefault();
        e.stopPropagation();
        setTimeout(function() {
          if (e.target && e.target.blur) {
            e.target.blur();
          }
        }, 0);
      }
    }, true);

    terminalElement.addEventListener('contextmenu', function(e){
      e.preventDefault();
      e.stopPropagation();
      return false;
    }, { passive: false });

    function connectWebSocket() {
      try {
        if (!wsUrl) {
          notifyFailureOnce('No WebSocket URL available - server not configured');
          return;
        }
        
        notifyConnectionState('connecting', { retryCount: reconnectAttempts });

        ws = new WebSocket(wsUrl);
        window.ws = ws;

        connectionTimeout = setTimeout(() => {
          if (ws && ws.readyState === WebSocket.CONNECTING) {
            try { ws.close(); } catch (_) {}
            if (!shouldNotReconnect) {
              scheduleReconnect();
            } else {
              notifyFailureOnce('Connection timeout - server not responding');
            }
          }
        }, 30000);
        
        ws.onopen = function() {
          clearTimeout(connectionTimeout);
          notifyConnectionState('connected', { hostName: hostConfig.name });
          hasNotifiedFailure = false;
          reconnectAttempts = 0;

          terminal.clear();
          terminal.reset();
          terminal.write('\x1b[2J\x1b[H');

          const connectMessage = {
            type: 'connectToHost',
            data: {
              cols: terminal.cols,
              rows: terminal.rows,
              hostConfig: hostConfig
            }
          };

          ws.send(JSON.stringify(connectMessage));

          startPingInterval();
        };
        
        ws.onmessage = function(event) {
          try {
            const msg = JSON.parse(event.data);

            if (msg.type === 'data') {
              terminal.write(msg.data);
              notifyConnectionState('dataReceived', { hostName: hostConfig.name });
            } else if (msg.type === 'totp_required') {
              notifyConnectionState('totpRequired', {
                prompt: msg.prompt || 'Verification code:',
                isPassword: false
              });
            } else if (msg.type === 'password_required') {
              notifyConnectionState('totpRequired', {
                prompt: msg.prompt || 'Password:',
                isPassword: true
              });
            } else if (msg.type === 'keyboard_interactive_available') {
              notifyConnectionState('authDialogNeeded', {
                reason: 'no_keyboard'
              });
            } else if (msg.type === 'auth_method_not_available') {
              notifyConnectionState('authDialogNeeded', {
                reason: 'no_keyboard'
              });
            } else if (msg.type === 'error') {
              const message = msg.message || 'Unknown error';
              if (isUnrecoverableError(message)) {
                shouldNotReconnect = true;
                notifyFailureOnce('Authentication failed: ' + message);
                try { ws && ws.close(1000); } catch (_) {}
                return;
              }
            } else if (msg.type === 'connected') {
              // Post-connection setup: inject env vars and startup snippet
              notifyConnectionState('setupPostConnection', {});
            } else if (msg.type === 'disconnected') {
              notifyConnectionState('disconnected', { hostName: hostConfig.name });
            } else if (msg.type === 'pong') {
            }
          } catch (error) {
            terminal.write(event.data);
          }
        };
        
        ws.onclose = function(event) {
          clearTimeout(connectionTimeout);
          stopPingInterval();
          
          if (shouldNotReconnect) {
            notifyFailureOnce('Connection closed');
            return;
          }
          if (event.code === 1000 || event.code === 1001) {
            notifyFailureOnce('Connection closed');
            return;
          }
          scheduleReconnect();
        };
        
        ws.onerror = function(error) {
          clearTimeout(connectionTimeout);
        };
        
      } catch (error) {
        clearTimeout(connectionTimeout);
        notifyFailureOnce('Failed to create WebSocket connection: ' + error.message);
      }
    }
    
    let pingInterval = null;
    
    function startPingInterval() {
      stopPingInterval();
      pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 15000);
    }
    
    function stopPingInterval() {
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
    }
    
    function handleResize() {
      fitAddon.fit();
      
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'resize',
          data: { cols: terminal.cols, rows: terminal.rows }
        }));
      }
    }

    window.nativeFit = function() {
      try {
        fitAddon.fit();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', data: { cols: terminal.cols, rows: terminal.rows } }));
        }
      } catch (e) {}
    }
    
    window.addEventListener('resize', handleResize);
    
    window.addEventListener('orientationchange', function() {
      setTimeout(handleResize, 100);
    });
    
    terminal.clear();
    terminal.reset();
    terminal.write('\x1b[2J\x1b[H');
    
    connectWebSocket();
    
    window.addEventListener('beforeunload', function() {
      stopPingInterval();
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
      }
      if (ws) {
        ws.close();
      }
      window.ws = null;
    });
  </script>
</body>
</html>
    `;
    }, [hostConfig, screenDimensions, config.fontSize]);

    useEffect(() => {
      const updateHtml = async () => {
        const html = await generateHTML();
        setHtmlContent(html);
      };
      updateHtml();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleTotpSubmit = useCallback((code: string) => {
      webViewRef.current?.injectJavaScript(`
        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
          window.ws.send(JSON.stringify({
            type: '${isPasswordPrompt ? "password_response" : "totp_response"}',
            data: { code: '${code.replace(/'/g, "\\'")}' }
          }));
        }
        true;
      `);
      setTotpRequired(false);
      setTotpPrompt("");
      setIsPasswordPrompt(false);
    }, [isPasswordPrompt]);

    const handleAuthDialogSubmit = useCallback((credentials: {
      password?: string;
      sshKey?: string;
      keyPassword?: string;
    }) => {
      const password = credentials.password?.replace(/'/g, "\\'") || "";
      const sshKey = credentials.sshKey?.replace(/'/g, "\\'") || "";
      const keyPassword = credentials.keyPassword?.replace(/'/g, "\\'") || "";

      webViewRef.current?.injectJavaScript(`
        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
          window.ws.send(JSON.stringify({
            type: 'reconnect_with_credentials',
            data: {
              password: ${credentials.password ? `'${password}'` : "undefined"},
              sshKey: ${credentials.sshKey ? `'${sshKey}'` : "undefined"},
              keyPassword: ${credentials.keyPassword ? `'${keyPassword}'` : "undefined"}
            }
          }));
        }
        true;
      `);
      setShowAuthDialog(false);
      setIsConnecting(true);
    }, []);

    const handlePostConnectionSetup = useCallback(async () => {
      const terminalConfig: Partial<TerminalConfig> = {
        ...MOBILE_DEFAULT_TERMINAL_CONFIG,
        ...config,
        ...hostConfig.terminalConfig,
      };

      // Wait for terminal to be ready
      setTimeout(async () => {
        // Inject environment variables
        if (terminalConfig.environmentVariables?.length) {
          terminalConfig.environmentVariables.forEach((envVar, index) => {
            setTimeout(() => {
              const key = envVar.key.replace(/'/g, "\\'");
              const value = envVar.value.replace(/'/g, "\\'");
              webViewRef.current?.injectJavaScript(`
                if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                  window.ws.send(JSON.stringify({
                    type: 'input',
                    data: 'export ${key}="${value}"\\n'
                  }));
                }
                true;
              `);
            }, 100 * (index + 1));
          });
        }

        // Execute startup snippet
        if (terminalConfig.startupSnippetId) {
          const snippetDelay = 100 * (terminalConfig.environmentVariables?.length || 0) + 200;
          setTimeout(async () => {
            try {
              const snippets = await getSnippets();
              const snippet = snippets.find(s => s.id === terminalConfig.startupSnippetId);
              if (snippet) {
                const content = snippet.content.replace(/'/g, "\\'");
                webViewRef.current?.injectJavaScript(`
                  if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                    window.ws.send(JSON.stringify({
                      type: 'input',
                      data: '${content}\\n'
                    }));
                  }
                  true;
                `);
              }
            } catch (err) {
              console.warn("Failed to execute startup snippet:", err);
            }
          }, snippetDelay);
        }
      }, 500);
    }, [config, hostConfig.terminalConfig]);

    const handleWebViewMessage = useCallback(
      (event: any) => {
        try {
          const message = JSON.parse(event.nativeEvent.data);

          switch (message.type) {
            case "connecting":
              if (message.data.retryCount > 0) {
                setIsRetrying(true);
                setIsConnecting(false);
              } else {
                setIsConnecting(true);
                setIsRetrying(false);
              }
              setRetryCount(message.data.retryCount);
              setShowConnectingOverlay(true);
              break;

            case "connected":
              setIsConnecting(false);
              setIsRetrying(false);
              setIsConnected(true);
              setRetryCount(0);

              logActivity("terminal", hostConfig.id, hostConfig.name).catch(
                () => {},
              );
              break;

            case "totpRequired":
              setTotpPrompt(message.data.prompt);
              setIsPasswordPrompt(message.data.isPassword);
              setTotpRequired(true);
              break;

            case "authDialogNeeded":
              setAuthDialogReason(message.data.reason);
              setShowAuthDialog(true);
              setIsConnecting(false);
              break;

            case "setupPostConnection":
              handlePostConnectionSetup();
              break;

            case "dataReceived":
              setHasReceivedData(true);
              setShowConnectingOverlay(false);
              break;

            case "disconnected":
              setIsConnecting(false);
              setIsRetrying(false);
              setIsConnected(false);
              showToast.warning(`Disconnected from ${message.data.hostName}`);
              if (onClose) {
                onClose();
              }
              break;

            case "connectionFailed":
              setIsConnecting(false);
              setIsRetrying(false);
              handleConnectionFailure(
                `${message.data.hostName}: ${message.data.message}`,
              );
              break;
          }
        } catch (error) {}
      },
      [handleConnectionFailure, onClose, hostConfig.id, handlePostConnectionSetup],
    );

    useImperativeHandle(
      ref,
      () => ({
        sendInput: (data: string) => {
          try {
            const escaped = JSON.stringify(data);
            webViewRef.current?.injectJavaScript(
              `window.nativeInput(${escaped}); true;`,
            );
          } catch (e) {}
        },
        fit: () => {
          try {
            webViewRef.current?.injectJavaScript(
              `window.nativeFit && window.nativeFit(); true;`,
            );
          } catch (e) {}
        },
      }),
      [],
    );

    useEffect(() => {
      if (hostConfig.id !== currentHostId) {
        setCurrentHostId(hostConfig.id);
        setWebViewKey((prev) => prev + 1);
        setIsConnecting(true);
        setIsRetrying(false);
        setIsConnected(false);
        setHasReceivedData(false);
        setShowConnectingOverlay(true);
        setRetryCount(0);

        const updateHtml = async () => {
          const html = await generateHTML();
          setHtmlContent(html);
        };
        updateHtml();
      }
    }, [hostConfig.id, currentHostId]);

    useEffect(() => {
      return () => {
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
        }
      };
    }, []);

    const focusTerminal = useCallback(() => {}, []);

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
          <View style={{ flex: 1, backgroundColor: terminalBackgroundColor }}>
            {/* Note: Hidden TextInput removed - keyboard handled by Sessions.tsx */}
            <WebView
              key={`terminal-${hostConfig.id}-${webViewKey}`}
              ref={webViewRef}
              source={{ html: htmlContent }}
              style={{
                flex: 1,
                width: "100%",
                height: "100%",
                backgroundColor: terminalBackgroundColor,
                opacity: showConnectingOverlay || isRetrying ? 0 : 1,
              }}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              startInLoadingState={false}
              scalesPageToFit={false}
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
              keyboardDisplayRequiresUserAction={false}
              hideKeyboardAccessoryView={true}
              onScroll={() => {}}
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
              bounces={false}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled={false}
            />
          </View>

          {(showConnectingOverlay || isRetrying) && (
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
                  {isRetrying ? "Reconnecting..." : "Connecting..."}
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
                      Retry {retryCount}/3
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>

        {/* TOTP Dialog */}
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

        {/* SSH Auth Dialog */}
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
      </View>
    );
  },
);

TerminalComponent.displayName = "Terminal";

export { TerminalComponent as Terminal };
export default TerminalComponent;
