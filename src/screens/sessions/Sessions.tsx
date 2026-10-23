import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Keyboard,
  Platform,
  Dimensions,
  BackHandler,
  AppState,
  LayoutAnimation,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import {
  SessionType,
  type TerminalSession,
  useTerminalSessions,
} from "@/contexts/TerminalSessionsContext";
import { X } from "lucide-react-native";
import { SessionAccountProvider } from "@/core/accounts/session";
import { useKeyboard } from "@/contexts/KeyboardContext";
import type { TerminalHandle } from "@/features/terminal/Terminal";
import { features } from "@/core/features";
import { ConnectionsPanel } from "@/screens/sessions/ConnectionsPanel";
import { Screen } from "@/components/Screen";
import { Text } from "@/ui";
import TabBar from "@/screens/sessions/navigation/TabBar";
import BottomToolbar from "@/features/terminal/keyboard/BottomToolbar";
import KeyboardBar from "@/features/terminal/keyboard/KeyboardBar";
import { useOrientation } from "@/utils/orientation";
import { getMaxKeyboardHeight, getTabBarHeight } from "@/utils/responsive";
import { addKeyCommandListener } from "@/modules/hardware-keyboard";
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

type ActiveModifiers = {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
};

export default function Sessions() {
  const ui = useUiColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height, isLandscape } = useOrientation();
  const isIPad = Platform.OS === "ios" && Platform.isPad;
  const {
    sessions,
    activeSessionId,
    backgroundTabRecords,
    setActiveSession,
    removeSession,
    setBackendSessionId,
    isCustomKeyboardVisible,
    toggleCustomKeyboard,
    lastKeyboardHeight,
    setLastKeyboardHeight,
    keyboardIntentionallyHiddenRef,
    setKeyboardIntentionallyHidden,
  } = useTerminalSessions();

  const [showConnectionsPanel, setShowConnectionsPanel] = useState(false);
  const { keyboardHeight, isKeyboardVisible } = useKeyboard();
  const hiddenInputRef = useRef<TerminalImeInputHandle | null>(null);
  // Tab handles by session id. Tabs with "terminal-input" hand out a TerminalHandle.
  const tabRefs = useRef<Record<string, React.RefObject<any>>>({});
  const [activeModifiers, setActiveModifiers] = useState({
    ctrl: false,
    alt: false,
    shift: false,
  });
  const [screenDimensions, setScreenDimensions] = useState(
    Dimensions.get("window"),
  );
  const [customKeyboardInitialTab, setCustomKeyboardInitialTab] = useState<
    "keyboard" | "snippets" | "history"
  >("keyboard");
  const compositionActiveRef = useRef(false);
  const lastSpecialKeyRef = useRef<TerminalSpecialKeyRecord | null>(null);
  const [terminalBackgroundColors, setTerminalBackgroundColors] = useState<
    Record<string, string>
  >({});
  const isSelectingRef = useRef(false);

  const maxKeyboardHeight = getMaxKeyboardHeight(height, isLandscape, isIPad);
  const effectiveKeyboardHeight = isLandscape
    ? Math.min(lastKeyboardHeight, maxKeyboardHeight)
    : lastKeyboardHeight;
  const currentKeyboardHeight = isLandscape
    ? Math.min(keyboardHeight, maxKeyboardHeight)
    : keyboardHeight;

  const customKeyboardHeight = Math.max(
    200,
    Math.min(effectiveKeyboardHeight, 500),
  );

  const SESSION_TAB_BAR_HEIGHT = getTabBarHeight(isLandscape) + 2;
  const CUSTOM_KEYBOARD_TAB_HEIGHT = 36;

  const KEYBOARD_BAR_HEIGHT = isLandscape ? 48 : 52;
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

  const getActiveTerminalRef = useCallback(() => {
    return activeSessionId ? tabRefs.current[activeSessionId] : null;
  }, [activeSessionId]);

  const dispatchCommittedText = useCallback(
    (text: string) => {
      const activeRef = getActiveTerminalRef();
      if (!activeRef?.current || !text) {
        return;
      }

      const translatedText = translateCommittedText(text, activeModifiers);
      if (translatedText) {
        activeRef.current.sendInput(translatedText);
      }
    },
    [activeModifiers, getActiveTerminalRef],
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
    // Only the terminal session renders the hidden input, so skip the native
    // call when switching to any other session type.
    if (activeIsTerminal && !isCustomKeyboardVisible) {
      callImeInput(hiddenInputRef, "clear");
    }
    compositionActiveRef.current = false;
    lastSpecialKeyRef.current = null;
  }, [activeSessionId, activeSession?.type, isCustomKeyboardVisible]);

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

  const getTabBarBottomPosition = () => {
    if (!activeIsTerminal) {
      return insets.bottom;
    }

    if (isCustomKeyboardVisible) {
      return CUSTOM_KEYBOARD_TAB_HEIGHT + customKeyboardHeight;
    }

    if (keyboardIntentionallyHiddenRef.current) {
      return KEYBOARD_BAR_HEIGHT_EXTENDED;
    }

    if (isKeyboardVisible && currentKeyboardHeight > 0) {
      return KEYBOARD_BAR_HEIGHT + currentKeyboardHeight;
    }

    return KEYBOARD_BAR_HEIGHT;
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

    if (keyboardIntentionallyHiddenRef.current) {
      return SESSION_TAB_BAR_HEIGHT + KEYBOARD_BAR_HEIGHT_EXTENDED;
    }

    if (isKeyboardVisible && currentKeyboardHeight > 0) {
      return (
        SESSION_TAB_BAR_HEIGHT + KEYBOARD_BAR_HEIGHT + currentKeyboardHeight
      );
    }

    return SESSION_TAB_BAR_HEIGHT + KEYBOARD_BAR_HEIGHT;
  };

  useEffect(() => {
    const next: Record<string, React.RefObject<any>> = {};
    for (const s of sessions) {
      next[s.id] = tabRefs.current[s.id] ?? React.createRef();
    }
    tabRefs.current = next;
  }, [sessions]);

  useFocusEffect(
    React.useCallback(() => {
      if (
        sessions.length > 0 &&
        activeIsTerminal &&
        !isCustomKeyboardVisible &&
        !keyboardIntentionallyHiddenRef.current
      ) {
        const timeoutId = setTimeout(() => {
          callImeInput(hiddenInputRef, "focus");
        }, 500);
        return () => clearTimeout(timeoutId);
      }

      return () => {};
    }, [
      sessions.length,
      activeSession?.type,
      isCustomKeyboardVisible,
      keyboardIntentionallyHiddenRef,
    ]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        sessions.forEach((session) => {
          if (features.sessionHas(session.type, "terminal-input")) {
            const terminalRef = tabRefs.current[session.id];
            if (terminalRef?.current) {
              terminalRef.current.notifyForegrounded();
            }
          }
        });

        if (
          sessions.length > 0 &&
          activeIsTerminal &&
          !isCustomKeyboardVisible &&
          !keyboardIntentionallyHiddenRef.current
        ) {
          setTimeout(() => {
            callImeInput(hiddenInputRef, "focus");
          }, 500);
        }
      } else if (nextAppState === "background") {
        sessions.forEach((session) => {
          if (features.sessionHas(session.type, "terminal-input")) {
            const terminalRef = tabRefs.current[session.id];
            if (terminalRef?.current) {
              terminalRef.current.notifyBackgrounded();
            }
          }
        });
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
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setScreenDimensions(window);

      setTimeout(() => {
        const activeRef = activeSessionId
          ? tabRefs.current[activeSessionId]
          : null;
        activeRef?.current?.fit();
      }, 300);
    });

    return () => subscription?.remove();
  }, [activeSessionId]);

  useEffect(() => {
    if (keyboardHeight > 0) {
      setLastKeyboardHeight(keyboardHeight);
    }
  }, [keyboardHeight, setLastKeyboardHeight]);

  useEffect(() => {
    if (!activeSessionId || !activeIsTerminal) return;

    // Keyboard stays put while selecting. Hiding it resized the terminal and
    // made the text jump under the finger.
    const checkSelectionState = () => {
      const activeRef = tabRefs.current[activeSessionId];
      if (!activeRef?.current) return;
      isSelectingRef.current = activeRef.current.isSelecting();
    };

    const interval = setInterval(checkSelectionState, 50);
    return () => clearInterval(interval);
  }, [activeSessionId, activeSession?.type]);

  useEffect(() => {
    const activeRef = activeSessionId ? tabRefs.current[activeSessionId] : null;
    if (activeRef && activeRef.current) {
      setTimeout(() => {
        activeRef.current?.fit();
      }, 100);
    }
  }, [
    keyboardHeight,
    activeSessionId,
    screenDimensions,
    isCustomKeyboardVisible,
    customKeyboardHeight,
  ]);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
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

  useFocusEffect(
    React.useCallback(() => {
      if (
        sessions.length > 0 &&
        activeIsTerminal &&
        !isCustomKeyboardVisible &&
        !keyboardIntentionallyHiddenRef.current
      ) {
        setTimeout(() => {
          callImeInput(hiddenInputRef, "focus");
          const activeRef = activeSessionId
            ? tabRefs.current[activeSessionId]
            : null;
          activeRef?.current?.fit();
        }, 0);
      }
    }, [
      sessions.length,
      activeSessionId,
      activeSession?.type,
      isCustomKeyboardVisible,
      keyboardIntentionallyHiddenRef,
    ]),
  );

  const handleTabPress = (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    setKeyboardIntentionallyHidden(false);

    setActiveSession(sessionId);
    setTimeout(() => {
      if (
        features.sessionHas(session?.type, "terminal-input") &&
        !isCustomKeyboardVisible
      ) {
        callImeInput(hiddenInputRef, "focus");
      }
    }, 100);
  };

  const handleTabClose = (sessionId: string) => {
    removeSession(sessionId);
    setTimeout(() => {
      if (activeIsTerminal && !isCustomKeyboardVisible && sessions.length > 1) {
        callImeInput(hiddenInputRef, "focus");
      }
    }, 100);
  };

  const closeConnectionsPanel = useCallback(() => {
    setShowConnectionsPanel(false);
    if (activeIsTerminal && !isCustomKeyboardVisible) {
      setKeyboardIntentionallyHidden(false);
      setTimeout(() => callImeInput(hiddenInputRef, "focus"), 100);
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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    if (isCustomKeyboardVisible) {
      setCustomKeyboardInitialTab("keyboard");
      toggleCustomKeyboard();
      setKeyboardIntentionallyHidden(false);
      setTimeout(() => {
        callImeInput(hiddenInputRef, "focus");
      }, 50);
      setTimeout(() => {
        const activeRef = activeSessionId
          ? tabRefs.current[activeSessionId]
          : null;
        if (activeRef?.current) {
          activeRef.current.fit();
          setTimeout(() => {
            activeRef.current?.scrollToBottom();
          }, 50);
        }
      }, 300);
    } else {
      toggleCustomKeyboard();
      setKeyboardIntentionallyHidden(false);
      requestAnimationFrame(() => {
        callImeInput(hiddenInputRef, "blur");
      });
      setTimeout(() => {
        const activeRef = activeSessionId
          ? tabRefs.current[activeSessionId]
          : null;
        if (activeRef?.current) {
          activeRef.current.fit();
          setTimeout(() => {
            activeRef.current?.scrollToBottom();
          }, 50);
        }
      }, 300);
    }
  };

  const handleOpenSnippets = useCallback(() => {
    setCustomKeyboardInitialTab("snippets");
    if (!isCustomKeyboardVisible) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      toggleCustomKeyboard();
      setKeyboardIntentionallyHidden(false);
      requestAnimationFrame(() => {
        callImeInput(hiddenInputRef, "blur");
      });
      setTimeout(() => {
        const activeRef = activeSessionId
          ? tabRefs.current[activeSessionId]
          : null;
        if (activeRef?.current) {
          activeRef.current.fit();
          setTimeout(() => activeRef.current?.scrollToBottom(), 50);
        }
      }, 300);
    }
  }, [
    isCustomKeyboardVisible,
    toggleCustomKeyboard,
    setKeyboardIntentionallyHidden,
    activeSessionId,
  ]);

  const handleModifierChange = useCallback((modifiers: ActiveModifiers) => {
    setActiveModifiers(modifiers);
  }, []);

  const activeTerminalBgColor =
    activeIsTerminal && activeSessionId
      ? terminalBackgroundColors[activeSessionId] || ui.terminal
      : ui.background;

  const renderSession = (session: TerminalSession) => {
    const Tab = features.sessionTab(session.type)?.component;
    if (!Tab) return null;
    return (
      <Tab
        ref={tabRefs.current[session.id]}
        session={session}
        isVisible={session.id === activeSessionId}
        onClose={() => handleTabClose(session.id)}
        onBackendSessionId={(backendId) =>
          setBackendSessionId(session.id, backendId)
        }
        onBackgroundColorChange={(color) => {
          setTerminalBackgroundColors((prev) => ({
            ...prev,
            [session.id]: color,
          }));
        }}
      />
    );
  };

  return (
    <View
      className="flex-1"
      style={{
        paddingTop: insets.top,
        backgroundColor: activeIsTerminal
          ? activeTerminalBgColor
          : ui.background,
      }}
    >
      <View
        style={{
          flex: 1,
          marginBottom: getBottomMargin(activeSession?.type),
        }}
      >
        {sessions.map((session) => (
          <SessionAccountProvider
            key={session.id}
            accountId={session.accountId}
          >
            {renderSession(session)}
          </SessionAccountProvider>
        ))}
      </View>

      {/* Connections panel: full screen when no sessions, overlay when sessions exist */}
      {(sessions.length === 0 || showConnectionsPanel) && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1010,
          }}
        >
          {sessions.length === 0 ? (
            <Screen title="Connections">
              <ConnectionsPanel />
            </Screen>
          ) : (
            <View style={{ flex: 1, backgroundColor: ui.background }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingTop: insets.top + 8,
                  paddingBottom: 8,
                  paddingHorizontal: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: ui.border,
                  backgroundColor: ui.background,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text weight="bold" className="text-base text-foreground">
                    Connections
                  </Text>
                </View>
                <Pressable
                  onPress={closeConnectionsPanel}
                  hitSlop={10}
                  style={{
                    width: 32,
                    height: 32,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: ui.border,
                    backgroundColor: ui.muted,
                  }}
                >
                  <X size={15} color={ui.text} />
                </Pressable>
              </View>
              <ConnectionsPanel onClose={closeConnectionsPanel} />
            </View>
          )}
        </View>
      )}

      {sessions.length > 0 && activeIsTerminal && !isCustomKeyboardVisible && (
        <View
          style={{
            position: "absolute",
            bottom: keyboardIntentionallyHiddenRef.current
              ? 0
              : isKeyboardVisible && currentKeyboardHeight > 0
                ? currentKeyboardHeight + (isLandscape && !isIPad ? 4 : 0)
                : 0,
            left: 0,
            right: 0,
            height: keyboardIntentionallyHiddenRef.current
              ? KEYBOARD_BAR_HEIGHT_EXTENDED
              : KEYBOARD_BAR_HEIGHT,
            zIndex: 1003,
            overflow: "visible",
            justifyContent: "center",
          }}
        >
          <KeyboardBar
            terminalRef={
              activeSessionId
                ? tabRefs.current[activeSessionId]
                : React.createRef<TerminalHandle>()
            }
            isVisible={true}
            onModifierChange={handleModifierChange}
            isKeyboardIntentionallyHidden={
              keyboardIntentionallyHiddenRef.current
            }
            bottomInset={KEYBOARD_BAR_BOTTOM_INSET}
            onOpenSnippets={handleOpenSnippets}
          />
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
          hiddenInputRef={hiddenInputRef}
          onHideKeyboard={() => setKeyboardIntentionallyHidden(true)}
          onShowKeyboard={() => setKeyboardIntentionallyHidden(false)}
          keyboardIntentionallyHiddenRef={keyboardIntentionallyHiddenRef}
          activeSessionType={activeSession?.type}
          onShowConnections={() => {
            setKeyboardIntentionallyHidden(true);
            Keyboard.dismiss();
            callImeInput(hiddenInputRef, "blur");
            setShowConnectionsPanel(true);
          }}
          hasBackgroundSessions={backgroundTabRecords.some(
            (r) => !sessions.find((s) => s.instanceId === r.id),
          )}
        />
      </View>

      {activeSession && isCustomKeyboardVisible && activeIsTerminal && (
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
                activeSessionId
                  ? tabRefs.current[activeSessionId]
                  : React.createRef<TerminalHandle>()
              }
              isVisible={isCustomKeyboardVisible}
              keyboardHeight={customKeyboardHeight}
              isKeyboardIntentionallyHidden={
                keyboardIntentionallyHiddenRef.current
              }
              initialTab={customKeyboardInitialTab}
              hostId={activeSession?.host?.id}
            />
          </SessionAccountProvider>
        </View>
      )}

      {sessions.length > 0 && !isCustomKeyboardVisible && activeIsTerminal && (
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
            const isDialogOpen = activeRef?.current?.isDialogOpen?.() || false;
            const isCurrentlySelecting =
              activeRef?.current?.isSelecting?.() || false;

            if (
              !keyboardIntentionallyHiddenRef.current &&
              !isCustomKeyboardVisible &&
              activeIsTerminal &&
              !isDialogOpen &&
              !isCurrentlySelecting &&
              !isSelectingRef.current
            ) {
              requestAnimationFrame(() => {
                const stillNotSelecting = !activeRef?.current?.isSelecting?.();
                if (stillNotSelecting) {
                  callImeInput(hiddenInputRef, "focus");
                }
              });
            }
          }}
        />
      )}
    </View>
  );
}
