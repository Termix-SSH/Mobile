import { View } from "react-native";
import { AccordionSection } from "@/ui/Accordion";
import { Text } from "@/ui/Text";
import { Markdown } from "../Markdown";
import type { AiMessage } from "../types";

export interface MessageBubbleProps {
  message: Pick<AiMessage, "role" | "content" | "reasoning">;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const user = message.role === "user";
  return (
    <View
      className={
        user
          ? "max-w-[90%] self-end border border-accent-brand/20 bg-accent-brand/10 px-3 py-2"
          : "w-full min-w-0 gap-3 self-start"
      }
    >
      {user ? (
        <Text selectable className="text-sm leading-relaxed">
          {message.content}
        </Text>
      ) : (
        <>
          {message.reasoning ? (
            <AccordionSection label="Thinking">
              <View className="pt-3">
                <Markdown source={message.reasoning} muted />
              </View>
            </AccordionSection>
          ) : null}
          <Markdown source={message.content} />
        </>
      )}
    </View>
  );
}
