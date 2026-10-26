import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Text, TouchableOpacity, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  ScrollView,
} from "react-native-gesture-handler";
import { SquareTerminal, X } from "lucide-react-native";
import type {
  SessionType,
  TerminalSession,
} from "@/contexts/TerminalSessionsContext";
import { displayTitle } from "@/contexts/session-tabs";
import { useUiColors } from "@/contexts/ThemeContext";
import { features } from "@/core/features";
import { useSessionStatuses } from "@/core/sessions/status";
import { isSecondaryClick } from "@/ui/ContextMenu";
import { statusLabel, TabStatusMark } from "./TabStatusMark";

const GAP = 4;
const HOLD_MS = 250;

type Box = { x: number; width: number };

function getSessionIcon(type: SessionType) {
  return features.sessionTab(type)?.icon ?? SquareTerminal;
}

/** Where a dropped tab goes: the slot its center landed in. */
export function dropIndex(
  ids: string[],
  boxes: Record<string, Box>,
  id: string,
  dx: number,
): number {
  const box = boxes[id];
  if (!box) return ids.indexOf(id);
  const center = box.x + box.width / 2 + dx;
  return ids.filter((other) => {
    if (other === id) return false;
    const b = boxes[other];
    return b ? b.x + b.width / 2 < center : false;
  }).length;
}

/** The open tabs, sized to their titles. Hold one to drag it to a new place. */
export function TabStrip({
  sessions,
  activeSessionId,
  compact,
  height,
  onTabPress,
  onTabClose,
  onTabMenu,
  onTabMove,
}: {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  /** Smaller tabs, like a phone held sideways. */
  compact: boolean;
  height: number;
  onTabPress: (id: string) => void;
  onTabClose: (id: string) => void;
  onTabMenu?: (id: string) => void;
  onTabMove?: (id: string, toIndex: number) => void;
}) {
  const statuses = useSessionStatuses();
  const scroll = useRef<ScrollView>(null);
  const boxes = useRef<Record<string, Box>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [laidOut, setLaidOut] = useState(0);
  const ids = sessions.map((s) => s.id);

  // Keep the open tab in view when it changes or tabs come and go.
  const idsKey = ids.join("|");
  useEffect(() => {
    const box = activeSessionId ? boxes.current[activeSessionId] : null;
    if (!box) return;
    scroll.current?.scrollTo({ x: Math.max(0, box.x - 24), animated: true });
  }, [activeSessionId, idsKey, laidOut]);

  return (
    <ScrollView
      ref={scroll}
      horizontal
      scrollEnabled={!dragging}
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      contentContainerStyle={{ alignItems: "center", gap: GAP }}
    >
      {sessions.map((session) => (
        <Tab
          key={session.id}
          session={session}
          active={session.id === activeSessionId}
          compact={compact}
          height={height}
          status={statuses[session.id]?.state}
          lifted={dragging === session.id}
          onLayout={(box) => {
            const old = boxes.current[session.id];
            boxes.current[session.id] = box;
            if (!old || old.x !== box.x || old.width !== box.width) {
              setLaidOut((n) => n + 1);
            }
          }}
          onPress={() =>
            session.id === activeSessionId && onTabMenu
              ? onTabMenu(session.id)
              : onTabPress(session.id)
          }
          onClose={() => onTabClose(session.id)}
          onMenu={() => onTabMenu?.(session.id)}
          onDragStart={() => setDragging(session.id)}
          onDrop={(dx) => {
            setDragging(null);
            const to = dropIndex(ids, boxes.current, session.id, dx);
            if (to !== ids.indexOf(session.id)) onTabMove?.(session.id, to);
          }}
        />
      ))}
    </ScrollView>
  );
}

function Tab({
  session,
  active,
  compact,
  height,
  status,
  lifted,
  onLayout,
  onPress,
  onClose,
  onMenu,
  onDragStart,
  onDrop,
}: {
  session: TerminalSession;
  active: boolean;
  compact: boolean;
  height: number;
  status: Parameters<typeof statusLabel>[0];
  lifted: boolean;
  onLayout: (box: Box) => void;
  onPress: () => void;
  onClose: () => void;
  onMenu: () => void;
  onDragStart: () => void;
  onDrop: (dx: number) => void;
}) {
  const ui = useUiColors();
  const shift = useRef(new Animated.Value(0)).current;
  // A drag ends with a release; that release must not also count as a tap.
  const justDropped = useRef(false);
  const handlers = useRef({ onDragStart, onDrop });
  handlers.current = { onDragStart, onDrop };

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(HOLD_MS)
        .runOnJS(true)
        .onStart(() => {
          justDropped.current = true;
          handlers.current.onDragStart();
        })
        .onUpdate((e) => shift.setValue(e.translationX))
        .onEnd((e) => {
          shift.setValue(0);
          handlers.current.onDrop(e.translationX);
          setTimeout(() => {
            justDropped.current = false;
          }, 100);
        }),
    [shift],
  );

  const Icon = getSessionIcon(session.type);
  const title = displayTitle(session);
  const statusText = statusLabel(status);

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        onLayout={(e) =>
          onLayout({
            x: e.nativeEvent.layout.x,
            width: e.nativeEvent.layout.width,
          })
        }
        style={{
          transform: [{ translateX: shift }, { scale: lifted ? 1.04 : 1 }],
          zIndex: lifted ? 10 : 0,
          opacity: lifted ? 0.9 : 1,
        }}
      >
        <TouchableOpacity
          onPress={() => {
            if (!justDropped.current) onPress();
          }}
          focusable={false}
          accessibilityRole="tab"
          accessibilityState={{ selected: active }}
          accessibilityLabel={statusText ? `${title}, ${statusText}` : title}
          accessibilityHint={
            active ? "Tap for tab options, hold to move" : "Hold to move"
          }
          activeOpacity={0.7}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: active || lifted ? ui.card : "transparent",
            // The open tab gets a brand line, like core's tab bar.
            borderBottomWidth: 2,
            borderBottomColor: active ? ui.brand : "transparent",
            minWidth: compact ? 88 : 104,
            maxWidth: 180,
            height,
          }}
        >
          <View
            style={{
              flexShrink: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingLeft: 10,
              height,
            }}
            onPointerDown={(e) => {
              if (isSecondaryClick(e.nativeEvent)) onMenu();
            }}
          >
            <Icon
              size={compact ? 12 : 13}
              color={active ? ui.brand : ui.textMuted}
              strokeWidth={2}
            />
            <Text
              className="text-xs font-medium"
              style={{ flexShrink: 1, color: active ? ui.text : ui.textMuted }}
              numberOfLines={1}
            >
              {title}
            </Text>
            <TabStatusMark state={status} />
          </View>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onClose();
            }}
            focusable={false}
            accessibilityRole="button"
            accessibilityLabel={`Close ${title}`}
            activeOpacity={0.6}
            style={{
              width: compact ? 28 : 32,
              height,
              alignItems: "center",
              justifyContent: "center",
              marginLeft: "auto",
            }}
          >
            <X
              size={compact ? 13 : 14}
              color={active ? ui.textMuted : ui.textFaint}
              strokeWidth={2.5}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  );
}
