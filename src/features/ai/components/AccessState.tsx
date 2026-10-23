import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Sparkles } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { Button, EmptyState, Text } from "@/ui";
import type { AiAccess } from "../access";

interface AccessStateProps {
  access: AiAccess | "loading";
  error: string | null;
  optIn: () => Promise<void>;
  refreshAccess: () => Promise<void>;
}

export function AccessState({
  access,
  error,
  optIn,
  refreshAccess,
}: AccessStateProps) {
  const color = useThemeColor();
  const [busy, setBusy] = useState(false);
  if (access === "loading") {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator
          accessibilityLabel="Loading AI assistant"
          color={color("accent-brand")}
        />
      </View>
    );
  }
  if (access.state === "ready") return null;

  const titles = {
    "not-installed": "The AI plugin is not installed on this server",
    "disabled-globally":
      "An administrator has to enable the AI assistant in the web admin settings",
    "needs-opt-in": "Enable the AI assistant for your account",
    "signed-out": "Your session expired. Sign in again from Settings.",
    forbidden: "You do not have permission to use the AI assistant",
    error: access.state === "error" ? access.message : "",
  };
  const perform = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 justify-center">
      <EmptyState
        icon={Sparkles}
        title={titles[access.state]}
        hint={
          access.state === "needs-opt-in"
            ? "Chat about your servers with the configured AI provider. Your messages and relevant server information may be sent to that provider. Enable the assistant to continue."
            : undefined
        }
        action={
          access.state === "needs-opt-in" ? (
            <Button loading={busy} onPress={() => void perform(optIn)}>
              Enable AI assistant
            </Button>
          ) : access.state === "error" ? (
            <Button loading={busy} onPress={() => void perform(refreshAccess)}>
              Retry
            </Button>
          ) : undefined
        }
      />
      {error && access.state !== "error" ? (
        <Text
          accessibilityRole="alert"
          className="px-6 text-sm text-destructive"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
