import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { TerminalHandle } from "@/app/tabs/sessions/terminal/Terminal";
import { getSnippets, getSnippetFolders } from "@/app/main-axios";
import { showToast } from "@/app/utils/toast";
import { BORDER_COLORS, RADIUS } from "@/app/constants/designTokens";

interface Snippet {
  id: number;
  name: string;
  content: string;
  description?: string | null;
  folder: string | null;
  order: number;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

interface SnippetFolder {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
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
    new Set(),
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
        getSnippets().catch((err) => {
          console.error("Failed to fetch snippets:", err);
          return [];
        }),
        getSnippetFolders().catch((err) => {
          console.error("Failed to fetch snippet folders:", err);
          return [];
        }),
      ]);

      const snippetsArray = Array.isArray(snippetsData) ? snippetsData : [];
      const foldersArray = Array.isArray(foldersData) ? foldersData : [];

      setSnippets(
        snippetsArray.sort((a: Snippet, b: Snippet) => a.order - b.order),
      );
      setFolders(foldersArray);
    } catch (error) {
      console.error("Failed to load snippets:", error);
      showToast.error("Failed to load snippets");
      setSnippets([]);
      setFolders([]);
    } finally {
      setLoading(false);
    }
  };

  const executeSnippet = (snippet: Snippet) => {
    if (terminalRef.current) {
      terminalRef.current.sendInput(snippet.content + "\n");
      showToast.success(`Executed: ${snippet.name}`);
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

  const getSnippetsInFolder = (folderName: string | null) => {
    return snippets.filter((s) => s.folder === folderName);
  };

  if (!isVisible) return null;

  const unfolderedSnippets = getSnippetsInFolder(null);

  return (
    <View className="h-full bg-background">
      {loading ? (
        <View className="flex-1 items-center justify-center py-12">
          <ActivityIndicator size="large" color="#f59145" />
          <Text className="mt-3 text-sm text-muted-foreground">
            Loading snippets...
          </Text>
        </View>
      ) : (
        <ScrollView
          className="h-full"
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: 12,
          }}
          showsVerticalScrollIndicator={false}
        >
          {unfolderedSnippets.length > 0 && (
            <View key={0} className="mb-2">
              <TouchableOpacity
                className="mb-1.5 flex-row items-center justify-between bg-muted px-3 py-2.5"
                style={{
                  borderWidth: 1,
                  borderColor: BORDER_COLORS.BUTTON,
                  borderLeftWidth: 3,
                  borderLeftColor: "#808080",
                  borderRadius: RADIUS.BUTTON,
                }}
                onPress={() => toggleFolder(0)}
              >
                <View className="flex-1 flex-row items-center">
                  <Text
                    className="flex-1 text-sm font-semibold text-foreground"
                    numberOfLines={1}
                  >
                    Uncategorized
                  </Text>
                  <Text className="ml-1 text-xs text-muted-foreground">
                    ({unfolderedSnippets.length})
                  </Text>
                </View>
                <Text className="ml-2 text-[10px] text-muted-foreground">
                  {collapsedFolders.has(0) ? "▶" : "▼"}
                </Text>
              </TouchableOpacity>

              {!collapsedFolders.has(0) &&
                unfolderedSnippets.map((snippet) => (
                  <TouchableOpacity
                    key={snippet.id}
                    className="mb-1.5 ml-4 bg-muted px-3 py-2.5"
                    style={{
                      borderWidth: 1,
                      borderColor: BORDER_COLORS.BUTTON,
                      borderRadius: RADIUS.BUTTON,
                    }}
                    onPress={() => executeSnippet(snippet)}
                  >
                    <Text
                      className="text-[13px] font-medium text-foreground"
                      numberOfLines={1}
                    >
                      {snippet.name}
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>
          )}

          {folders.map((folder) => {
            const folderSnippets = getSnippetsInFolder(folder.name);
            const isCollapsed = collapsedFolders.has(folder.id);

            return (
              <View key={folder.id} className="mb-2">
                <TouchableOpacity
                  className="mb-1.5 flex-row items-center justify-between bg-muted px-3 py-2.5"
                  style={{
                    borderWidth: 1,
                    borderColor: BORDER_COLORS.BUTTON,
                    borderLeftWidth: 3,
                    borderLeftColor: folder.color || "#f59145",
                    borderRadius: RADIUS.BUTTON,
                  }}
                  onPress={() => toggleFolder(folder.id)}
                >
                  <View className="flex-1 flex-row items-center">
                    <Text
                      className="flex-1 text-sm font-semibold text-foreground"
                      numberOfLines={1}
                    >
                      {folder.name}
                    </Text>
                    <Text className="ml-1 text-xs text-muted-foreground">
                      ({folderSnippets.length})
                    </Text>
                  </View>
                  <Text className="ml-2 text-[10px] text-muted-foreground">
                    {isCollapsed ? "▶" : "▼"}
                  </Text>
                </TouchableOpacity>

                {!isCollapsed &&
                  folderSnippets.map((snippet) => (
                    <TouchableOpacity
                      key={snippet.id}
                      className="mb-1.5 ml-4 bg-muted px-3 py-2.5"
                      style={{
                        borderWidth: 1,
                        borderColor: BORDER_COLORS.BUTTON,
                        borderRadius: RADIUS.BUTTON,
                      }}
                      onPress={() => executeSnippet(snippet)}
                    >
                      <Text
                        className="text-[13px] font-medium text-foreground"
                        numberOfLines={1}
                      >
                        {snippet.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </View>
            );
          })}

          {snippets.length === 0 && (
            <View className="items-center py-8">
              <Text className="text-sm font-semibold text-muted-foreground">
                No snippets yet
              </Text>
              <Text className="mt-1 text-xs text-gray-600">
                Create snippets in the Termix web/desktop version
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
