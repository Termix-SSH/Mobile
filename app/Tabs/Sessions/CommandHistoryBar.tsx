import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { TerminalHandle } from "./Terminal";
import {
  getCommandHistory,
  deleteCommandFromHistory,
  clearCommandHistory,
} from "@/app/main-axios";
import { showToast } from "@/app/utils/toast";
import { BORDER_COLORS, RADIUS } from "@/app/constants/designTokens";

interface CommandHistoryItem {
  id: number;
  command: string;
  timestamp: string;
  hostId: number;
  hostName: string;
}

interface CommandHistoryBarProps {
  terminalRef: React.RefObject<TerminalHandle | null>;
  isVisible: boolean;
  height: number;
  currentHostId?: number;
}

export default function CommandHistoryBar({
  terminalRef,
  isVisible,
  height,
  currentHostId,
}: CommandHistoryBarProps) {
  const [history, setHistory] = useState<CommandHistoryItem[]>([]);
  const [filteredHistory, setFilteredHistory] = useState<CommandHistoryItem[]>(
    []
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isVisible) {
      loadHistory();
    }
  }, [isVisible]);

  useEffect(() => {
    filterHistory();
  }, [searchQuery, history]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      // Don't load if no currentHostId
      if (!currentHostId) {
        setHistory([]);
        setLoading(false);
        return;
      }
      const historyData = await getCommandHistory();

      // Sort by timestamp descending (most recent first)
      const sortedHistory = historyData.sort(
        (a: CommandHistoryItem, b: CommandHistoryItem) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setHistory(sortedHistory);
    } catch (error) {
      showToast.error("Failed to load command history");
    } finally {
      setLoading(false);
    }
  };

  const filterHistory = () => {
    let filtered = history;

    // Filter by current host if specified
    if (currentHostId) {
      filtered = filtered.filter((item) => item.hostId === currentHostId);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((item) =>
        item.command.toLowerCase().includes(query)
      );
    }

    setFilteredHistory(filtered);
  };

  const executeCommand = (command: string) => {
    if (terminalRef.current) {
      terminalRef.current.sendInput(command + "\n");
      showToast.success("Command executed");
    }
  };

  const deleteCommand = async (commandId: number) => {
    try {
      await deleteCommandFromHistory(commandId);
      setHistory((prev) => prev.filter((item) => item.id !== commandId));
      showToast.success("Command deleted");
    } catch (error) {
      showToast.error("Failed to delete command");
    }
  };

  const clearAll = async () => {
    try {
      await clearCommandHistory();
      setHistory([]);
      showToast.success("History cleared");
    } catch (error) {
      showToast.error("Failed to clear history");
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  if (!isVisible) return null;

  if (loading) {
    return (
      <View className="h-full bg-dark-bg-darkest" style={{ height }}>
        <ActivityIndicator color="#22C55E" size="small" />
      </View>
    );
  }

  return (
    <View className="h-full bg-dark-bg-darkest">
      <View
        className="flex-row justify-between items-center px-3 py-2.5 bg-dark-bg"
        style={{
          borderBottomWidth: 1,
          borderBottomColor: BORDER_COLORS.SECONDARY,
        }}
      >
        <Text className="text-sm font-semibold text-gray-200">Command History</Text>
        <View className="flex-row gap-2">
          <TouchableOpacity onPress={loadHistory} className="p-1">
            <Text className="text-lg text-[#22C55E]">↻</Text>
          </TouchableOpacity>
          {history.length > 0 && (
            <TouchableOpacity onPress={clearAll} className="p-1">
              <Text className="text-base text-red-500">🗑</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View
        className="px-3 py-2.5 bg-dark-bg-darkest"
        style={{
          borderBottomWidth: 1,
          borderBottomColor: BORDER_COLORS.SECONDARY,
        }}
      >
        <TextInput
          className="bg-dark-bg text-gray-200 px-3 py-2 text-[13px]"
          style={{
            borderWidth: 1,
            borderColor: BORDER_COLORS.BUTTON,
            borderRadius: RADIUS.BUTTON,
          }}
          placeholder="Search commands..."
          placeholderTextColor="#666"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <ScrollView
        className="h-full"
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: 12,
        }}
        showsVerticalScrollIndicator={false}
      >
        {filteredHistory.map((item) => (
          <View
            key={item.id}
            className="flex-row bg-dark-bg mb-1.5 overflow-hidden"
            style={{
              borderWidth: 1,
              borderColor: BORDER_COLORS.BUTTON,
              borderRadius: RADIUS.BUTTON,
            }}
          >
            <TouchableOpacity
              className="flex-1 px-3 py-2.5"
              onPress={() => executeCommand(item.command)}
            >
              <Text className="text-[13px] text-gray-200 font-medium font-mono mb-1" numberOfLines={2}>
                {item.command}
              </Text>
              <View className="flex-row justify-between items-center">
                <Text className="text-[11px] text-[#22C55E] font-semibold">{item.hostName}</Text>
                <Text className="text-[11px] text-gray-600">
                  {formatTimestamp(item.timestamp)}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              className="justify-center items-center px-3 bg-[#1a1a1d]"
              onPress={() => deleteCommand(item.id)}
            >
              <Text className="text-2xl text-red-500 font-light">×</Text>
            </TouchableOpacity>
          </View>
        ))}

        {filteredHistory.length === 0 && !searchQuery && (
          <View className="py-8 items-center">
            <Text className="text-sm text-gray-500 font-semibold">No command history yet</Text>
            <Text className="text-xs text-gray-600 mt-1">
              Commands you run will appear here
            </Text>
          </View>
        )}

        {filteredHistory.length === 0 && searchQuery && (
          <View className="py-8 items-center">
            <Text className="text-sm text-gray-500 font-semibold">No matching commands</Text>
            <Text className="text-xs text-gray-600 mt-1">
              Try a different search term
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
