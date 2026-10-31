import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from "react-native";
import Constants from "expo-constants";
import { showToast } from "@/utils/toast";
import { useTerminalCustomization } from "@/contexts/TerminalCustomizationContext";
import { MOBILE_DEFAULT_TERMINAL_CONFIG } from "@/constants/terminal-config";
import type { SSHHost, TerminalConfig } from "@/types";
import type {
  StickyModifierState,
  SessionTabStatus,
  TerminalInputHandle,
  TerminalKeyTarget,
} from "@/core/features/types";
import type {
  ConnectionOrigin,
  ShellProtocol,
  HostConnection,
  TerminalHostConfig,
  TransportKind,
} from "@/core/transport";
import { ConnectionLog } from "@/screens/sessions/shared/useConnectionLog";
import { useHostConnection } from "@/screens/sessions/shared/useHostConnection";
import { ConnectionPrompts } from "@/screens/sessions/shared/ConnectionPrompts";
import { ConnectionError } from "@/screens/sessions/shared/ConnectionError";
import { useTheme, useUiColors } from "@/contexts/ThemeContext";
import { useClient } from "@/core/accounts";
import { useSessionAccountId } from "@/core/accounts/session";
import { useSessionRepositories } from "@/core/data/hooks";
import { formatConnectionLog } from "@/core/sessions/log";
import { sessionLifecycle } from "@/core/sessions/lifecycle";
import { onAppLocked } from "@/core/lock";
import { statusFromConnection } from "@/core/sessions/status";
import { ConnectionBanner } from "./ConnectionBanner";
import { ConnectionLogSheet } from "./ConnectionLogSheet";
import {
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  resolveTerminalSettings,
} from "./settings";
import { TERMINAL_SHORTCUTS, nextFontSize } from "./shortcuts";
import {
  findStartupSnippet,
  startupLines,
  type StartupInput,
  type StartupLine,
} from "./startup";
import { CommandLineTracker } from "./history/capture";
import { SuggestionStrip } from "./history/SuggestionStrip";
import { SearchBar } from "./SearchBar";
import {
  attachLine,
  listSessionsCommand,
  listWindowsCommand,
  newSessionName,
  parseSessions,
  parseWindows,
  planTmuxAttach,
  selectWindowKeys,
  type TmuxWindow,
} from "./tmux/tmux";
import {
  findScreen,
  listScreensCommand,
  parseScreens,
  planScreen,
  screenAttachLine,
} from "./tmux/screen";
import {
  TmuxPickerSheet,
  TmuxWindowsSheet,
  type PickSession,
} from "./tmux/TmuxSheets";
import { controlCode } from "./keys/dispatch";
import { useKeyLayout } from "./keys/useKeyLayout";
import type { TerminalSearchResult } from "@/modules/termix-terminal";
import { PromptWatcher, pickPassword } from "./password-prompt";
import { PasswordFillSheet, type FillChoice } from "./PasswordFillSheet";
import { PASSWORD_FILL_PREF, hostCanFill } from "./password-fill";
import {
  TerminalView,
  type ModifierState,
  type TerminalViewApi,
} from "./TerminalView";
import {
  XtermTerminalView,
  type XtermTerminalApi,
} from "./xterm/XtermTerminalView";
import { XTERM_FALLBACK } from "./fallback";

interface TerminalProps {
  host: SSHHost;
  hostConfig: TerminalHostConfig & { terminalConfig?: Partial<TerminalConfig> };
  /** Session tab type, for what it needs from the transport. */
  type: string;
  /** Overrides the host's saved origin for this tab. */
  origin?: ConnectionOrigin;
  /** Telnet instead of SSH. */
  protocol?: ShellProtocol;
  isVisible: boolean;
  title?: string;
  onClose?: () => void;
  onBackgroundColorChange?: (color: string) => void;
  /** Stable tab instance id (cross-device session tracking). */
  tabInstanceId?: string;
  /** Backend session id to attach to on first connect (reviving a tab). */
  initialSessionId?: string | null;
  /** Fired when the backend session id is created/attached/cleared. */
  onSessionIdChange?: (sessionId: string | null) => void;
  onTransportResolved?: (kind: TransportKind) => void;
  onTitle?: (title: string | null) => void;
  onMenu?: () => void;
  onShortcut?: (id: string) => void;
  /** Brought back after the app was closed: connects when first shown. */
  restored?: boolean;
  /** Saved tmux or screen session to reattach to. */
  resumeData?: Record<string, string> | null;
  onStatus?: (status: SessionTabStatus) => void;
  onResumeData?: (data: Record<string, string> | null) => void;
}

