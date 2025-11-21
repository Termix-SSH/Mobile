import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { TerminalHandle } from "./Terminal";
import { getSnippets, getSnippetFolders } from "@/app/main-axios";
import { showToast } from "@/app/utils/toast";

interface Snippet {
  id: number;
  name: string;
  content: string;
  folderId: number | null;
  sortOrder: number;
}

interface SnippetFolder {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
}

interface SnippetsBarProps {
  terminalRef: React.RefObject<TerminalHandle | null>;
  isVisible: boolean;
  height: number;
}

export default function SnippetsBar({
  terminalRef,
  isVisible,
  height,
}: SnippetsBarProps) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [folders, setFolders] = useState<SnippetFolder[]>([]);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<number>>(
    new Set()
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isVisible) {
      loadSnippets();
    }
  }, [isVisible]);

  const loadSnippets = async () => {
    try {
      setLoading(true);
      const [snippetsData, foldersData] = await Promise.all([
        getSnippets(),
        getSnippetFolders(),
      ]);

      setSnippets(
        snippetsData.sort((a: Snippet, b: Snippet) => a.sortOrder - b.sortOrder)
      );
      setFolders(
        foldersData.sort(
          (a: SnippetFolder, b: SnippetFolder) => a.sortOrder - b.sortOrder
        )
      );
    } catch (error) {
      showToast("Failed to load snippets", "error");
    } finally {
      setLoading(false);
    }
  };

  const executeSnippet = (snippet: Snippet) => {
    if (terminalRef.current) {
      terminalRef.current.sendInput(snippet.content + "\n");
      showToast(`Executed: ${snippet.name}`, "success");
    }
  };

  const toggleFolder = (folderId: number) => {
    setCollapsedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  const getSnippetsInFolder = (folderId: number | null) => {
    return snippets.filter((s) => s.folderId === folderId);
  };

  if (!isVisible) return null;

  if (loading) {
    return (
      <View style={[styles.container, { height }]}>
        <ActivityIndicator color="#9333ea" size="small" />
      </View>
    );
  }

  const unfolderedSnippets = getSnippetsInFolder(null);

  return (
    <View style={[styles.container, { height }]}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Snippets</Text>
        <TouchableOpacity onPress={loadSnippets} style={styles.refreshButton}>
          <Text style={styles.refreshText}>↻</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {unfolderedSnippets.map((snippet) => (
          <TouchableOpacity
            key={snippet.id}
            style={styles.snippetItem}
            onPress={() => executeSnippet(snippet)}
          >
            <Text style={styles.snippetName} numberOfLines={1}>
              {snippet.name}
            </Text>
          </TouchableOpacity>
        ))}

        {folders.map((folder) => {
          const folderSnippets = getSnippetsInFolder(folder.id);
          const isCollapsed = collapsedFolders.has(folder.id);

          return (
            <View key={folder.id} style={styles.folderContainer}>
              <TouchableOpacity
                style={[
                  styles.folderHeader,
                  folder.color && { borderLeftColor: folder.color },
                ]}
                onPress={() => toggleFolder(folder.id)}
              >
                <View style={styles.folderHeaderContent}>
                  {folder.icon && (
                    <Text style={styles.folderIcon}>{folder.icon}</Text>
                  )}
                  <Text style={styles.folderName} numberOfLines={1}>
                    {folder.name}
                  </Text>
                  <Text style={styles.folderCount}>({folderSnippets.length})</Text>
                </View>
                <Text style={styles.collapseIcon}>
                  {isCollapsed ? "▶" : "▼"}
                </Text>
              </TouchableOpacity>

              {!isCollapsed &&
                folderSnippets.map((snippet) => (
                  <TouchableOpacity
                    key={snippet.id}
                    style={styles.snippetItemInFolder}
                    onPress={() => executeSnippet(snippet)}
                  >
                    <Text style={styles.snippetName} numberOfLines={1}>
                      {snippet.name}
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>
          );
        })}

        {snippets.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No snippets yet</Text>
            <Text style={styles.emptySubtext}>
              Create snippets in Settings
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
  refreshButton: {
    padding: 4,
  },
  refreshText: {
    fontSize: 18,
    color: "#9333ea",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  snippetItem: {
    backgroundColor: "#18181b",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#303032",
  },
  snippetItemInFolder: {
    backgroundColor: "#18181b",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    marginBottom: 6,
    marginLeft: 16,
    borderWidth: 1,
    borderColor: "#303032",
  },
  snippetName: {
    fontSize: 13,
    color: "#e5e5e7",
    fontWeight: "500",
  },
  folderContainer: {
    marginBottom: 8,
  },
  folderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#18181b",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#303032",
    borderLeftWidth: 3,
    borderLeftColor: "#9333ea",
  },
  folderHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  folderIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  folderName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#e5e5e7",
    flex: 1,
  },
  folderCount: {
    fontSize: 12,
    color: "#888",
    marginLeft: 4,
  },
  collapseIcon: {
    fontSize: 10,
    color: "#888",
    marginLeft: 8,
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
