import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  TouchableWithoutFeedback,
  Pressable,
  Dimensions,
  BackHandler,
  AppState,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useTerminalSessions } from "@/app/contexts/TerminalSessionsContext";
import { useKeyboard } from "@/app/contexts/KeyboardContext";
import { Terminal, TerminalHandle } from "@/app/Tabs/Sessions/Terminal";
import {
  ServerStats,
  ServerStatsHandle,
} from "@/app/Tabs/Sessions/ServerStats";
import {
  FileManager,
  FileManagerHandle,
} from "@/app/Tabs/Sessions/FileManager";
import TabBar from "@/app/Tabs/Sessions/Navigation/TabBar";
import BottomToolbar from "@/app/Tabs/Sessions/BottomToolbar";
import KeyboardBar from "@/app/Tabs/Sessions/KeyboardBar";
import { ArrowLeft } from "lucide-react-native";
import { useOrientation } from "@/app/utils/orientation";
import { getMaxKeyboardHeight, getTabBarHeight } from "@/app/utils/responsive";
import { BACKGROUNDS, BORDER_COLORS, BORDERS } from "@/app/constants/designTokens";

export default function Sessions() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height, isLandscape } = useOrientation();
  const {
    sessions,
    activeSessionId,
    setActiveSession,
    removeSession,
    isCustomKeyboardVisible,
    toggleCustomKeyboard,
    lastKeyboardHeight,
    setLastKeyboardHeight,
    keyboardIntentionallyHiddenRef,
    setKeyboardIntentionallyHidden,
  } = useTerminalSessions();
  const { keyboardHeight, isKeyboardVisible } = useKeyboard();
  const hiddenInputRef = useRef<TextInput>(null);
  const terminalRefs = useRef<Record<string, React.RefObject<TerminalHandle>>>(
    {},
  );
  const statsRefs = useRef<Record<string, React.RefObject<ServerStatsHandle>>>(
    {},
  );
  const fileManagerRefs = useRef<
    Record<string, React.RefObject<FileManagerHandle>>
  >({});
  const [activeModifiers, setActiveModifiers] = useState({
    ctrl: false,
    alt: false,
  });
  const [screenDimensions, setScreenDimensions] = useState(
    Dimensions.get("window"),
  );
  const [keyboardType, setKeyboardType] = useState<any>("default");
  const lastBlurTimeRef = useRef<number>(0);

  // Calculate responsive keyboard heights and margins
  const maxKeyboardHeight = getMaxKeyboardHeight(height, isLandscape);
  const effectiveKeyboardHeight = isLandscape
    ? Math.min(lastKeyboardHeight, maxKeyboardHeight)
    : lastKeyboardHeight;
  const currentKeyboardHeight = isLandscape
    ? Math.min(keyboardHeight, maxKeyboardHeight)
    : keyboardHeight;

  // Custom keyboard height MUST match BottomToolbar.tsx calculation (line 34)
  const customKeyboardHeight = Math.max(200, Math.min(effectiveKeyboardHeight, 500));

  // Component height constants (responsive to landscape)
  const SESSION_TAB_BAR_HEIGHT = getTabBarHeight(isLandscape) + 2; // Content height + 2px top border (BORDERS.MAJOR)
  const CUSTOM_KEYBOARD_TAB_HEIGHT = 36;
  // KeyboardBar heights: paddingVertical (6px landscape, 8px portrait) + 36px key + paddingBottom when hidden
  const KEYBOARD_BAR_HEIGHT = isLandscape ? 48 : 52; // 6+36+6=48 landscape, 8+36+8=52 portrait
  const KEYBOARD_BAR_HEIGHT_EXTENDED = isLandscape ? 64 : 68; // +16px extra paddingBottom when hidden

  // Helper function to calculate TabBar bottom position
  const getTabBarBottomPosition = () => {
    // Non-terminal sessions: sits at bottom with safe area padding
    if (activeSession?.type !== "terminal") {
      return insets.bottom;
    }

    // Terminal session positioning - TabBar sits above KeyboardBar and any keyboards
    // PRIORITY 1: Custom keyboard (check FIRST to avoid race condition)
    if (isCustomKeyboardVisible) {
      // Above BottomToolbar only (KeyboardBar hidden when custom keyboard visible)
      return CUSTOM_KEYBOARD_TAB_HEIGHT + customKeyboardHeight;
    }

    // PRIORITY 2: Keyboard intentionally hidden (chevron down)
    if (keyboardIntentionallyHiddenRef.current) {
      return KEYBOARD_BAR_HEIGHT_EXTENDED;
    }

    // PRIORITY 3: System keyboard visible
    if (isKeyboardVisible && currentKeyboardHeight > 0) {
      return KEYBOARD_BAR_HEIGHT + currentKeyboardHeight;
    }

    // DEFAULT: Just above keyboard bar (no keyboard showing)
    return KEYBOARD_BAR_HEIGHT;
  };

  // Calculate bottom margins for content (terminal content area)
  const getBottomMargin = (
    sessionType: "terminal" | "stats" | "filemanager" = "terminal",
  ) => {
    // For non-terminal sessions, just the session tab bar + bottom safe area
    if (sessionType !== "terminal") {
      return SESSION_TAB_BAR_HEIGHT + insets.bottom;
    }

    // PRIORITY 1: Custom keyboard (check FIRST to avoid race condition)
    if (isCustomKeyboardVisible) {
      // BottomToolbar replaces KeyboardBar entirely - calculate from scratch
      return SESSION_TAB_BAR_HEIGHT + CUSTOM_KEYBOARD_TAB_HEIGHT + customKeyboardHeight;
    }

    // PRIORITY 2: Keyboard intentionally hidden (chevron down)
    if (keyboardIntentionallyHiddenRef.current) {
      return SESSION_TAB_BAR_HEIGHT + KEYBOARD_BAR_HEIGHT_EXTENDED;
    }

    // PRIORITY 3: System keyboard visible
    if (isKeyboardVisible && currentKeyboardHeight > 0) {
      return SESSION_TAB_BAR_HEIGHT + KEYBOARD_BAR_HEIGHT + currentKeyboardHeight;
    }

    // DEFAULT: Just KeyboardBar visible (no keyboard showing)
    return SESSION_TAB_BAR_HEIGHT + KEYBOARD_BAR_HEIGHT;
  };

  useEffect(() => {
    const terminalMap: Record<string, React.RefObject<TerminalHandle>> = {
      ...terminalRefs.current,
    };
    const statsMap: Record<string, React.RefObject<ServerStatsHandle>> = {
      ...statsRefs.current,
    };
    const fileManagerMap: Record<string, React.RefObject<FileManagerHandle>> = {
      ...fileManagerRefs.current,
    };

    sessions.forEach((s) => {
      if (s.type === "terminal" && !terminalMap[s.id]) {
        terminalMap[s.id] =
          React.createRef<TerminalHandle>() as React.RefObject<TerminalHandle>;
      } else if (s.type === "stats" && !statsMap[s.id]) {
        statsMap[s.id] =
          React.createRef<ServerStatsHandle>() as React.RefObject<ServerStatsHandle>;
      } else if (s.type === "filemanager" && !fileManagerMap[s.id]) {
        fileManagerMap[s.id] =
          React.createRef<FileManagerHandle>() as React.RefObject<FileManagerHandle>;
      }
    });

    Object.keys(terminalMap).forEach((id) => {
      if (!sessions.find((s) => s.id === id && s.type === "terminal")) {
        delete terminalMap[id];
      }
    });

    Object.keys(statsMap).forEach((id) => {
      if (!sessions.find((s) => s.id === id && s.type === "stats")) {
        delete statsMap[id];
      }
    });

    Object.keys(fileManagerMap).forEach((id) => {
      if (!sessions.find((s) => s.id === id && s.type === "filemanager")) {
        delete fileManagerMap[id];
      }
    });

    terminalRefs.current = terminalMap;
    statsRefs.current = statsMap;
    fileManagerRefs.current = fileManagerMap;
  }, [sessions]);

  useFocusEffect(
    React.useCallback(() => {
      if (
        sessions.length > 0 &&
        activeSession?.type === "terminal" &&
        !isCustomKeyboardVisible &&
        !keyboardIntentionallyHiddenRef.current
      ) {
        const timeoutId = setTimeout(() => {
          hiddenInputRef.current?.focus();
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
        if (
          sessions.length > 0 &&
          activeSession?.type === "terminal" &&
          !isCustomKeyboardVisible &&
          !keyboardIntentionallyHiddenRef.current
        ) {
          setTimeout(() => {
            hiddenInputRef.current?.focus();
          }, 300);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [sessions.length, activeSession?.type, isCustomKeyboardVisible]);

  useEffect(() => {
    if (Platform.OS === "android" && sessions.length > 0) {
      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          if (isKeyboardVisible) {
            setKeyboardIntentionallyHidden(true);
            Keyboard.dismiss();
            return true;
          }
          return true;
        },
      );

      return () => {
        backHandler.remove();
      };
    }
  }, [sessions.length, isKeyboardVisible]);

  // Remove the auto-focus after 3 seconds - it causes keyboard flickering
  // useEffect(() => {
  //   if (
  //     sessions.length > 0 &&
  //     !isKeyboardVisible &&
  //     !isCustomKeyboardVisible &&
  //     !keyboardIntentionallyHiddenRef.current
  //   ) {
  //     const timeoutId = setTimeout(() => {
  //       hiddenInputRef.current?.focus();
  //     }, 3000);
  //     return () => clearTimeout(timeoutId);
  //   }
  // }, [
  //   isKeyboardVisible,
  //   sessions.length,
  //   isCustomKeyboardVisible,
  //   keyboardIntentionallyHiddenRef,
  // ]);

  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setScreenDimensions(window);

      setTimeout(() => {
        const activeRef = activeSessionId
          ? terminalRefs.current[activeSessionId]
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
    const activeRef = activeSessionId
      ? terminalRefs.current[activeSessionId]
      : null;
    if (activeRef && activeRef.current) {
      setTimeout(() => {
        activeRef.current?.fit();
      }, 0);
    }
  }, [keyboardHeight, activeSessionId, screenDimensions]);

  useFocusEffect(
    React.useCallback(() => {
      if (
        sessions.length > 0 &&
        activeSession?.type === "terminal" &&
        !isCustomKeyboardVisible &&
        !keyboardIntentionallyHiddenRef.current
      ) {
        setTimeout(() => {
          hiddenInputRef.current?.focus();
          const activeRef = activeSessionId
            ? terminalRefs.current[activeSessionId]
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
      if (session?.type === "terminal" && !isCustomKeyboardVisible) {
        hiddenInputRef.current?.focus();
      }
    }, 100);
  };

  const handleTabClose = (sessionId: string) => {
    removeSession(sessionId);
    setTimeout(() => {
      if (
        activeSession?.type === "terminal" &&
        !isCustomKeyboardVisible &&
        sessions.length > 1
      ) {
        hiddenInputRef.current?.focus();
      }
    }, 100);
  };

  const handleAddSession = () => {
    router.navigate("/hosts" as any);
  };

  const handleToggleKeyboard = () => {
    if (isCustomKeyboardVisible) {
      // Closing custom keyboard - reopen system keyboard
      toggleCustomKeyboard();
      setKeyboardIntentionallyHidden(false);
      setTimeout(() => {
        hiddenInputRef.current?.focus();
      }, 150);
    } else {
      // Opening custom keyboard - toggle state first, then blur to prevent auto-refocus
      toggleCustomKeyboard(); // Update state immediately
      setKeyboardIntentionallyHidden(false);
      // Blur on next frame after state updates to prevent onBlur from refocusing
      requestAnimationFrame(() => {
        hiddenInputRef.current?.blur();
      });
    }
  };

  const handleModifierChange = useCallback(
    (modifiers: { ctrl: boolean; alt: boolean }) => {
      setActiveModifiers(modifiers);
    },
    [],
  );

  const activeSession = sessions.find(
    (session) => session.id === activeSessionId,
  );

  return (
    <View
      className="flex-1"
      style={{
        paddingTop: insets.top,
        backgroundColor:
          activeSession?.type === "terminal"
            ? BACKGROUNDS.DARKEST // Terminal: #09090b
            : activeSession?.type === "filemanager"
              ? BACKGROUNDS.HEADER // FileManager: #131316
              : "#18181b", // Stats: default app bg
      }}
    >
      <View
        style={{
          flex: 1,
          marginBottom: getBottomMargin(activeSession?.type),
        }}
      >
        {sessions.map((session) => {
          if (session.type === "terminal") {
            return (
              <Terminal
                key={session.id}
                ref={terminalRefs.current[session.id]}
                hostConfig={{
                  id: parseInt(session.host.id.toString()),
                  name: session.host.name,
                  ip: session.host.ip,
                  port: parseInt(session.host.port.toString()),
                  username: session.host.username,
                  authType: session.host.authType,
                  password: session.host.password,
                  key: session.host.key,
                  keyPassword: session.host.keyPassword,
                  keyType: session.host.keyType,
                  credentialId: session.host.credentialId
                    ? parseInt(session.host.credentialId.toString())
                    : undefined,
                }}
                isVisible={session.id === activeSessionId}
                title={session.title}
                onClose={() => handleTabClose(session.id)}
              />
            );
          } else if (session.type === "stats") {
            return (
              <ServerStats
                key={session.id}
                ref={statsRefs.current[session.id]}
                hostConfig={{
                  id: parseInt(session.host.id.toString()),
                  name: session.host.name,
                }}
                isVisible={session.id === activeSessionId}
                title={session.title}
                onClose={() => handleTabClose(session.id)}
              />
            );
          } else if (session.type === "filemanager") {
            return (
              <FileManager
                key={session.id}
                ref={fileManagerRefs.current[session.id]}
                host={session.host}
                sessionId={session.id}
                isVisible={session.id === activeSessionId}
              />
            );
          }
          return null;
        })}
      </View>

      {sessions.length === 0 && (
        <View
          style={{
            position: "absolute",
            top: insets.top,
            left: 0,
            right: 0,
            bottom: 115,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 24,
            pointerEvents: "box-none",
            zIndex: 1005,
          }}
        >
          <View
            style={{
              backgroundColor: BACKGROUNDS.CARD,
              borderRadius: 12,
              padding: 32,
              alignItems: "center",
              borderWidth: 1,
              borderColor: BORDER_COLORS.PRIMARY,
              minWidth: 280,
              maxWidth: 400,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
              elevation: 8,
              pointerEvents: "box-none",
            }}
          >
            <Text
              style={{
                color: "#ffffff",
                fontSize: 20,
                fontWeight: "600",
                marginBottom: 12,
                textAlign: "center",
              }}
            >
              No Active Terminal Sessions
            </Text>
            <Text
              style={{
                color: "#9CA3AF",
                fontSize: 14,
                lineHeight: 20,
                textAlign: "center",
                marginBottom: 20,
              }}
            >
              Connect to a host from the Hosts tab to start a terminal session
            </Text>
            <View
              style={{
                backgroundColor: "#22C55E",
                paddingHorizontal: 32,
                paddingVertical: 16,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "#16A34A",
                minHeight: 48,
                minWidth: 120,
                justifyContent: "center",
                alignItems: "center",
                zIndex: 1004,
              }}
              onTouchEnd={() => {
                handleAddSession();
              }}
            >
              <Text
                style={{
                  color: "#ffffff",
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                Go to Hosts
              </Text>
            </View>
          </View>
        </View>
      )}

      {sessions.length > 0 && activeSession?.type === "terminal" && !isCustomKeyboardVisible && (
        <View
          style={{
            position: "absolute",
            bottom: keyboardIntentionallyHiddenRef.current
              ? 0
              : isKeyboardVisible && currentKeyboardHeight > 0
                ? currentKeyboardHeight + (isLandscape ? 4 : 0)
                : 0,
            left: 0,
            right: 0,
            height: keyboardIntentionallyHiddenRef.current ? KEYBOARD_BAR_HEIGHT_EXTENDED : KEYBOARD_BAR_HEIGHT,
            zIndex: 1003,
            overflow: "visible",
            justifyContent: "center",
          }}
        >
          <KeyboardBar
            terminalRef={
              activeSessionId
                ? terminalRefs.current[activeSessionId]
                : React.createRef<TerminalHandle>()
            }
            isVisible={true}
            onModifierChange={handleModifierChange}
            isKeyboardIntentionallyHidden={
              keyboardIntentionallyHiddenRef.current
            }
          />
        </View>
      )}

      {sessions.length > 0 &&
        (activeSession?.type === "stats" ||
          activeSession?.type === "filemanager") &&
        isCustomKeyboardVisible && (
          <View
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: effectiveKeyboardHeight,
              backgroundColor: BACKGROUNDS.DARKEST,
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
        />
      </View>

      {sessions.length > 0 &&
        isCustomKeyboardVisible &&
        activeSession?.type === "terminal" && (
          <View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 1002,
            }}
          >
            <BottomToolbar
              terminalRef={
                activeSessionId
                  ? terminalRefs.current[activeSessionId]
                  : React.createRef<TerminalHandle>()
              }
              isVisible={isCustomKeyboardVisible}
              keyboardHeight={customKeyboardHeight}
              isKeyboardIntentionallyHidden={
                keyboardIntentionallyHiddenRef.current
              }
            />
          </View>
        )}

      {sessions.length > 0 &&
        !isCustomKeyboardVisible &&
        activeSession?.type === "terminal" && (
          <TextInput
            ref={hiddenInputRef}
            style={{
              position: "absolute",
              bottom: currentKeyboardHeight > 0 ? currentKeyboardHeight : 0,
              left: 0,
              width: 1,
              height: 1,
              opacity: 0,
              color: "transparent",
              backgroundColor: "transparent",
              zIndex: 1001,
            }}
            pointerEvents="none"
            autoFocus={false}
            showSoftInputOnFocus={true}
            keyboardType={keyboardType}
            returnKeyType="default"
            blurOnSubmit={false}
            editable={true}
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            textContentType="none"
            caretHidden
            contextMenuHidden
            underlineColorAndroid="transparent"
            multiline
            onChangeText={() => {
              // Do nothing - we handle input in onKeyPress only
            }}
            onKeyPress={({ nativeEvent }) => {
              const key = nativeEvent.key;
              const activeRef = activeSessionId
                ? terminalRefs.current[activeSessionId]
                : null;

              if (!activeRef?.current) return;

              let finalKey = key;

              // Handle modifiers
              if (activeModifiers.ctrl) {
                switch (key.toLowerCase()) {
                  case "c":
                    finalKey = "\x03";
                    break;
                  case "d":
                    finalKey = "\x04";
                    break;
                  case "z":
                    finalKey = "\x1a";
                    break;
                  case "l":
                    finalKey = "\x0c";
                    break;
                  case "a":
                    finalKey = "\x01";
                    break;
                  case "e":
                    finalKey = "\x05";
                    break;
                  case "k":
                    finalKey = "\x0b";
                    break;
                  case "u":
                    finalKey = "\x15";
                    break;
                  case "w":
                    finalKey = "\x17";
                    break;
                  default:
                    if (key.length === 1) {
                      finalKey = String.fromCharCode(key.charCodeAt(0) & 0x1f);
                    }
                }
              } else if (activeModifiers.alt) {
                finalKey = `\x1b${key}`;
              }

              // Send the appropriate key
              if (key === "Enter") {
                activeRef.current.sendInput("\r");
              } else if (key === "Backspace") {
                activeRef.current.sendInput("\b");
              } else if (key.length === 1) {
                activeRef.current.sendInput(finalKey);
              }
            }}
            onFocus={() => {
              setKeyboardIntentionallyHidden(false);
            }}
            onBlur={() => {
              // Immediately refocus to prevent keyboard from closing when touching terminal
              // This prevents the flicker/dismiss that happens when touching the WebView
              if (
                !keyboardIntentionallyHiddenRef.current &&
                !isCustomKeyboardVisible &&
                activeSession?.type === "terminal"
              ) {
                // Use requestAnimationFrame for immediate refocus
                requestAnimationFrame(() => {
                  hiddenInputRef.current?.focus();
                });
              }
            }}
          />
        )}
    </View>
  );
}
