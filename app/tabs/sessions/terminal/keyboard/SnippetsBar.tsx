import { useState, useEffect } from "react";
import {
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { TerminalHandle } from "@/app/tabs/sessions/terminal/Terminal";
import { getSnippets, getSnippetFolders } from "@/app/main-axios";
import { BACKGROUNDS, BORDER_COLORS, ACCENT, TEXT_COLORS } from "@/app/constants/designTokens";
import { showToast } from "@/app/utils/toast";

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

/**
 * Snippet runner inside the terminal's custom keyboard. Restyled onto theme
 * tokens (was hardcoded designTokens); behavior/props unchanged.
 */
export default function SnippetsBar({
  terminalRef,
  isVisible,
}: SnippetsBarProps) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [folders, setFolders] = useState<SnippetFolder[]>([]);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<number>>(
    new Set(),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isVisible) loadSnippets();
  }, [isVisible]);

  const loadSnippets = async () => {
    try {
      setLoading(true);
      const [snippetsData, foldersData] = await Promise.all([
        getSnippets().catch(() => []),
        getSnippetFolders().catch(() => []),
      ]);
      const snippetsArray = Array.isArray(snippetsData) ? snippetsData : [];
      const foldersArray = Array.isArray(foldersData) ? foldersData : [];
      setSnippets(
        snippetsArray.sort((a: Snippet, b: Snippet) => a.order - b.order),
      );
      setFolders(foldersArray);
    } catch {
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
      const next = new Set(prev);
      next.has(folderId) ? next.delete(folderId) : next.add(folderId);
      return next;
    });
  };

  const getSnippetsInFolder = (folderName: string | null) =>
    snippets.filter((s) => s.folder === folderName);

  if (!isVisible) return null;

  const unfolderedSnippets = getSnippetsInFolder(null);

  const FolderHeader = ({
    label,
    count,
    accent,
    collapsed,
    onPress,
  }: {
    label: string;
    count: number;
    accent: string;
    collapsed: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: BACKGROUNDS.CARD,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 6,
        borderWidth: 1,
        borderColor: BORDER_COLORS.PRIMARY,
        borderLeftWidth: 3,
        borderLeftColor: accent,
      }}
      onPress={onPress}
    >
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
        <Text
          style={{ fontSize: 13, fontWeight: "500", color: TEXT_COLORS.PRIMARY, flex: 1 }}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text style={{ fontSize: 12, color: TEXT_COLORS.SECONDARY, marginLeft: 4 }}>
          ({count})
        </Text>
      </View>
      <Text style={{ fontSize: 10, color: TEXT_COLORS.TERTIARY, marginLeft: 8 }}>
        {collapsed ? "▶" : "▼"}
      </Text>
    </TouchableOpacity>
  );

  const SnippetRow = ({ snippet }: { snippet: Snippet }) => (
    <TouchableOpacity
      style={{
        backgroundColor: BACKGROUNDS.CARD,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 6,
        marginLeft: 16,
        borderWidth: 1,
        borderColor: BORDER_COLORS.SECONDARY,
      }}
      activeOpacity={0.7}
      onPress={() => executeSnippet(snippet)}
    >
      <Text style={{ fontSize: 13, color: TEXT_COLORS.PRIMARY }} numberOfLines={1}>
        {snippet.name}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: BACKGROUNDS.DARKEST }}>
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={{ fontSize: 13, color: TEXT_COLORS.SECONDARY, marginTop: 12 }}>
            Loading snippets…
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: 12,
          }}
          showsVerticalScrollIndicator={false}
        >
          {unfolderedSnippets.length > 0 && (
            <View style={{ marginBottom: 8 }}>
              <FolderHeader
                label="Uncategorized"
                count={unfolderedSnippets.length}
                accent={TEXT_COLORS.TERTIARY}
                collapsed={collapsedFolders.has(0)}
                onPress={() => toggleFolder(0)}
              />
              {!collapsedFolders.has(0) &&
                unfolderedSnippets.map((s) => (
                  <SnippetRow key={s.id} snippet={s} />
                ))}
            </View>
          )}

          {folders.map((folder) => {
            const folderSnippets = getSnippetsInFolder(folder.name);
            const isCollapsed = collapsedFolders.has(folder.id);
            return (
              <View key={folder.id} style={{ marginBottom: 8 }}>
                <FolderHeader
                  label={folder.name}
                  count={folderSnippets.length}
                  accent={folder.color || ACCENT}
                  collapsed={isCollapsed}
                  onPress={() => toggleFolder(folder.id)}
                />
                {!isCollapsed &&
                  folderSnippets.map((s) => (
                    <SnippetRow key={s.id} snippet={s} />
                  ))}
              </View>
            );
          })}

          {snippets.length === 0 && (
            <View style={{ paddingVertical: 32, alignItems: "center" }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: TEXT_COLORS.SECONDARY }}>
                No snippets yet
              </Text>
              <Text style={{ fontSize: 12, color: TEXT_COLORS.TERTIARY, marginTop: 4 }}>
                Create snippets in the Termix web/desktop version
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
