import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { TerminalHandle } from "./Terminal";
import { getSnippets, getSnippetFolders } from "@/app/main-axios";
import { showToast } from "@/app/utils/toast";
import { BORDER_COLORS, RADIUS } from "@/app/constants/designTokens";

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
      showToast.error("Failed to load snippets");
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

  const getSnippetsInFolder = (folderId: number | null) => {
    return snippets.filter((s) => s.folderId === folderId);
  };

  if (!isVisible) return null;

  if (loading) {
    return (
      <View className="h-full bg-dark-bg-darkest" style={{ height }}>
        <ActivityIndicator color="#22C55E" size="small" />
      </View>
    );
  }

  const unfolderedSnippets = getSnippetsInFolder(null);

  return (
    <View className="h-full bg-dark-bg-darkest">
      <View
        className="flex-row justify-between items-center px-3 py-2.5 bg-dark-bg"
        style={{
          borderBottomWidth: 1,
          borderBottomColor: BORDER_COLORS.SECONDARY,
        }}
      >
        <Text className="text-sm font-semibold text-gray-200">Snippets</Text>
        <TouchableOpacity onPress={loadSnippets} className="p-1">
          <Text className="text-lg text-[#22C55E]">↻</Text>
        </TouchableOpacity>
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
        {unfolderedSnippets.map((snippet) => (
          <TouchableOpacity
            key={snippet.id}
            className="bg-dark-bg px-3 py-2.5 mb-1.5"
            style={{
              borderWidth: 1,
              borderColor: BORDER_COLORS.BUTTON,
              borderRadius: RADIUS.BUTTON,
            }}
            onPress={() => executeSnippet(snippet)}
          >
            <Text className="text-[13px] text-gray-200 font-medium" numberOfLines={1}>
              {snippet.name}
            </Text>
          </TouchableOpacity>
        ))}

        {folders.map((folder) => {
          const folderSnippets = getSnippetsInFolder(folder.id);
          const isCollapsed = collapsedFolders.has(folder.id);

          return (
            <View key={folder.id} className="mb-2">
              <TouchableOpacity
                className="flex-row justify-between items-center bg-dark-bg px-3 py-2.5 mb-1.5"
                style={{
                  borderWidth: 1,
                  borderColor: BORDER_COLORS.BUTTON,
                  borderLeftWidth: 3,
                  borderLeftColor: folder.color || "#22C55E",
                  borderRadius: RADIUS.BUTTON,
                }}
                onPress={() => toggleFolder(folder.id)}
              >
                <View className="flex-row items-center flex-1">
                  {folder.icon && (
                    <Text className="text-base mr-2">{folder.icon}</Text>
                  )}
                  <Text className="text-sm font-semibold text-gray-200 flex-1" numberOfLines={1}>
                    {folder.name}
                  </Text>
                  <Text className="text-xs text-gray-500 ml-1">({folderSnippets.length})</Text>
                </View>
                <Text className="text-[10px] text-gray-500 ml-2">
                  {isCollapsed ? "▶" : "▼"}
                </Text>
              </TouchableOpacity>

              {!isCollapsed &&
                folderSnippets.map((snippet) => (
                  <TouchableOpacity
                    key={snippet.id}
                    className="bg-dark-bg px-3 py-2.5 mb-1.5 ml-4"
                    style={{
                      borderWidth: 1,
                      borderColor: BORDER_COLORS.BUTTON,
                      borderRadius: RADIUS.BUTTON,
                    }}
                    onPress={() => executeSnippet(snippet)}
                  >
                    <Text className="text-[13px] text-gray-200 font-medium" numberOfLines={1}>
                      {snippet.name}
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>
          );
        })}

        {snippets.length === 0 && (
          <View className="py-8 items-center">
            <Text className="text-sm text-gray-500 font-semibold">No snippets yet</Text>
            <Text className="text-xs text-gray-600 mt-1">
              Create snippets in Settings
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
