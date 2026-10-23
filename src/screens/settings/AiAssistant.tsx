import { Pressable, View } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useAiChat } from "@/features/ai/useAiChat";
import { Text } from "@/ui";

export default function AiAssistant() {
  const color = useThemeColor();
  const router = useRouter();
  const { access } = useAiChat();

  return (
    <Screen
      title="AI Assistant"
      headerLeft={
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={20} color={color("foreground")} />
        </Pressable>
      }
    >
      <View className="p-4">
        <Text className="text-sm text-muted-foreground">
          {access === "loading" ? "loading" : access.state}
        </Text>
        {access !== "loading" && access.state === "error" && (
          <Text className="mt-2 text-sm text-destructive">
            {access.message}
          </Text>
        )}
      </View>
    </Screen>
  );
}
