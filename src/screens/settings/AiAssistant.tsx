import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useFeatureContext } from "@/core/features/hooks";
import { AccessState } from "@/features/ai/components/AccessState";
import { ChatView } from "@/features/ai/components/ChatView";
import { ConversationList } from "@/features/ai/components/ConversationList";
import { useAiChat } from "@/features/ai/useAiChat";
import { Button, Text } from "@/ui";

export default function AiAssistant() {
  const color = useThemeColor();
  const router = useRouter();
  const { account, client } = useFeatureContext();
  const chat = useAiChat();
  const [view, setView] = useState<"list" | "chat">("list");
  const [hosts, setHosts] = useState<Record<number, string>>({});
  const ready = chat.access !== "loading" && chat.access.state === "ready";

  useEffect(() => {
    setView("list");
    setHosts({});
    let active = true;
    void client?.api.hosts
      .getSSHHosts()
      .then((items) => {
        if (active)
          setHosts(
            Object.fromEntries(items.map((host) => [host.id, host.name])),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [account.id, client]);

  const openConversation = (id: number) => {
    void chat.openConversation(id);
    setView("chat");
  };
  const newChat = () => {
    chat.newConversation();
    setView("chat");
  };
  const back = () => {
    if (ready && view === "chat") {
      chat.cancel();
      setView("list");
    } else {
      router.back();
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Screen
        title={
          ready && view === "chat"
            ? chat.conversations.find((item) => item.id === chat.conversationId)
                ?.title || "New conversation"
            : "AI Assistant"
        }
        headerLeft={
          <Pressable
            onPress={back}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              ready && view === "chat" ? "Back to conversations" : "Back"
            }
          >
            <ArrowLeft size={20} color={color("foreground")} />
          </Pressable>
        }
        headerRight={
          ready && view === "list" ? (
            <Button size="sm" onPress={newChat}>
              New chat
            </Button>
          ) : undefined
        }
      >
        {!ready ? (
          <AccessState
            access={chat.access}
            error={chat.error}
            optIn={chat.optIn}
            refreshAccess={chat.refreshAccess}
          />
        ) : (
          <View className="flex-1">
            {chat.error ? (
              <View className="border-b border-destructive/40 bg-destructive/10 px-4 py-2">
                <Text
                  accessibilityRole="alert"
                  className="text-sm text-destructive"
                >
                  {chat.error}
                </Text>
              </View>
            ) : null}
            {view === "list" ? (
              <ConversationList
                conversations={chat.conversations}
                onOpen={openConversation}
                onDelete={chat.deleteConversation}
                onRefresh={chat.refreshConversations}
                serverUrl={
                  account.kind === "server" ? account.serverUrl : undefined
                }
              />
            ) : (
              <ChatView chat={chat} hostName={(id) => hosts[id]} />
            )}
          </View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
