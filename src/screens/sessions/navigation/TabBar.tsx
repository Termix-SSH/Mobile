import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Keyboard,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  X,
  ArrowLeft,
  Plus,
  Minus,
  ChevronDown,
  ChevronUp,
  SquareTerminal,
  Layers,
} from "lucide-react-native";
import {
  SessionType,
  TerminalSession,
} from "@/contexts/TerminalSessionsContext";
import { useRouter } from "expo-router";
import { isSecondaryClick } from "@/ui/ContextMenu";
import { useOrientation } from "@/utils/orientation";
import { getTabBarHeight, getButtonSize } from "@/utils/responsive";
import { useUiColors } from "@/contexts/ThemeContext";
import { features } from "@/core/features";
import { displayTitle } from "@/contexts/session-tabs";
import { useSessionStatuses } from "@/core/sessions/status";
import { statusLabel, TabStatusMark } from "./TabStatusMark";
import DraggableFlatList, {
  ScaleDecorator,
} from "react-native-draggable-flatlist";

function getSessionIcon(type: SessionType) {
  return features.sessionTab(type)?.icon ?? SquareTerminal;
}

interface TabBarProps {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  onTabPress: (sessionId: string) => void;
  onTabClose: (sessionId: string) => void;
  onAddSession?: () => void;
  onToggleKeyboard?: () => void;
  isCustomKeyboardVisible: boolean;
  /** Shows or hides the keyboard on the active terminal. */
  onKeyboard: (action: "focus" | "blur") => void;
  onHideKeyboard?: () => void;
  onShowKeyboard?: () => void;
  keyboardIntentionallyHiddenRef: React.MutableRefObject<boolean>;
  activeSessionType?: SessionType;
  onShowConnections?: () => void;
  hasBackgroundSessions?: boolean;
  /** Tapping the active tab opens its menu. */
  onTabMenu?: (sessionId: string) => void;
  onTabMove?: (sessionId: string, toIndex: number) => void;
}