export type TerminalHandle = TerminalInputHandle;

// Native pipes outlive a JS reload, so ids carry a per runtime prefix.
const PIPE_RUN = Math.random().toString(36).slice(2, 8);
let pipeSeq = 0;

const TerminalComponent = forwardRef<TerminalHandle, TerminalProps>(
  (
    {
      host,
      hostConfig,
      type,
      origin,
      protocol,
      isVisible,
      onClose,
      onBackgroundColorChange,
      tabInstanceId,
      initialSessionId,
      onSessionIdChange,
      onTransportResolved,
      onTitle,
      onMenu,
      onShortcut,
      restored,
      resumeData,
      onStatus,
      onResumeData,
    },
    ref,
  ) => {
    // Null on This device, where the phone connects on its own.
    const client = useClient(useSessionAccountId());
    const repos = useSessionRepositories();
    const ui = useUiColors();
    const { resolvedTheme } = useTheme();
    const { fontScale } = useWindowDimensions();
    const { config, updateFontSize } = useTerminalCustomization();
    const nativeRef = useRef<TerminalViewApi>(null);
    const xtermRef = useRef<XtermTerminalApi>(null);
    const connRef = useRef<HostConnection | null>(null);
    const sizeRef = useRef<{ cols: number; rows: number } | null>(null);
    const connectedOnce = useRef(false);
    const transportRef = useRef<TransportKind | null>(null);

    const settings = useMemo(
      () =>
        resolveTerminalSettings(
          { ...MOBILE_DEFAULT_TERMINAL_CONFIG, ...config },
          hostConfig.terminalConfig,
          resolvedTheme,
          fontScale,
        ),
      [config, hostConfig.terminalConfig, resolvedTheme, fontScale],
    );

    // The terminal keeps its own keyboard, so the app lock has to ask it to let go.
    useEffect(() => onAppLocked(() => nativeRef.current?.blur()), []);

    useEffect(() => {
      onBackgroundColorChange?.(settings.colors.background);
    }, [settings.colors.background, onBackgroundColorChange]);

    const useShellTitle = hostConfig.terminalConfig?.useSSHTitle === true;
    useEffect(() => {
      if (!useShellTitle) onTitle?.(null);
    }, [useShellTitle, onTitle]);
    const historyOn = hostConfig.terminalConfig?.enableCommandHistory !== false;
    const hostRef = useRef(host);
    hostRef.current = host;
    const historyOnRef = useRef(historyOn);
    historyOnRef.current = historyOn;
    const [tracker] = useState(
      () =>
        new CommandLineTracker({
          onSubmit: (line, save) => {
            const h = hostRef.current;
            if (!save || !historyOnRef.current || !(h.id > 0)) return;
            repos.commandHistory.add(h, line).catch(() => {});
          },
          isPasswordInput: () =>
            watcherRef.current?.atPasswordPrompt() ?? false,
        }),
    );

    // Password and sudo prompts: offer the saved password, asking first.
    const watcherRef = useRef<PromptWatcher | null>(null);
    const [fillAsk, setFillAsk] = useState<{ sudo: boolean } | null>(null);
    const fillOn = hostConfig.terminalConfig?.passwordPromptAutoFill !== false;
    const fillOnRef = useRef(fillOn);
    fillOnRef.current = fillOn;
    const fill = useCallback(
      async (sudo: boolean) => {
        const h = hostRef.current;
        const full = await repos.hosts.get(h.id).catch(() => null);
        const password = pickPassword(sudo, {
          password: full?.password ?? h.password,
          sudoPassword: full?.sudoPassword ?? h.sudoPassword,
        });
        if (!password) {
          watcherRef.current?.settle(false);
          showToast.warning("No saved password for this host");
          return;
        }
        // Straight to the host, so it never reaches history.
        connRef.current?.sendInput(`${password}\r`);
        watcherRef.current?.settle(true);
      },
      [repos],
    );
    const fillRef = useRef(fill);
    fillRef.current = fill;
    if (!watcherRef.current) {
      watcherRef.current = new PromptWatcher({
        settings: () => ({
          passwordPromptAutoFill: fillOnRef.current,
          sudoPasswordAutoFill:
            hostRef.current.terminalConfig?.sudoPasswordAutoFill === true,
        }),
        canFill: () => hostCanFill(hostRef.current),
        lastCommand: () => tracker.lastSubmitted(),
        offer: (sudo) => {
          repos.hostPrefs
            .get(hostRef.current, PASSWORD_FILL_PREF)
            .catch(() => null)
            .then((pref) => {
              if (pref === "always") void fillRef.current(sudo);
              else setFillAsk({ sudo });
            });
        },
      });
    }
    const onFillChoice = useCallback(
      (choice: FillChoice) => {
        const ask = fillAsk;
        setFillAsk(null);
        if (!ask) return;
        if (choice === "no") {
          watcherRef.current?.settle(false);
          return;
        }
        if (choice === "always") {
          repos.hostPrefs
            .set(hostRef.current, PASSWORD_FILL_PREF, "always")
            .catch(() => {});
        }
        void fill(ask.sudo);
      },
      [fillAsk, fill, repos],
    );
    const suggestionsOn = !!config.commandSuggestions && historyOn;
    const [history, setHistory] = useState<string[]>([]);
    useEffect(() => {
      if (!suggestionsOn || !(host.id > 0)) return;
      const load = () =>
        repos.commandHistory
          .list(host)
          .then(setHistory)
          .catch(() => {});
      load();
      return repos.commandHistory.subscribe(load);
    }, [suggestionsOn, host, repos]);

    const sendInput = useCallback(
      (data: string) => {
        tracker.track(data);
        connRef.current?.sendInput(data);
      },
      [tracker],
    );

    // Startup lines wait for the shell's first output, so they land at a prompt.
    // After a reconnect the new shell first tries to get back to tmux or screen.
    const startupPending = useRef<"fresh" | "resume" | null>(null);
    const handlePostConnectionSetup = useCallback(
      ({ resumed }: { resumed: boolean }) => {
        startupPending.current = resumed ? "resume" : "fresh";
      },
      [],
    );
    // tmux: sessions to pick from, and the one this tab attached to.
    const [tmuxPick, setTmuxPick] = useState<{
      sessions: PickSession[];
      relay: boolean;
    } | null>(null);
    const [tmuxWindows, setTmuxWindows] = useState<TmuxWindow[] | null>(null);
    const tmuxSessionRef = useRef<string | null>(resumeData?.tmux ?? null);
    const screenSessionRef = useRef<string | null>(resumeData?.screen ?? null);
    const startupBase = useRef<StartupInput | null>(null);
    const onResumeDataRef = useRef(onResumeData);
    onResumeDataRef.current = onResumeData;
    const rememberSession = useCallback(
      (kind: "tmux" | "screen" | null, name: string | null) => {
        tmuxSessionRef.current = kind === "tmux" ? name : null;
        screenSessionRef.current = kind === "screen" ? name : null;
        onResumeDataRef.current?.(kind && name ? { [kind]: name } : null);
      },
      [],
    );

    // Startup lines skip the typed input queue, which may wait on the user.
    const typeLines = useCallback((lines: StartupLine[]) => {
      let at = 0;
      for (const line of lines) {
        setTimeout(() => connRef.current?.sendNow(`${line.text}\r`), at);
        at += line.waitAfterMs ?? 100;
      }
    }, []);

    // A dim line written into the view only, never sent to the host.
    const writeNote = useCallback((text: string) => {
      const line = `\r\n\x1b[2m${text}\x1b[0m\r\n`;
      if (XTERM_FALLBACK) xtermRef.current?.write(line);
      else nativeRef.current?.write(line);
    }, []);

    const attachLocalTmux = useCallback(
      (name: string | null) => {
        const base = startupBase.current;
        if (!base) return;
        if (name === null) {
          typeLines(startupLines(base));
          return;
        }
        const fresh = name === "";
        const target = fresh
          ? newSessionName(String(hostRef.current.syncId ?? hostRef.current.id))
          : name;
        rememberSession("tmux", target);
        typeLines(
          startupLines({
            ...base,
            tmux: { line: attachLine(target, fresh), fresh },
          }),
        );
      },
      [typeLines, rememberSession],
    );

    /** No tmux on the host: GNU screen, when it has that. */
    const attachLocalScreen = useCallback(async (): Promise<boolean> => {
      const base = startupBase.current;
      if (!base) return false;
      const found = await connRef.current
        ?.exec(listScreensCommand(), 10)
        .catch(() => null);
      if (!found || found.exitCode === 127) return false;
      const plan = planScreen(
        parseScreens(found.stdout),
        newSessionName(String(hostRef.current.syncId ?? hostRef.current.id)),
      );
      rememberSession("screen", plan.target);
      typeLines(
        startupLines({
          ...base,
          tmux: {
            line: screenAttachLine(plan.target, plan.create),
            fresh: plan.create,
          },
        }),
      );
      return true;
    }, [typeLines, rememberSession]);

    const runStartup = useCallback(async () => {
      const terminalConfig: Partial<TerminalConfig> = {
        ...MOBILE_DEFAULT_TERMINAL_CONFIG,
        ...config,
        ...hostConfig.terminalConfig,
      };
      let snippet = null;
      if (terminalConfig.startupSnippetId != null) {
        snippet = findStartupSnippet(
          await repos.snippets.list().catch(() => []),
          terminalConfig.startupSnippetId,
        );
      }
      const base: StartupInput = {
        transport: transportRef.current,
        sshOptions: host.sshOptions,
        legacyEnv: terminalConfig.environmentVariables,
        snippet,
        host: {
          ip: hostConfig.ip,
          username: hostConfig.username,
          port: hostConfig.port,
          name: hostConfig.name,
        },
        mosh: terminalConfig.autoMosh ? terminalConfig.moshCommand : null,
      };
      startupBase.current = base;
      // A relay shell's tmux is the server's; a phone shell checks itself.
      if (terminalConfig.autoTmux && transportRef.current === "local") {
        const found = await connRef.current
          ?.exec(listSessionsCommand(), 10)
          .catch(() => null);
        if (found?.exitCode === 127) {
          if (await attachLocalScreen()) return;
          showToast.info("tmux is not installed on this host");
        } else if (found) {
          const sessions = parseSessions(found.stdout);
          const plan = planTmuxAttach(sessions.length);
          if (plan === "pick") {
            setTmuxPick({ sessions, relay: false });
            return;
          }
          attachLocalTmux(plan === "create" ? "" : sessions[0].name);
          return;
        }
      }
      typeLines(startupLines(base));
    }, [
      config,
      hostConfig,
      host.sshOptions,
      repos,
      attachLocalTmux,
      attachLocalScreen,
      typeLines,
    ]);

    // After a reconnect: back into the same tmux or screen session when it
    // is still there, else say the old shell is gone and start fresh.
    const connectedBefore = useRef(false);
    const restoredFirst = useRef(!!restored);
    const resumeShell = useCallback(async () => {
      const conn = connRef.current;
      if (!conn) return;
      const local = transportRef.current === "local";
      const tmuxName = tmuxSessionRef.current;
      const screenName = screenSessionRef.current;
      if (local && tmuxName) {
        const found = await conn
          .exec(listSessionsCommand(), 10)
          .catch(() => null);
        if (
          found?.exitCode === 0 &&
          parseSessions(found.stdout).some((x) => x.name === tmuxName)
        ) {
          conn.sendNow(`${attachLine(tmuxName, false)}\r`);
          writeNote(`Back in tmux session ${tmuxName}`);
          restoredFirst.current = false;
          setTimeout(() => connRef.current?.flushInput(), 800);
          return;
        }
      }
      if (local && screenName) {
        const found = await conn
          .exec(listScreensCommand(), 10)
          .catch(() => null);
        const match = found
          ? findScreen(parseScreens(found.stdout), screenName)
          : undefined;
        if (found?.exitCode === 0 && match) {
          conn.sendNow(`${screenAttachLine(match.id, false)}\r`);
          writeNote(`Back in screen session ${match.name}`);
          restoredFirst.current = false;
          setTimeout(() => connRef.current?.flushInput(), 800);
          return;
        }
      }
      writeNote(
        !local
          ? "The server session ended. This is a new shell."
          : restoredFirst.current
            ? "Termix was closed, so the old shell ended. This is a new shell."
            : "The connection dropped and the old shell ended. This is a new shell.",
      );
      restoredFirst.current = false;
      rememberSession(null, null);
      await runStartup();
    }, [writeNote, rememberSession, runStartup]);

    const onTmuxPick = useCallback(
      (name: string | null) => {
        const pick = tmuxPick;
        setTmuxPick(null);
        if (!pick) return;
        if (pick.relay) {
          if (name) tmuxSessionRef.current = name;
          connRef.current?.attachTmux(name ?? "");
        } else {
          attachLocalTmux(name);
        }
      },
      [tmuxPick, attachLocalTmux],
    );

    // One pipe for the tab's life: reconnects and new views attach to it again.
    const [pipeId] = useState(() => `term-${PIPE_RUN}-${++pipeSeq}`);

    const { conn, state, log, pending, pendingHeld, switchTo, switchOrigin } =
      useHostConnection(host, hostConfig, {
        type,
        origin,
        protocol,
        tabInstanceId,
        initialSessionId,
        restored,
        pipeId: XTERM_FALLBACK ? undefined : pipeId,
        onSessionIdChange,
        onTransportResolved: (kind) => {
          transportRef.current = kind;
          onTransportResolved?.(kind);
        },
        onConnected: ({ fromBackground, isReattach }) => {
          const firstTime = !connectedBefore.current;
          connectedBefore.current = true;
          // RelayShell clears before the server replays a reattached screen.
          if (XTERM_FALLBACK) {
            xtermRef.current?.notifyConnected(fromBackground, isReattach);
          }
          if (!firstTime) return;
          if (client) {
            client.api.homepage
              .logActivity("terminal", hostConfig.id, hostConfig.name)
              .catch(() => {});
          } else {
            repos.recentActivity
              .add({ kind: "terminal", title: hostConfig.name })
              .catch(() => {});
          }
        },
        onData: (data) => {
          watcherRef.current?.feed(data);
          if (XTERM_FALLBACK) xtermRef.current?.write(data);
          else nativeRef.current?.write(data);
        },
        onPostConnectionSetup: (info) => handlePostConnectionSetup(info),
        onTmuxSessions: (sessions) =>
          setTmuxPick({
            relay: true,
            sessions: sessions.map((s) => ({
              name: s.name,
              windows: s.windows,
              attached: s.attachedClients,
              activity: s.lastActivity,
            })),
          }),
        onDisconnected: (hostName) => {
          // The shell ended on purpose (exit, or the server ended it).
          showToast.warning(`Disconnected from ${hostName}`);
          onClose?.();
        },
      });
    connRef.current = conn;

    const onStatusRef = useRef(onStatus);
    onStatusRef.current = onStatus;
    useEffect(() => {
      onStatusRef.current?.(statusFromConnection(state));
    }, [state]);

    const isConnecting = state.status === "connecting";
    const isConnected = state.status === "connected";
    const hasReceivedData = isConnected && state.hasData;
    const isDialogOpen = state.status === "prompt";

    const runStartupRef = useRef(runStartup);
    runStartupRef.current = runStartup;
    const resumeShellRef = useRef(resumeShell);
    resumeShellRef.current = resumeShell;
    useEffect(() => {
      const kind = startupPending.current;
      if (!hasReceivedData || !kind) return;
      startupPending.current = null;
      const timer = setTimeout(
        () =>
          void (kind === "resume"
            ? resumeShellRef.current()
            : runStartupRef.current()),
        300,
      );
      return () => clearTimeout(timer);
    }, [hasReceivedData]);
    const failed = state.status === "failed" ? state : null;

    // Once the shell showed output, the view stays up through reconnects.
    const [everHadData, setEverHadData] = useState(false);
    useEffect(() => {
      if (hasReceivedData) setEverHadData(true);
    }, [hasReceivedData]);
    const showView = hasReceivedData || everHadData;

    const [logText, setLogText] = useState<string | null>(null);
    const openLog = useCallback(() => {
      const c = connRef.current;
      if (!c) return;
      const net = sessionLifecycle.network;
      setLogText(
        formatConnectionLog(c.getSnapshot().log, {
          appVersion: Constants.expoConfig?.version ?? "",
          platform: `${Platform.OS} ${Platform.Version}`,
          hostName: hostConfig.name || "host",
          transport: transportRef.current,
          state: c.state.status,
          network: net
            ? `${net.connected ? net.type : "offline"}${net.vpn ? " with VPN" : ""}`
            : null,
          lowPower: sessionLifecycle.isLowPower,
          redact: [
            { text: hostConfig.ip, as: "<address>" },
            { text: hostConfig.username, as: "<user>" },
          ],
        }),
      );
    }, [hostConfig.name, hostConfig.ip, hostConfig.username]);

    // A new connection gets a fresh terminal view.
    const [viewKey, setViewKey] = useState(0);
    const firstConn = useRef(true);
    useEffect(() => {
      if (firstConn.current) {
        firstConn.current = false;
        return;
      }
      connectedOnce.current = false;
      sizeRef.current = null;
      setEverHadData(false);
      connectedBefore.current = false;
      setViewKey((k) => k + 1);
    }, [conn]);

    // A restored tab that isn't shown waits, so a launch doesn't open them all at once.
    // Drop the keyboard so it never covers a prompt like the host key check.
    const prompting = state.status === "prompt";
    useEffect(() => {
      if (prompting && isVisible) nativeRef.current?.blur();
    }, [prompting, isVisible]);

    const deferConnect = useRef(!!restored && !isVisible);
    // A new surface reports a placeholder size first, then its real one a frame later.
    // The first connect waits for that, so the shell never starts at the wrong size.
    const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
      () => () => {
        if (connectTimer.current) clearTimeout(connectTimer.current);
      },
      [],
    );
    const handleResize = useCallback((cols: number, rows: number) => {
      sizeRef.current = { cols, rows };
      if (connectedOnce.current) {
        connRef.current?.resize(cols, rows);
        return;
      }
      if (deferConnect.current || connectTimer.current) return;
      connectTimer.current = setTimeout(() => {
        connectTimer.current = null;
        const size = sizeRef.current;
        if (!size || connectedOnce.current || deferConnect.current) return;
        connectedOnce.current = true;
        connRef.current?.connect(size.cols, size.rows);
      }, 50);
    }, []);
    useEffect(() => {
      if (!isVisible || !deferConnect.current) return;
      deferConnect.current = false;
      const size = sizeRef.current;
      if (size && !connectedOnce.current) {
        connectedOnce.current = true;
        connRef.current?.connect(size.cols, size.rows);
      }
    }, [isVisible]);

    const handleFontSize = useCallback(
      (size: number) => {
        // The view reports the drawn size; keep the base size the user picked.
        const base = Math.round((size / Math.max(1, fontScale)) * 2) / 2;
        if (base !== settings.fontSize) updateFontSize(base).catch(() => {});
      },
      [fontScale, settings.fontSize, updateFontSize],
    );

    // Find in the terminal, opened by a key row key, the menu or Ctrl+F.
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchResult, setSearchResult] = useState<TerminalSearchResult>({
      total: 0,
      index: -1,
    });
    const closeSearch = useCallback(() => {
      setSearchOpen(false);
      setSearchResult({ total: 0, index: -1 });
      nativeRef.current?.clearSearch();
    }, []);
    const { layout: keyLayout } = useKeyLayout(host);
    const tmuxPrefix = controlCode(keyLayout.tmuxPrefix || "b");
    const openTmuxWindows = useCallback(async () => {
      // Only a phone shell can list them; through the server, tmux's own chooser.
      if (transportRef.current !== "local") {
        connRef.current?.sendInput(`${tmuxPrefix}w`);
        return;
      }
      const found = await connRef.current
        ?.exec(listWindowsCommand(), 10)
        .catch(() => null);
      const all = parseWindows(found?.stdout ?? "");
      const session = tmuxSessionRef.current;
      const mine = session ? all.filter((w) => w.session === session) : all;
      if (mine.length === 0) {
        showToast.info("No tmux windows found");
        return;
      }
      setTmuxWindows(mine);
    }, [tmuxPrefix]);
    const runCommand = useCallback(
      (id: string) => {
        if (id === "tmux.windows") {
          void openTmuxWindows();
          return true;
        }
        if (id === "connection.log") {
          openLog();
          return true;
        }
        if (XTERM_FALLBACK) return false;
        if (id === "search") {
          setSearchOpen(true);
          return true;
        }
        return false;
      },
      [openTmuxWindows, openLog],
    );

    const handleShortcut = useCallback(
      (id: string) => {
        if (!TERMINAL_SHORTCUTS.has(id)) {
          onShortcut?.(id);
          return;
        }
        if (id === "find") {
          setSearchOpen(true);
          return;
        }
        const size = nextFontSize(settings.fontSize, id, {
          min: MIN_FONT_SIZE,
          max: MAX_FONT_SIZE,
          reset: MOBILE_DEFAULT_TERMINAL_CONFIG.fontSize ?? 14,
        });
        if (size !== settings.fontSize) updateFontSize(size).catch(() => {});
      },
      [onShortcut, settings.fontSize, updateFontSize],
    );

    const modifiersRef = useRef<ModifierState>({
      ctrl: "inactive",
      alt: "inactive",
    });
    const modifierListeners = useRef(new Set<() => void>());
    const handleModifiers = useCallback((next: ModifierState) => {
      modifiersRef.current = next;
      modifierListeners.current.forEach((l) => l());
    }, []);

    const keyTarget = useMemo<TerminalKeyTarget>(
      () => ({
        focus: () => {
          nativeRef.current?.focus();
        },
        blur: () => {
          nativeRef.current?.blur();
        },
        sendKey: (name, shift) =>
          nativeRef.current?.sendKey(name as never, shift),
        typeText: (text) => nativeRef.current?.typeText(text),
        paste: (text) => nativeRef.current?.paste(text),
        toggleModifier: (name) => nativeRef.current?.toggleModifier(name),
        modifiers: () =>
          modifiersRef.current as {
            ctrl: StickyModifierState;
            alt: StickyModifierState;
          },
        subscribeModifiers: (listener) => {
          modifierListeners.current.add(listener);
          return () => modifierListeners.current.delete(listener);
        },
      }),
      [],
    );

    useImperativeHandle(
      ref,
      () => ({
        sendInput,
        fit: () => {
          // The native view follows its own size.
          if (XTERM_FALLBACK) xtermRef.current?.fit();
          else nativeRef.current?.refit();
        },
        isDialogOpen: () => isDialogOpen,
        notifyBackgrounded: () => connRef.current?.notifyBackgrounded(),
        notifyForegrounded: () => connRef.current?.notifyForegrounded(),
        scrollToBottom: () => {
          if (XTERM_FALLBACK) xtermRef.current?.scrollToBottom();
          else nativeRef.current?.scrollToBottom();
        },
        isSelecting: () =>
          XTERM_FALLBACK ? (xtermRef.current?.isSelecting() ?? false) : false,
        keyTarget: () => (XTERM_FALLBACK ? null : keyTarget),
        command: runCommand,
        getCwd: () => connRef.current?.getCwd() ?? Promise.resolve(null),
      }),
      [isDialogOpen, sendInput, keyTarget, runCommand],
    );

    const background = settings.colors.background;

    // Every wrapper around the native terminal stays a real view. If Fabric flattens one
    // (a plain view turning opacity back to 1), the terminal is moved to another parent:
    // iOS drops its keyboard and the view can come back blank. Sessions places and hides
    // the tab, so nothing here changes with isVisible.
    return (
      <View
        collapsable={false}
        style={{ flex: 1, backgroundColor: background }}
      >
        <View
          collapsable={false}
          style={{ flex: 1, backgroundColor: background }}
        >
          <View
            collapsable={false}
            style={{ flex: 1, backgroundColor: background }}
            pointerEvents={isDialogOpen ? "none" : "auto"}
          >
            {XTERM_FALLBACK ? (
              <XtermTerminalView
                key={`xterm-${hostConfig.id}-${viewKey}`}
                ref={xtermRef}
                config={{
                  ...MOBILE_DEFAULT_TERMINAL_CONFIG,
                  ...config,
                  ...hostConfig.terminalConfig,
                }}
                colors={settings.colors}
                fontFamily={settings.fontFamily}
                fontSize={settings.fontSize}
                hasData={hasReceivedData}
                onReady={handleResize}
                onResize={handleResize}
                onInput={(data) => connRef.current?.sendInput(data)}
                onFailure={(message) => {
                  showToast.error(message);
                  onClose?.();
                }}
              />
            ) : (
              <View
                collapsable={false}
                style={{ flex: 1, opacity: showView ? 1 : 0 }}
              >
                <TerminalView
                  key={`native-${hostConfig.id}-${viewKey}`}
                  ref={nativeRef}
                  settings={settings}
                  pipeId={pipeId}
                  onInput={sendInput}
                  onResize={handleResize}
                  onModifiers={handleModifiers}
                  onFontSize={handleFontSize}
                  showScrollButton={isVisible && isConnected && !isDialogOpen}
                  watchPrompt={isConnected && (fillOn || historyOn)}
                  visible={isVisible}
                  onPromptLine={(line) => watcherRef.current?.line(line)}
                  onSearch={setSearchResult}
                  onTitle={useShellTitle ? onTitle : undefined}
                  onMenu={onMenu}
                  onShortcut={handleShortcut}
                />
                {searchOpen && isVisible ? (
                  <SearchBar
                    result={searchResult}
                    onSearch={(query, options) => {
                      if (query) nativeRef.current?.search(query, options);
                      else {
                        nativeRef.current?.clearSearch();
                        setSearchResult({ total: 0, index: -1 });
                      }
                    }}
                    onStep={(forward) =>
                      forward
                        ? nativeRef.current?.searchNext()
                        : nativeRef.current?.searchPrevious()
                    }
                    onClose={closeSearch}
                  />
                ) : null}
                {suggestionsOn && isVisible && isConnected ? (
                  <SuggestionStrip
                    tracker={tracker}
                    history={history}
                    onPick={(rest) => sendInput(rest)}
                  />
                ) : null}
              </View>
            )}
          </View>

          {/* Spinner shown until terminal has rendered its first output */}
          {!showView && !failed && (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: background,
                zIndex: 120,
              }}
            >
              <ActivityIndicator size="large" color={ui.brand} />
              <Text
                style={{
                  color: ui.text,
                  fontSize: 16,
                  fontWeight: "600",
                  marginTop: 20,
                  textAlign: "center",
                  letterSpacing: 0.3,
                }}
              >
                {(state.status === "connecting" && state.retry > 0) ||
                state.status === "reconnecting"
                  ? "Reconnecting..."
                  : state.status === "offline"
                    ? "Waiting for network..."
                    : state.status === "prompt"
                      ? "Waiting for you..."
                      : "Connecting..."}
              </Text>
              <Text
                style={{
                  color: ui.textMuted,
                  fontSize: 13,
                  marginTop: 6,
                  textAlign: "center",
                }}
              >
                {hostConfig.name}
                {"  |  "}
                {hostConfig.ip}
              </Text>
            </View>
          )}

          {failed ? (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 130,
              }}
            >
              <ConnectionError
                failure={failed.failure}
                switchTo={switchTo}
                onRetry={() => void conn.retry()}
                onSwitch={switchOrigin}
                onClose={onClose}
              />
            </View>
          ) : showView ? (
            <ConnectionBanner
              state={state}
              pending={pending}
              pendingHeld={pendingHeld}
              onReconnectNow={() => conn.reconnectNow()}
              onSend={() => conn.flushInput()}
              onDiscard={() => conn.discardInput()}
            />
          ) : (
            // The log is kept after connecting, for Connection log in the tab menu.
            <ConnectionLog
              entries={log}
              isConnecting={isConnecting}
              isConnected={isConnected}
              hasConnectionError={false}
            />
          )}
        </View>

        <TmuxPickerSheet
          sessions={tmuxPick?.sessions ?? null}
          allowPlain={!tmuxPick?.relay}
          onPick={onTmuxPick}
        />
        <TmuxWindowsSheet
          windows={tmuxWindows}
          onClose={() => setTmuxWindows(null)}
          onNew={() => {
            setTmuxWindows(null);
            connRef.current?.sendInput(`${tmuxPrefix}c`);
          }}
          onPick={(w) => {
            setTmuxWindows(null);
            connRef.current?.sendInput(tmuxPrefix + selectWindowKeys(w.index));
          }}
        />

        <PasswordFillSheet
          ask={fillAsk}
          hostName={hostConfig.name || hostConfig.ip}
          onChoose={onFillChoice}
        />

        <ConnectionLogSheet text={logText} onClose={() => setLogText(null)} />

        <ConnectionPrompts
          conn={conn}
          state={state}
          visible={isVisible}
          hostInfo={{
            name: hostConfig.name,
            ip: hostConfig.ip,
            port: hostConfig.port,
            username: hostConfig.username,
          }}
        />
      </View>
    );
  },
);

TerminalComponent.displayName = "Terminal";

export { TerminalComponent as Terminal };
export default TerminalComponent;
