import { useState } from "react";
import { FlatList, Linking, Pressable, View } from "react-native";
import { MessageSquare, Trash2 } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { EmptyState, ListRow, Text, useConfirm } from "@/ui";
import { toast } from "@/utils/toast";
import type { AiConversation } from "../types";

interface ConversationListProps {
  conversations: AiConversation[];
  onOpen: (id: number) => void;
  onDelete: (id: number) => Promise<void>;
  onRefresh: () => Promise<void>;
  serverUrl?: string;
}

export function ConversationList({
  conversations,
  onOpen,
  onDelete,
  onRefresh,
  serverUrl,
}: ConversationListProps) {
  const color = useThemeColor();
  const confirm = useConfirm();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };
  const remove = async (conversation: AiConversation) => {
    const ok = await confirm({
      title: "Delete conversation?",
      description: `Delete "${conversation.title || "New conversation"}"? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (ok) await onDelete(conversation.id);
  };
  const openWeb = async () => {
    if (!serverUrl) return;
    try {
      const ok = await confirm({
        title: "Open on web?",
        description: serverUrl,
        confirmLabel: "Open",
        destructive: false,
      });
      if (ok) await Linking.openURL(serverUrl);
    } catch {
      toast.error("Could not open link");
    }
  };

  return (
    <View className="flex-1">
      <FlatList
        accessibilityLabel="Conversations"
        data={conversations}
        keyExtractor={(item) => String(item.id)}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        contentContainerStyle={{ flexGrow: 1 }}
        ListEmptyComponent={
          <EmptyState
            icon={MessageSquare}
            title="No conversations yet"
            hint="Tap New chat to start a conversation."
            className="flex-1"
          />
        }
        renderItem={({ item, index }) => (
          <ListRow
            title={item.title || "New conversation"}
            meta={item.updatedAt}
            index={index}
            icon={<MessageSquare size={14} color={color("muted-foreground")} />}
            onPress={() => onOpen(item.id)}
            onLongPress={() => void remove(item)}
            trailing={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.title || "New conversation"}`}
                hitSlop={8}
                className="h-9 w-9 items-center justify-center"
                onPress={(event) => {
                  event.stopPropagation();
                  void remove(item);
                }}
              >
                <Trash2 size={16} color={color("muted-foreground")} />
              </Pressable>
            }
          />
        )}
      />
      {serverUrl ? (
        <View className="items-center border-t border-border p-3">
          <Text
            accessibilityRole="link"
            accessibilityHint="Asks for confirmation before opening"
            className="text-xs text-accent-brand underline"
            onPress={() => void openWeb()}
          >
            Open on web
          </Text>
        </View>
      ) : null}
    </View>
  );
}
