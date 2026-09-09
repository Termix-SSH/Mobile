import { useCallback, useEffect, useState } from "react";
import {
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Trash2 } from "lucide-react-native";
import { TerminalHandle } from "@/app/tabs/sessions/terminal/Terminal";
import {
  getCommandHistory,
  deleteCommandFromHistory,
  clearCommandHistory,
} from "@/app/main-axios";
import {
  BACKGROUNDS,
  BORDER_COLORS,
  ACCENT,
  TEXT_COLORS,
} from "@/app/constants/designTokens";
import { showToast } from "@/app/utils/toast";
import { MONO_FONT } from "@/app/constants/fonts";

interface HistoryBarProps {
  terminalRef: React.RefObject<TerminalHandle | null>;
  hostId?: number;
  isVisible: boolean;
}

/**
 * Recent commands for the active host. Tapping one types it into the terminal
 * without running it, so it can be edited first.
 */
export default function HistoryBar({
  terminalRef,
  hostId,
  isVisible,
}: HistoryBarProps) {
  const [commands, setCommands] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!hostId) {
      setCommands([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setCommands(await getCommandHistory(hostId));
    setLoading(false);
  }, [hostId]);

  useEffect(() => {
    if (isVisible) load();
  }, [isVisible, load]);

  const insert = (command: string) => {
    terminalRef.current?.sendInput(command);
  };

  const remove = async (command: string) => {
    if (!hostId) return;
    setCommands((prev) => prev.filter((c) => c !== command));
    await deleteCommandFromHistory(hostId, command);
  };

  const clearAll = async () => {
    if (!hostId) return;
    setCommands([]);
    await clearCommandHistory(hostId);
    showToast.success("History cleared");
  };

  if (!isVisible) return null;

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: BACKGROUNDS.DARKEST,
        }}
      >
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  if (commands.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: BACKGROUNDS.DARKEST,
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontWeight: "500",
            color: TEXT_COLORS.SECONDARY,
          }}
        >
          No history yet
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: TEXT_COLORS.TERTIARY,
            marginTop: 4,
            textAlign: "center",
            paddingHorizontal: 24,
          }}
        >
          Commands will appear here as you run them
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BACKGROUNDS.DARKEST }}>
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {commands.map((command, idx) => (
          <View
            key={`${command}-${idx}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: BACKGROUNDS.CARD,
              marginBottom: 6,
              borderWidth: 1,
              borderColor: BORDER_COLORS.SECONDARY,
            }}
          >
            <TouchableOpacity
              style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10 }}
              activeOpacity={0.7}
              onPress={() => insert(command)}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: TEXT_COLORS.PRIMARY,
                  fontFamily: MONO_FONT,
                }}
                numberOfLines={1}
              >
                {command}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ paddingHorizontal: 12, paddingVertical: 10 }}
              hitSlop={6}
              onPress={() => remove(command)}
            >
              <Trash2 size={15} color={TEXT_COLORS.TERTIARY} />
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity
          style={{
            marginTop: 6,
            paddingVertical: 10,
            alignItems: "center",
            borderWidth: 1,
            borderColor: BORDER_COLORS.SECONDARY,
          }}
          activeOpacity={0.7}
          onPress={clearAll}
        >
          <Text style={{ fontSize: 12, color: TEXT_COLORS.SECONDARY }}>
            Clear history
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