export default function TabBar({
  sessions,
  activeSessionId,
  onTabPress,
  onTabClose,
  onToggleKeyboard,
  isCustomKeyboardVisible,
  onKeyboard,
  onHideKeyboard,
  onShowKeyboard,
  keyboardIntentionallyHiddenRef,
  activeSessionType,
  onShowConnections,
  onTabMenu,
  onTabMove,
}: TabBarProps) {
  const ui = useUiColors();
  const statuses = useSessionStatuses();
  const router = useRouter();
  const { isLandscape } = useOrientation();
  const insets = useSafeAreaInsets();

  const tabBarHeight = getTabBarHeight(isLandscape);
  const buttonSize = getButtonSize(isLandscape);

  const needsBottomPadding = !features.sessionHas(
    activeSessionType,
    "terminal-input",
  );

  const handleToggleSystemKeyboard = () => {
    if (keyboardIntentionallyHiddenRef.current) {
      onShowKeyboard?.();
      setTimeout(() => {
        onKeyboard("focus");
      }, 50);
    } else {
      onHideKeyboard?.();
      // Keyboard.dismiss() only reaches RN text inputs; the terminal keeps
      // the keyboard up until it is blurred.
      onKeyboard("blur");
      Keyboard.dismiss();
    }
  };

  if (sessions.length === 0) {
    return null;
  }

  const hasInput = features.sessionHas(activeSessionType, "terminal-input");
  const iconSize = isLandscape ? 16 : 18;

  return (
    <View
      style={{
        backgroundColor: ui.background,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: ui.border,
        height: tabBarHeight + (needsBottomPadding ? insets.bottom : 0),
        paddingBottom: needsBottomPadding ? insets.bottom : 0,
      }}
      focusable={false}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          height: tabBarHeight,
          paddingHorizontal: 6,
          gap: isLandscape ? 4 : 6,
        }}
      >
        <BarButton
          label="Connections"
          size={buttonSize}
          onPress={() => onShowConnections?.()}
        >
          <Layers size={iconSize} color={ui.text} />
        </BarButton>
        <BarButton
          label="Back to hosts"
          size={buttonSize}
          onPress={() => router.navigate("/hosts" as any)}
        >
          <ArrowLeft size={iconSize} color={ui.text} />
        </BarButton>

        <View style={{ flex: 1, justifyContent: "center" }}>
          <DraggableFlatList
            horizontal
            data={sessions}
            keyExtractor={(session) => session.id}
            keyboardShouldPersistTaps="always"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 4, alignItems: "center" }}
            activationDistance={8}
            onDragEnd={({ data, from, to }) => {
              if (from !== to) onTabMove?.(data[to].id, to);
            }}
            renderItem={({ item: session, drag, isActive: dragging }) => {
              const isActive = session.id === activeSessionId;
              const SessionIcon = getSessionIcon(session.type);
              const title = displayTitle(session);
              const status = statuses[session.id]?.state;
              const statusText = statusLabel(status);
              return (
                <ScaleDecorator>
                  <TouchableOpacity
                    onPress={() =>
                      isActive && onTabMenu
                        ? onTabMenu(session.id)
                        : onTabPress(session.id)
                    }
                    onLongPress={drag}
                    delayLongPress={250}
                    disabled={dragging}
                    focusable={false}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={
                      statusText ? `${title}, ${statusText}` : title
                    }
                    accessibilityHint={
                      isActive
                        ? "Tap for tab options, hold to move"
                        : "Hold to move"
                    }
                    className="flex-row items-center"
                    activeOpacity={0.7}
                    style={{
                      backgroundColor:
                        isActive || dragging ? ui.card : "transparent",
                      // The open tab gets a brand line, like core's tab bar.
                      borderBottomWidth: 2,
                      borderBottomColor: isActive ? ui.brand : "transparent",
                      minWidth: isLandscape ? 88 : 104,
                      maxWidth: 200,
                      height: buttonSize,
                    }}
                  >
                    <View
                      className="flex-1 flex-row items-center gap-1.5 pl-2.5"
                      style={{ height: buttonSize }}
                      onPointerDown={(e) => {
                        if (isSecondaryClick(e.nativeEvent)) {
                          onTabMenu?.(session.id);
                        }
                      }}
                    >
                      <SessionIcon
                        size={isLandscape ? 12 : 13}
                        color={isActive ? ui.brand : ui.textMuted}
                        strokeWidth={2}
                      />
                      <Text
                        className="flex-1 text-xs font-medium"
                        style={{ color: isActive ? ui.text : ui.textMuted }}
                        numberOfLines={1}
                      >
                        {title}
                      </Text>
                      <TabStatusMark state={status} />
                    </View>
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        onTabClose(session.id);
                      }}
                      focusable={false}
                      accessibilityRole="button"
                      accessibilityLabel={`Close ${title}`}
                      className="items-center justify-center"
                      activeOpacity={0.6}
                      style={{
                        width: isLandscape ? 28 : 32,
                        height: buttonSize,
                      }}
                    >
                      <X
                        size={isLandscape ? 13 : 14}
                        color={isActive ? ui.textMuted : ui.textFaint}
                        strokeWidth={2.5}
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>
                </ScaleDecorator>
              );
            }}
          />
        </View>

        {hasInput && !isCustomKeyboardVisible ? (
          <BarButton
            label={
              keyboardIntentionallyHiddenRef.current
                ? "Show keyboard"
                : "Hide keyboard"
            }
            size={buttonSize}
            onPress={handleToggleSystemKeyboard}
          >
            {keyboardIntentionallyHiddenRef.current ? (
              <ChevronUp size={iconSize} color={ui.text} />
            ) : (
              <ChevronDown size={iconSize} color={ui.text} />
            )}
          </BarButton>
        ) : null}

        {hasInput ? (
          <BarButton
            label={
              isCustomKeyboardVisible ? "Hide keys panel" : "Show keys panel"
            }
            size={buttonSize}
            active={isCustomKeyboardVisible}
            onPress={() => onToggleKeyboard?.()}
          >
            {isCustomKeyboardVisible ? (
              <Minus size={iconSize} color={ui.brand} />
            ) : (
              <Plus size={iconSize} color={ui.text} />
            )}
          </BarButton>
        ) : null}
      </View>
    </View>
  );
}

/** A square bar button, flat like the app's muted Button. */
function BarButton({
  label,
  size,
  active = false,
  onPress,
  children,
}: {
  label: string;
  size: number;
  active?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const ui = useUiColors();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      focusable={false}
      className="items-center justify-center"
      activeOpacity={0.6}
      style={{
        width: size,
        height: size,
        backgroundColor: active ? `${ui.brand}26` : ui.muted,
      }}
    >
      {children}
    </TouchableOpacity>
  );
}
