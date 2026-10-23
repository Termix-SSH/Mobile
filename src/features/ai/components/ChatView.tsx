import { useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button, EmptyState, Input } from "@/ui";
import type { useAiChat } from "../useAiChat";
import { MessageBubble } from "./MessageBubble";
import { ModelPicker } from "./ModelPicker";
import { ProposalCard } from "./ProposalCard";
import { RunView } from "./RunView";

interface ChatViewProps {
  chat: ReturnType<typeof useAiChat>;
  hostName: (id: number) => string | undefined;
}

export function ChatView({ chat, hostName }: ChatViewProps) {
  const [text, setText] = useState("");
  const [busyProposals, setBusyProposals] = useState<number[]>([]);
  const scroll = useRef<ScrollView>(null);
  const streaming = !!chat.run && !chat.run.finished;
  const hasProvider = chat.providers.some(
    (provider) => provider.enabled && provider.id === chat.selectedProviderId,
  );
  const scrollToEnd = () => scroll.current?.scrollToEnd({ animated: false });
  const send = async () => {
    if (!text.trim() || streaming || !hasProvider) return;
    if (await chat.send(text)) setText("");
  };
  const changeProposal = async (id: number, action: "apply" | "reject") => {
    if (busyProposals.includes(id)) return;
    setBusyProposals((previous) => [...previous, id]);
    try {
      await (action === "apply"
        ? chat.applyProposal(id)
        : chat.rejectProposal(id));
    } finally {
      setBusyProposals((previous) => previous.filter((item) => item !== id));
    }
  };

  return (
    <View className="flex-1">
      <View className="border-b border-border px-3 py-1">
        <ModelPicker
          providers={chat.providers}
          selectedProviderId={chat.selectedProviderId}
          selectedModel={chat.selectedModel}
          onProviderChange={chat.setSelectedProviderId}
          onModelChange={chat.setSelectedModel}
          disabled={streaming}
        />
      </View>
      <ScrollView
        ref={scroll}
        className="flex-1"
        accessibilityLabel="Chat messages"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={scrollToEnd}
        onLayout={scrollToEnd}
        contentContainerStyle={{ flexGrow: 1, padding: 16, gap: 16 }}
      >
        {!chat.messages.length && !chat.run ? (
          <EmptyState
            title="Start a conversation"
            hint="Ask a question about your servers."
            className="flex-1"
          />
        ) : null}
        {chat.messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {chat.run ? (
          <RunView
            run={chat.run}
            canResend={chat.canResend}
            onResend={chat.resend}
          />
        ) : null}
        {chat.proposals.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            hostName={hostName}
            busy={busyProposals.includes(proposal.id)}
            onApply={(id) => void changeProposal(id, "apply")}
            onReject={(id) => void changeProposal(id, "reject")}
          />
        ))}
      </ScrollView>
      <View className="flex-row items-end gap-2 border-t border-border p-3">
        <Input
          accessibilityLabel="Message"
          placeholder="Ask the AI assistant…"
          multiline
          value={text}
          onChangeText={setText}
          containerClassName="min-w-0 flex-1"
          className="max-h-32"
        />
        {streaming ? (
          <Button variant="destructive" onPress={chat.cancel}>
            Stop
          </Button>
        ) : (
          <Button disabled={!text.trim() || !hasProvider} onPress={send}>
            Send
          </Button>
        )}
      </View>
    </View>
  );
}
