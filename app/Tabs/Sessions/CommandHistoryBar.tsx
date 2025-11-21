import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
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
      const historyData = await getCommandHistory();

      // Sort by timestamp descending (most recent first)
      const sortedHistory = historyData.sort(
        (a: CommandHistoryItem, b: CommandHistoryItem) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setHistory(sortedHistory);
    } catch (error) {
      showToast("Failed to load command history", "error");
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
      showToast("Command executed", "success");
    }
  };

  const deleteCommand = async (commandId: number) => {
    try {
      await deleteCommandFromHistory(commandId);
      setHistory((prev) => prev.filter((item) => item.id !== commandId));
      showToast("Command deleted", "success");
    } catch (error) {
      showToast("Failed to delete command", "error");
    }
  };

  const clearAll = async () => {
    try {
      await clearCommandHistory();
      setHistory([]);
      showToast("History cleared", "success");
    } catch (error) {
      showToast("Failed to clear history", "error");
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
      <View style={[styles.container, { height }]}>
        <ActivityIndicator color="#9333ea" size="small" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Command History</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={loadHistory} style={styles.iconButton}>
            <Text style={styles.refreshText}>↻</Text>
          </TouchableOpacity>
          {history.length > 0 && (
            <TouchableOpacity onPress={clearAll} style={styles.iconButton}>
              <Text style={styles.clearText}>🗑</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search commands..."
          placeholderTextColor="#666"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredHistory.map((item) => (
          <View key={item.id} style={styles.historyItem}>
            <TouchableOpacity
              style={styles.commandTouchable}
              onPress={() => executeCommand(item.command)}
            >
              <Text style={styles.commandText} numberOfLines={2}>
                {item.command}
              </Text>
              <View style={styles.metaRow}>
                <Text style={styles.hostText}>{item.hostName}</Text>
                <Text style={styles.timestampText}>
                  {formatTimestamp(item.timestamp)}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => deleteCommand(item.id)}
            >
              <Text style={styles.deleteText}>×</Text>
            </TouchableOpacity>
          </View>
        ))}

        {filteredHistory.length === 0 && !searchQuery && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No command history yet</Text>
            <Text style={styles.emptySubtext}>
              Commands you run will appear here
            </Text>
          </View>
        )}

        {filteredHistory.length === 0 && searchQuery && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No matching commands</Text>
            <Text style={styles.emptySubtext}>
              Try a different search term
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#0e0e10",
    borderTopWidth: 1.5,
    borderTopColor: "#303032",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#303032",
  },
  headerText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#e5e5e7",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    padding: 4,
  },
  refreshText: {
    fontSize: 18,
    color: "#9333ea",
  },
  clearText: {
    fontSize: 16,
    color: "#ef4444",
  },
  searchContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#303032",
  },
  searchInput: {
    backgroundColor: "#18181b",
    color: "#e5e5e7",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#303032",
    fontSize: 13,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  historyItem: {
    flexDirection: "row",
    backgroundColor: "#18181b",
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#303032",
    overflow: "hidden",
  },
  commandTouchable: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  commandText: {
    fontSize: 13,
    color: "#e5e5e7",
    fontWeight: "500",
    fontFamily: "monospace",
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hostText: {
    fontSize: 11,
    color: "#9333ea",
    fontWeight: "600",
  },
  timestampText: {
    fontSize: 11,
    color: "#666",
  },
  deleteButton: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
    backgroundColor: "#1a1a1d",
  },
  deleteText: {
    fontSize: 24,
    color: "#ef4444",
    fontWeight: "300",
  },
  emptyContainer: {
    paddingVertical: 32,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#888",
    fontWeight: "600",
  },
  emptySubtext: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
});
