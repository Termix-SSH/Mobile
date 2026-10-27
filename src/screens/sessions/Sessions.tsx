import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Keyboard,
  Platform,
  BackHandler,
  AppState,
  LayoutAnimation,
  PanResponder,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import {
  SessionType,
  type TerminalSession,
  useTerminalSessions,
} from "@/contexts/TerminalSessionsContext";
import { accounts } from "@/core/accounts";
import { SessionAccountProvider } from "@/core/accounts/session";
import { LOCAL_ACCOUNT_ID } from "@/core/accounts/types";
import { useKeyboard } from "@/contexts/KeyboardContext";
import type { TerminalHandle } from "@/features/terminal/Terminal";
import { features, useRegistryVersion } from "@/core/features";
import { MissingTab } from "@/screens/sessions/MissingTab";
import { sessionHandles } from "@/core/sessions/handles";
import { sessionStatus } from "@/core/sessions/status";
import { isAppLocked, onAppUnlocked } from "@/core/lock";
import { ConnectionsPanel } from "@/screens/sessions/ConnectionsPanel";
import { Screen } from "@/components/Screen";
import {
  BottomBarShown,
  SafeAreaPadded,
  useSideInsets,
} from "@/ui/bottom-inset";
import { reduceMotionOn } from "@/ui/motion";
import { tabTag, trace } from "@/core/log/trace";
import TabBar from "@/screens/sessions/navigation/TabBar";
import { SessionMenu } from "@/screens/sessions/SessionMenu";
import { keyBarHeight } from "@/features/terminal/keys/compact";
import { shellLayout } from "@/screens/shell/layout";
import { HostsPane } from "@/screens/sessions/HostsPane";
import { CompanionPane } from "@/screens/sessions/CompanionPane";
import { TabSwipeEdge } from "@/screens/sessions/TabSwipeEdge";
import {
  clampRatio,
  partnerAfterActivate,
  splitPartner,
} from "@/screens/sessions/split";
import { neighborTab, tabNumber } from "@/contexts/session-tabs";
import type {
  SessionMenuContext,
  SessionMenuItemDef,
} from "@/core/features/types";
import { useWindowInfo } from "@/utils/window-class";
import { getMaxKeyboardHeight, getTabBarHeight } from "@/utils/responsive";
import {
  addKeyCommandListener,
  setHardwareKeyboardEnabled,
} from "@/modules/hardware-keyboard";
import TerminalImeInput, {
  callImeInput,
  type TerminalImeInputHandle,
} from "@/modules/terminal-ime-input";
import {
  type TerminalSpecialKeyEvent,
  type TerminalSpecialKeyRecord,
  isDuplicateTerminalSpecialKey,
  makeTerminalSpecialKeyRecord,
  translateCommittedText,
  translateSpecialKeyEvent,
} from "@/features/terminal/keyboard/terminalInputMapping";
import { useUiColors } from "@/contexts/ThemeContext";
import { XTERM_FALLBACK } from "@/features/terminal/fallback";

// The native terminal reads the keyboard itself; the hidden input is for the xterm fallback.
const HIDDEN_INPUT = XTERM_FALLBACK;

// The key row keeps its own sticky modifiers now; typed text gets none.
const NO_MODIFIERS = { ctrl: false, alt: false, shift: false };
// Far enough right that a hidden tab is never on screen, whatever the window size.
const OFFSCREEN = 100000;
// Stands in until a new tab's ref exists
const NO_TERMINAL: React.RefObject<TerminalHandle | null> = { current: null };

export default function Sessions() {
  const ui = useUiColors();
  const insets = useSafeAreaInsets();
  const side = useSideInsets();
  // Tabs swap to a note when their plugin is turned off, and back.
  useRegistryVersion();
  const router = useRouter();
  const win = useWindowInfo();
  const { height, isLandscape } = win;
  const isIPad = Platform.OS === "ios" && Platform.isPad;
  const {
    sessions,
    activeSessionId,
    addSession,
    backgroundTabRecords,
    setActiveSession,
    removeSession,
    setBackendSessionId,
    setSessionTransport,
    renameSession,
    setShellTitle,
    setResumeData,
    moveSession,
    duplicateSession,
    closeAllSessions,
    isCustomKeyboardVisible,
    toggleCustomKeyboard,
    lastKeyboardHeight,
    setLastKeyboardHeight,
    keyboardIntentionallyHiddenRef,
    setKeyboardIntentionallyHidden,
  } = useTerminalSessions();

  const [showConnectionsPanel, setShowConnectionsPanel] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [featureView, setFeatureView] = useState<{
    item: SessionMenuItemDef;
    ctx: SessionMenuContext;
  } | null>(null);
  const { keyboardHeight, isKeyboardVisible } = useKeyboard();
  const hiddenInputRef = useRef<TerminalImeInputHandle | null>(null);
  // Tab handles by session id. Tabs with "terminal-input" hand out a TerminalHandle.
  // Tool tabs hand out other handles, so call terminal methods with ?.().
  const tabRefs = useRef<Record<string, React.RefObject<any>>>({});
  const refFor = (id: string) => (tabRefs.current[id] ??= React.createRef());
  const [customKeyboardInitialTab, setCustomKeyboardInitialTab] =
    useState<string>("keyboard");
  const compositionActiveRef = useRef(false);
  const lastSpecialKeyRef = useRef<TerminalSpecialKeyRecord | null>(null);
  const [terminalBackgroundColors, setTerminalBackgroundColors] = useState<
    Record<string, string>
  >({});

  // The keys panel stands in for the keyboard, capped so a sideways phone keeps some terminal.
  const maxKeyboardHeight = getMaxKeyboardHeight(height, isLandscape, isIPad);
  const effectiveKeyboardHeight = isLandscape
    ? Math.min(lastKeyboardHeight, maxKeyboardHeight)
    : lastKeyboardHeight;
  // The system keyboard covers what it covers, so the bars must sit on its real top.
  const currentKeyboardHeight = keyboardHeight;

  const customKeyboardHeight = Math.max(
    win.isShort ? 140 : 200,
    Math.min(effectiveKeyboardHeight, 500),
  );

  const SESSION_TAB_BAR_HEIGHT = getTabBarHeight(isLandscape, win.isShort) + 2;
  const CUSTOM_KEYBOARD_TAB_HEIGHT = 36;

  const KEYBOARD_BAR_HEIGHT = keyBarHeight(isLandscape, win.isShort);
  // When the system keyboard is dismissed the keyboard bar reserves the
  // home-indicator safe area below its keys. The TabBar floats directly on top
  // of the bar, so it must be lifted by the keys' height PLUS that same
  // reservation - otherwise the reserved space falls between the TabBar and the
  // keys and the TabBar looks bottom-heavy. Keep these two in lockstep.
  const KEYBOARD_BAR_BOTTOM_INSET = Math.max(insets.bottom, 8);
  const KEYBOARD_BAR_HEIGHT_EXTENDED =
    KEYBOARD_BAR_HEIGHT + KEYBOARD_BAR_BOTTOM_INSET;

  const activeSession = sessions.find(
    (session) => session.id === activeSessionId,
  );
  const activeIsTerminal = features.sessionHas(
    activeSession?.type,
    "terminal-input",
  );
  // The active tab's own key row and keys panel.
  const chrome = activeSession
    ? features.sessionTab(activeSession.type)?.inputChrome
    : undefined;
  const KeyRowBar = chrome?.keyRow;
  const BottomToolbar = chrome?.keyPanel;

  const getActiveTerminalRef = useCallback(() => {
    return activeSessionId ? tabRefs.current[activeSessionId] : null;
  }, [activeSessionId]);

  // Timers fire after the tab changed, so they read the active tab from here.
  const activeIdRef = useRef(activeSessionId);
  useEffect(() => {
    activeIdRef.current = activeSessionId;
  }, [activeSessionId]);

  /** Shows or hides the keyboard on the active terminal. */
  const keyboard = useCallback((action: "focus" | "blur" | "clear") => {
    // Never focus under the lock pad, or the keyboard covers it (#100).
    if (action === "focus" && isAppLocked()) return;
    if (HIDDEN_INPUT) {
      callImeInput(hiddenInputRef, action);
      return;
    }
    const id = activeIdRef.current;
    const target = id ? tabRefs.current[id]?.current?.keyTarget?.() : null;
    trace("kb", `keyboard(${action})`, { tab: tabTag(id), target: !!target });
    if (action === "focus") target?.focus();
    else if (action === "blur") target?.blur();
  }, []);

  // Give the keyboard back once the lock pad is gone.
  useEffect(
    () =>
      onAppUnlocked(() => {
        if (
          activeIsTerminal &&
          !isCustomKeyboardVisible &&
          !keyboardIntentionallyHiddenRef.current
        ) {
          setTimeout(() => keyboard("focus"), 100);
        }
      }),
    [activeIsTerminal, isCustomKeyboardVisible, keyboard],
  );

  const dispatchCommittedText = useCallback(
    (text: string) => {
      const activeRef = getActiveTerminalRef();
      if (!activeRef?.current || !text) {
        return;
      }

      const translatedText = translateCommittedText(text, NO_MODIFIERS);
      if (translatedText) {
        activeRef.current.sendInput(translatedText);
      }
    },
    [getActiveTerminalRef],
  );

  const dispatchSpecialKey = useCallback(
    (event: TerminalSpecialKeyEvent) => {
      if (compositionActiveRef.current) {
        return;
      }

      const now = Date.now();
      if (
        isDuplicateTerminalSpecialKey(lastSpecialKeyRef.current, event, now)
      ) {
        return;
      }

      const translatedKey = translateSpecialKeyEvent(event);
      if (!translatedKey) {
        return;
      }

      const activeRef = getActiveTerminalRef();
      if (!activeRef?.current) {
        return;
      }

      lastSpecialKeyRef.current = makeTerminalSpecialKeyRecord(event, now);
      activeRef.current.sendInput(translatedKey);
    },
    [getActiveTerminalRef],
  );

  const [isRdpKeyboardOpen, setIsRdpKeyboardOpen] = useState(false);

  useEffect(() => {
    // Only the xterm fallback has a hidden input to clear.
    if (HIDDEN_INPUT && activeIsTerminal && !isCustomKeyboardVisible) {
      keyboard("clear");
    }
    compositionActiveRef.current = false;
    lastSpecialKeyRef.current = null;
  }, [activeSessionId, activeIsTerminal, isCustomKeyboardVisible, keyboard]);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => {
      if (features.sessionHas(activeSession?.type, "own-keyboard"))
        setIsRdpKeyboardOpen(true);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setIsRdpKeyboardOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [activeSession?.type]);

  // The bars sit on the real keyboard. Opened by a tap on the terminal, it still lifts them.
  const systemKeyboardUp = isKeyboardVisible && currentKeyboardHeight > 0;
  // Read by effects that run right after a tab switch, before the keyboard moves.
  const keyboardUpRef = useRef(systemKeyboardUp);
  keyboardUpRef.current = systemKeyboardUp;
  const activeIsTerminalRef = useRef(activeIsTerminal);
  activeIsTerminalRef.current = activeIsTerminal;
  const keysPanelRef = useRef(isCustomKeyboardVisible);
  keysPanelRef.current = isCustomKeyboardVisible;

  const getTabBarBottomPosition = () => {
    if (!activeIsTerminal) {
      return insets.bottom;
    }

    if (isCustomKeyboardVisible) {
      return CUSTOM_KEYBOARD_TAB_HEIGHT + customKeyboardHeight;
    }

    return systemKeyboardUp
      ? KEYBOARD_BAR_HEIGHT + currentKeyboardHeight
      : KEYBOARD_BAR_HEIGHT_EXTENDED;
  };

  // No active tab lays out like a terminal, as before.
  const getBottomMargin = (sessionType?: SessionType) => {
    if (sessionType && !features.sessionHas(sessionType, "terminal-input")) {
      return SESSION_TAB_BAR_HEIGHT + insets.bottom;
    }

    if (isCustomKeyboardVisible) {
      return (
        SESSION_TAB_BAR_HEIGHT +
        CUSTOM_KEYBOARD_TAB_HEIGHT +
        customKeyboardHeight
      );
    }

    return systemKeyboardUp
      ? SESSION_TAB_BAR_HEIGHT + KEYBOARD_BAR_HEIGHT + currentKeyboardHeight
      : SESSION_TAB_BAR_HEIGHT + KEYBOARD_BAR_HEIGHT_EXTENDED;
  };

  // A keyboard that came up, from a tap on the terminal too, ends a hide from the tab bar.
  useEffect(() => {
    trace("kb", "bars", {
      code: "tabs-offscreen-v5",
      up: systemKeyboardUp,
      visible: isKeyboardVisible,
      height: Math.round(currentKeyboardHeight),
      userHid: keyboardIntentionallyHiddenRef.current,
      active: tabTag(activeSessionId),
      terminal: activeIsTerminal,
    });
    if (systemKeyboardUp && keyboardIntentionallyHiddenRef.current) {
      setKeyboardIntentionallyHidden(false);
    }
  }, [
    systemKeyboardUp,
    keyboardIntentionallyHiddenRef,
    setKeyboardIntentionallyHidden,
  ]);

  useEffect(() => {
    const next: Record<string, React.RefObject<any>> = {};
    for (const s of sessions) {
      next[s.id] = refFor(s.id);
    }
    tabRefs.current = next;
    const offs = sessions.map((s) =>
      sessionHandles.register(
        s.id,
        () => tabRefs.current[s.id]?.current ?? null,
      ),
    );
    return () => offs.forEach((off) => off());
  }, [sessions]);

  // Panels beside a tab (tablets), by session id.
  const isTablet = win.canSplit;
  const [companionFor, setCompanionFor] = useState<Record<string, string>>({});
  const companionsOf = useCallback((session: TerminalSession | undefined) => {
    if (!session) return [];
    const ctx = {
      account: accounts.find(session.accountId) ?? accounts.active(),
      client: accounts.client(session.accountId),
    };
    return features.companionsFor(session.type, session.host, ctx);
  }, []);
  const seenForCompanions = useRef(new Set<string>());
  useEffect(() => {
    const opened: Record<string, string> = {};
    for (const s of sessions) {
      if (seenForCompanions.current.has(s.id)) continue;
      seenForCompanions.current.add(s.id);
      if (!isTablet || s.restored) continue;
      const auto = companionsOf(s).find((c) => c.layout?.().autoOpen);
      if (auto) opened[s.id] = auto.id;
    }
    if (Object.keys(opened).length) {
      setCompanionFor((prev) => ({ ...prev, ...opened }));
    }
  }, [sessions, isTablet, companionsOf]);
  const toggleCompanion = useCallback(
    (session: TerminalSession, companionId: string) => {
      if (!isTablet) {
        const def = companionsOf(session).find((c) => c.id === companionId);
        if (def?.phoneTabType) {
          addSession(session.host, def.phoneTabType, {
            accountId: session.accountId,
            origin: session.origin,
            linkedSessionId: session.id,
          });
        }
        return;
      }
      setCompanionFor((prev) => {
        const next = { ...prev };
        if (next[session.id] === companionId) delete next[session.id];
        else next[session.id] = companionId;
        return next;
      });
    },
    [isTablet, companionsOf, addSession],
  );

  // Two tabs side by side on large screens. Kept in memory only.
  const [splitWith, setSplitWith] = useState<string | null>(null);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [stageWidth, setStageWidth] = useState(0);
  const splitOk = win.canSplit;
  const partnerId = splitOk
    ? splitPartner(
        sessions.map((s) => s.id),
        activeSessionId,
        splitWith,
      )
    : null;
  const ratioBase = useRef(splitRatio);
  const ratioNow = useRef(splitRatio);
  ratioNow.current = splitRatio;
  const dividerPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          ratioBase.current = ratioNow.current;
        },
        onPanResponderMove: (_, g) => {
          if (stageWidth > 0) {
            setSplitRatio(clampRatio(ratioBase.current + g.dx / stageWidth));
          }
        },
      }),
    [stageWidth],
  );

  // A tab switch keeps the keyboard as it was. Up: the new terminal takes it (it waits until
  // it is on screen) and iOS moves it over without hiding it, which also lets go of the old
  // one. Down: nothing is focused, so it stays down.
  const prevActiveRef = useRef<string | null>(activeSessionId);
  useEffect(() => {
    const prev = prevActiveRef.current;
    prevActiveRef.current = activeSessionId;
    if (HIDDEN_INPUT || !prev || prev === activeSessionId) return;
    const shown = activeSessionId ? tabRefs.current[activeSessionId] : null;
    const next = shown?.current?.keyTarget?.() ?? null;
    const keyboardUp = keyboardUpRef.current;
    const keepKeyboard =
      !!next && keyboardUp && !isCustomKeyboardVisible && !isAppLocked();
    trace("kb", "tab switch", {
      from: tabTag(prev),
      to: tabTag(activeSessionId),
      nextReady: !!next,
      keyboardUp,
      keepKeyboard,
      keysPanel: isCustomKeyboardVisible,
    });
    if (keepKeyboard) next.focus();
    else if (keyboardUp)
      tabRefs.current[prev]?.current?.keyTarget?.()?.blur?.();
    // A tab resized while hidden can come back scrolled above its live screen.
    const timer = setTimeout(() => shown?.current?.scrollToBottom?.(), 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // Coming back to Sessions: leaving it took the keyboard away, so give it back.
  const hasSessions = sessions.length > 0;
  useFocusEffect(
    React.useCallback(() => {
      if (!hasSessions) return;
      const timeoutId = setTimeout(() => {
        if (
          activeIsTerminalRef.current &&
          !keysPanelRef.current &&
          !keyboardIntentionallyHiddenRef.current
        ) {
          keyboard("focus");
        }
      }, 250);
      return () => clearTimeout(timeoutId);
    }, [hasSessions, keyboard, keyboardIntentionallyHiddenRef]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      // Connections hear about the app state from the session lifecycle.
      if (nextAppState === "active") {
        if (
          sessions.length > 0 &&
          activeIsTerminal &&
          !isCustomKeyboardVisible &&
          !keyboardIntentionallyHiddenRef.current
        ) {
          setTimeout(() => {
            keyboard("focus");
          }, 500);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [sessions, activeSession?.type, isCustomKeyboardVisible]);

  useEffect(() => {
    if (Platform.OS === "android" && sessions.length > 0) {
      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          if (showConnectionsPanel) {
            setShowConnectionsPanel(false);
            return true;
          }
          if (isKeyboardVisible) {
            setKeyboardIntentionallyHidden(true);
            keyboard("blur");
            Keyboard.dismiss();
            return true;
          }
          return false;
        },
      );

      return () => {
        backHandler.remove();
      };
    }
  }, [sessions.length, isKeyboardVisible, showConnectionsPanel]);

  useEffect(() => {
    if (keyboardHeight > 0) {
      setLastKeyboardHeight(keyboardHeight);
    }
  }, [keyboardHeight, setLastKeyboardHeight]);

  useEffect(() => {
    setHardwareKeyboardEnabled(HIDDEN_INPUT);
    return () => setHardwareKeyboardEnabled(false);
  }, []);

  // The native terminal follows its own size; this is a safety net, and the xterm fallback needs it.
  useEffect(() => {
    const activeRef = activeSessionId ? tabRefs.current[activeSessionId] : null;
    const timer = setTimeout(() => activeRef?.current?.fit?.(), 100);
    return () => clearTimeout(timer);
  }, [
    keyboardHeight,
    activeSessionId,
    win.width,
    win.height,
    isCustomKeyboardVisible,
    customKeyboardHeight,
  ]);

  useEffect(() => {
    if (Platform.OS !== "ios" || !HIDDEN_INPUT) return;
    const sub = addKeyCommandListener((event) => {
      dispatchSpecialKey({
        key: event.input === "\t" ? "Tab" : event.input,
        shift: event.shift,
        ctrl: event.ctrl,
        alt: event.alt,
        source: "ios-keycommand",
      });
    });
    return () => sub?.remove();
  }, [dispatchSpecialKey]);

  const handleTabPress = (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    setKeyboardIntentionallyHidden(false);

    setSplitWith((prev) =>
      partnerAfterActivate(activeSessionId, prev, sessionId),
    );
    setActiveSession(sessionId);
    // A new tab gets focus from the focus effect; this covers a tap on the open one.
    if (sessionId !== activeSessionId) return;
    setTimeout(() => {
      if (
        features.sessionHas(session?.type, "terminal-input") &&
        !isCustomKeyboardVisible
      ) {
        keyboard("focus");
      }
    }, 100);
  };

  const handleShortcut = (id: string) => {
    const n = tabNumber(id);
    if (n !== null) {
      const target = sessions[n - 1];
      if (target) handleTabPress(target.id);
      return;
    }
    if (id === "nextTab") stepTab(1);
    else if (id === "prevTab") stepTab(-1);
    else if (id === "newTab" && activeSessionId) {
      duplicateSession(activeSessionId);
    } else if (id === "closeTab" && activeSessionId) {
      handleTabClose(activeSessionId);
    }
  };

  const stepTab = (step: 1 | -1) => {
    const next = neighborTab(sessions, activeSessionId, step);
    if (next) handleTabPress(next.id);
  };

  const handleTabClose = (sessionId: string) => {
    removeSession(sessionId);
    setTimeout(() => {
      if (activeIsTerminal && !isCustomKeyboardVisible && sessions.length > 1) {
        keyboard("focus");
      }
    }, 100);
  };

  const closeConnectionsPanel = useCallback(() => {
    setShowConnectionsPanel(false);
    if (activeIsTerminal && !isCustomKeyboardVisible) {
      setKeyboardIntentionallyHidden(false);
      setTimeout(() => keyboard("focus"), 100);
    }
  }, [
    activeSession?.type,
    isCustomKeyboardVisible,
    setKeyboardIntentionallyHidden,
  ]);

  const handleAddSession = () => {
    router.navigate("/hosts" as any);
  };

  const handleToggleKeyboard = () => {
    if (!reduceMotionOn()) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }

    if (isCustomKeyboardVisible) {
      setCustomKeyboardInitialTab("keyboard");
      toggleCustomKeyboard();
      setKeyboardIntentionallyHidden(false);
      setTimeout(() => {
        keyboard("focus");
      }, 50);
      setTimeout(() => {
        const activeRef = activeSessionId
          ? tabRefs.current[activeSessionId]
          : null;
        if (activeRef?.current) {
          activeRef.current?.fit?.();
          setTimeout(() => {
            activeRef.current?.scrollToBottom?.();
          }, 50);
        }
      }, 300);
    } else {
      toggleCustomKeyboard();
      setKeyboardIntentionallyHidden(false);
      requestAnimationFrame(() => {
        keyboard("blur");
      });
      setTimeout(() => {
        const activeRef = activeSessionId
          ? tabRefs.current[activeSessionId]
          : null;
        if (activeRef?.current) {
          activeRef.current?.fit?.();
          setTimeout(() => {
            activeRef.current?.scrollToBottom?.();
          }, 50);
        }
      }, 300);
    }
  };

  const openPanel = useCallback(
    (tab: string) => {
      setCustomKeyboardInitialTab(tab);
      if (!isCustomKeyboardVisible) {
        if (!reduceMotionOn()) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        }
        toggleCustomKeyboard();
        setKeyboardIntentionallyHidden(false);
        requestAnimationFrame(() => {
          keyboard("blur");
        });
        setTimeout(() => {
          const activeRef = activeSessionId
            ? tabRefs.current[activeSessionId]
            : null;
          if (activeRef?.current) {
            activeRef.current?.fit?.();
            setTimeout(() => activeRef.current?.scrollToBottom?.(), 50);
          }
        }, 300);
      }
    },
    [
      isCustomKeyboardVisible,
      toggleCustomKeyboard,
      setKeyboardIntentionallyHidden,
      activeSessionId,
    ],
  );

  // Key row commands: "panel.<tab>" opens a keys panel tab, the rest go to the tab.
  const handleKeyCommand = useCallback(
    (id: string) => {
      if (id.startsWith("panel.")) {
        openPanel(id.slice("panel.".length));
        return;
      }
      const handle = activeIdRef.current
        ? tabRefs.current[activeIdRef.current]?.current
        : null;
      handle?.command?.(id);
    },
    [openPanel],
  );

  const showHostsPane = shellLayout(win, sessions.length).hostsPane;

  const activeTerminalBgColor =
    activeIsTerminal && activeSessionId
      ? terminalBackgroundColors[activeSessionId] || ui.terminal
      : ui.background;

  const renderSession = (session: TerminalSession) => {
    const Tab = features.sessionTab(session.type)?.component;
    if (!Tab) {
      return (
        <MissingTab
          title={session.title}
          isVisible={session.id === activeSessionId}
          onClose={() => handleTabClose(session.id)}
        />
      );
    }
    return (
      <Tab
        ref={refFor(session.id)}
        session={session}
        isVisible={session.id === activeSessionId || session.id === partnerId}
        onClose={() => handleTabClose(session.id)}
        onBackendSessionId={(backendId) =>
          setBackendSessionId(session.id, backendId)
        }
        onTransportResolved={(kind) => setSessionTransport(session.id, kind)}
        onTitle={(title) => setShellTitle(session.id, title)}
        onStatus={(status) => sessionStatus.set(session.id, status)}
        onResumeData={(data) => setResumeData(session.id, data)}
        onMenu={() => setMenuFor(session.id)}
        onShortcut={handleShortcut}
        onBackgroundColorChange={(color) => {
          setTerminalBackgroundColors((prev) =>
            prev[session.id] === color
              ? prev
              : { ...prev, [session.id]: color },
          );
        }}
      />
    );
  };

  const stageColor = activeIsTerminal ? activeTerminalBgColor : ui.background;

  return (
    <View
      className="flex-1 flex-row"
      style={{
        paddingLeft: side.left,
        paddingRight: side.right,
        backgroundColor: stageColor,
      }}
    >
      {showHostsPane ? <HostsPane /> : null}
      <View
        className="flex-1"
        style={{
          paddingTop: insets.top,
          backgroundColor: stageColor,
        }}
      >
        <View
          style={{
            flex: 1,
            marginBottom: getBottomMargin(activeSession?.type),
          }}
        >
          {(() => {
            const leftWidth = Math.round(stageWidth * splitRatio);
            // Each tab keeps its own wrapper, so starting or ending a split never remounts it.
            // Hidden tabs only move off screen. A zIndex change re-inserts the native views,
            // and pointerEvents none on the tab that has the keyboard makes iOS drop it.
            const paneStyle = (id: string) => {
              const shown = id === activeSessionId || id === partnerId;
              if (!partnerId || !shown) {
                return [
                  StyleSheet.absoluteFill,
                  { transform: [{ translateX: shown ? 0 : OFFSCREEN }] },
                ];
              }
              const order = sessions.findIndex((s) => s.id === id);
              const other = sessions.findIndex(
                (s) =>
                  s.id === (id === partnerId ? activeSessionId : partnerId),
              );
              const left = order < other;
              return [
                {
                  position: "absolute" as const,
                  top: 0,
                  bottom: 0,
                  left: left ? 0 : leftWidth + 3,
                  width: left ? leftWidth - 3 : stageWidth - leftWidth - 3,
                },
              ];
            };
            const tabs = (
              <View
                style={{ flex: 1 }}
                onLayout={(e) => {
                  trace("kb", "stage", {
                    width: Math.round(e.nativeEvent.layout.width),
                    height: Math.round(e.nativeEvent.layout.height),
                  });
                  setStageWidth(e.nativeEvent.layout.width);
                }}
              >
                {sessions.map((session) => {
                  return (
                    <View
                      key={session.id}
                      // A tab never gets moved to another parent when it shows or hides.
                      collapsable={false}
                      style={paneStyle(session.id)}
                      onTouchStart={
                        session.id === partnerId
                          ? () => handleTabPress(session.id)
                          : undefined
                      }
                    >
                      <SessionAccountProvider accountId={session.accountId}>
                        <SafeAreaPadded.Provider value>
                          <BottomBarShown.Provider value>
                            {renderSession(session)}
                          </BottomBarShown.Provider>
                        </SafeAreaPadded.Provider>
                      </SessionAccountProvider>
                    </View>
                  );
                })}
                {partnerId ? (
                  <View
                    {...dividerPan.panHandlers}
                    accessibilityRole="adjustable"
                    accessibilityLabel="Resize split view"
                    hitSlop={{ left: 8, right: 8 }}
                    className="items-center justify-center bg-border active:bg-accent-brand"
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: leftWidth - 3,
                      width: 6,
                      zIndex: 2,
                    }}
                  >
                    <View className="h-8 w-0.5 bg-muted-foreground/50" />
                  </View>
                ) : null}
              </View>
            );
            const companionId =
              isTablet && activeSession && !partnerId
                ? companionFor[activeSession.id]
                : null;
            const def = companionId
              ? companionsOf(activeSession).find((c) => c.id === companionId)
              : null;
            if (!activeSession || !def) return tabs;
            const paneSide = def.layout?.().side ?? "right";
            const pane = (
              <SessionAccountProvider
                key={`companion-${activeSession.id}`}
                accountId={activeSession.accountId}
              >
                <SafeAreaPadded.Provider value>
                  <BottomBarShown.Provider value>
                    <CompanionPane
                      def={def}
                      side={paneSide}
                      screenWidth={win.width}
                      props={{
                        session: activeSession,
                        getHandle: () => sessionHandles.get(activeSession.id),
                        isVisible: true,
                        layout: "side",
                        close: () => toggleCompanion(activeSession, def.id),
                      }}
                    />
                  </BottomBarShown.Provider>
                </SafeAreaPadded.Provider>
              </SessionAccountProvider>
            );
            return (
              <View style={{ flex: 1, flexDirection: "row" }}>
                {paneSide === "left" ? pane : null}
                <View style={{ flex: 1 }}>{tabs}</View>
                {paneSide === "right" ? pane : null}
              </View>
            );
          })()}
          {sessions.length > 1 ? (
            <>
              <TabSwipeEdge side="left" onSwipe={() => stepTab(-1)} />
              <TabSwipeEdge side="right" onSwipe={() => stepTab(1)} />
            </>
          ) : null}
        </View>

        {/* Connections panel: full screen when no sessions, overlay when sessions exist */}
        {(sessions.length === 0 || showConnectionsPanel) && (
          <StageOverlay zIndex={1010}>
            {sessions.length === 0 ? (
              <Screen title="Connections">
                <ConnectionsPanel />
              </Screen>
            ) : (
              <Screen title="Connections" onBack={closeConnectionsPanel}>
                <ConnectionsPanel onClose={closeConnectionsPanel} />
              </Screen>
            )}
          </StageOverlay>
        )}

        {sessions.length > 0 &&
          activeIsTerminal &&
          KeyRowBar &&
          !isCustomKeyboardVisible && (
            <View
              style={{
                position: "absolute",
                bottom: systemKeyboardUp ? currentKeyboardHeight : 0,
                left: 0,
                right: 0,
                height: systemKeyboardUp
                  ? KEYBOARD_BAR_HEIGHT
                  : KEYBOARD_BAR_HEIGHT_EXTENDED,
                zIndex: 1003,
                overflow: "visible",
                justifyContent: "center",
              }}
            >
              <SessionAccountProvider
                accountId={activeSession?.accountId ?? LOCAL_ACCOUNT_ID}
              >
                <KeyRowBar
                  terminalRef={
                    (activeSessionId && tabRefs.current[activeSessionId]) ||
                    NO_TERMINAL
                  }
                  host={activeSession?.host}
                  isVisible={true}
                  isKeyboardIntentionallyHidden={!systemKeyboardUp}
                  bottomInset={KEYBOARD_BAR_BOTTOM_INSET}
                  onCommand={handleKeyCommand}
                />
              </SessionAccountProvider>
            </View>
          )}

        {sessions.length > 0 &&
          features.sessionHas(activeSession?.type, "keyboard-cover") &&
          isCustomKeyboardVisible && (
            <View
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: effectiveKeyboardHeight,
                backgroundColor: ui.background,
                zIndex: 1002,
              }}
            />
          )}

        <View
          style={{
            position: "absolute",
            bottom: getTabBarBottomPosition(),
            left: 0,
            right: 0,
            height: SESSION_TAB_BAR_HEIGHT,
            zIndex: 1004,
            display: isRdpKeyboardOpen ? "none" : "flex",
          }}
        >
          <TabBar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onTabPress={handleTabPress}
            onTabClose={handleTabClose}
            onAddSession={handleAddSession}
            onToggleKeyboard={handleToggleKeyboard}
            isCustomKeyboardVisible={isCustomKeyboardVisible}
            onKeyboard={keyboard}
            keyboardUp={systemKeyboardUp}
            onHideKeyboard={() => setKeyboardIntentionallyHidden(true)}
            onShowKeyboard={() => setKeyboardIntentionallyHidden(false)}
            keyboardIntentionallyHiddenRef={keyboardIntentionallyHiddenRef}
            activeSessionType={activeSession?.type}
            onShowConnections={() => {
              setKeyboardIntentionallyHidden(true);
              Keyboard.dismiss();
              keyboard("blur");
              setShowConnectionsPanel(true);
            }}
            hasBackgroundSessions={backgroundTabRecords.some(
              (r) => !sessions.find((s) => s.instanceId === r.id),
            )}
            onTabMenu={setMenuFor}
            onTabMove={moveSession}
          />
        </View>

        {activeSession &&
          BottomToolbar &&
          isCustomKeyboardVisible &&
          activeIsTerminal && (
            <View
              pointerEvents="box-none"
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 1002,
                backgroundColor: ui.background,
              }}
            >
              <SessionAccountProvider accountId={activeSession.accountId}>
                <BottomToolbar
                  terminalRef={
                    (activeSessionId && tabRefs.current[activeSessionId]) ||
                    NO_TERMINAL
                  }
                  isVisible={isCustomKeyboardVisible}
                  keyboardHeight={customKeyboardHeight}
                  isKeyboardIntentionallyHidden={
                    keyboardIntentionallyHiddenRef.current
                  }
                  initialTab={customKeyboardInitialTab}
                  hostId={activeSession?.host?.id}
                  host={activeSession?.host}
                  onCommand={handleKeyCommand}
                />
              </SessionAccountProvider>
            </View>
          )}

        <SessionMenu
          session={sessions.find((s) => s.id === menuFor) ?? null}
          index={sessions.findIndex((s) => s.id === menuFor)}
          count={sessions.length}
          handle={menuFor ? (tabRefs.current[menuFor]?.current ?? null) : null}
          onClose={() => setMenuFor(null)}
          onRename={(title) => menuFor && renameSession(menuFor, title)}
          onDuplicate={() => menuFor && duplicateSession(menuFor)}
          onMove={(to) => menuFor && moveSession(menuFor, to)}
          onCloseTab={() => menuFor && handleTabClose(menuFor)}
          companions={companionsOf(sessions.find((s) => s.id === menuFor))}
          companionOpen={menuFor ? (companionFor[menuFor] ?? null) : null}
          companionAsTab={!isTablet}
          splitTargets={splitOk ? sessions.filter((s) => s.id !== menuFor) : []}
          splitOn={
            !!partnerId &&
            (menuFor === activeSessionId || menuFor === partnerId)
          }
          onSplit={(id) => {
            if (!id) {
              setSplitWith(null);
              return;
            }
            if (menuFor && menuFor !== activeSessionId)
              setActiveSession(menuFor);
            setSplitWith(id);
          }}
          onCloseAll={() => {
            setSplitWith(null);
            closeAllSessions();
          }}
          onCompanion={(id) => {
            const session = sessions.find((s) => s.id === menuFor);
            if (session) toggleCompanion(session, id);
          }}
          onView={(item, ctx) => {
            keyboard("blur");
            setFeatureView({ item, ctx });
          }}
        />

        {featureView?.item.view ? (
          <StageOverlay zIndex={1020}>
            <SessionAccountProvider
              accountId={featureView.ctx.session.accountId}
            >
              <featureView.item.view
                ctx={featureView.ctx}
                onClose={() => setFeatureView(null)}
              />
            </SessionAccountProvider>
          </StageOverlay>
        ) : null}

        {HIDDEN_INPUT &&
          sessions.length > 0 &&
          !isCustomKeyboardVisible &&
          activeIsTerminal && (
            <TerminalImeInput
              ref={hiddenInputRef}
              style={{
                position: "absolute",
                bottom: -1000,
                left: -1000,
                width: 1,
                height: 1,
                opacity: 0,
                zIndex: -1,
              }}
              pointerEvents="box-none"
              onCommitText={({ nativeEvent }) => {
                dispatchCommittedText(nativeEvent.text);
              }}
              onSpecialKey={({ nativeEvent }) => {
                dispatchSpecialKey(nativeEvent);
              }}
              onCompositionStateChange={({ nativeEvent }) => {
                compositionActiveRef.current = nativeEvent.active;
                if (nativeEvent.active) {
                  lastSpecialKeyRef.current = null;
                }
              }}
              onImeFocus={() => {
                setKeyboardIntentionallyHidden(false);
              }}
              onImeBlur={() => {
                const activeRef = activeSessionId
                  ? tabRefs.current[activeSessionId]
                  : null;
                const isDialogOpen =
                  activeRef?.current?.isDialogOpen?.() || false;
                const isCurrentlySelecting =
                  activeRef?.current?.isSelecting?.() || false;

                if (
                  !keyboardIntentionallyHiddenRef.current &&
                  !isCustomKeyboardVisible &&
                  activeIsTerminal &&
                  !isDialogOpen &&
                  !isCurrentlySelecting
                ) {
                  requestAnimationFrame(() => {
                    const stillNotSelecting =
                      !activeRef?.current?.isSelecting?.();
                    if (stillNotSelecting) {
                      keyboard("focus");
                    }
                  });
                }
              }}
            />
          )}
      </View>
    </View>
  );
}

/** A full view over the session stage. The stage already keeps clear of the notch. */
function StageOverlay({
  zIndex,
  children,
}: {
  zIndex: number;
  children: React.ReactNode;
}) {
  const ui = useUiColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { zIndex, paddingTop: insets.top, backgroundColor: ui.background },
      ]}
    >
      <SafeAreaPadded.Provider value>{children}</SafeAreaPadded.Provider>
    </View>
  );
}
