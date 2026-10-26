import { Pressable, ScrollView, Share, View } from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { ArrowLeft } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { useThemeColor } from "@/contexts/ThemeContext";
import { clearLogs, formatLogs, useLogs } from "@/core/log/buffer";
import { Button, EmptyState, Text } from "@/ui";
import { toast } from "@/utils/toast";

const LEVEL_COLOR: Record<string, string> = {
  error: "text-destructive-text",
  warn: "text-warning-text",
  success: "text-accent-text",
};

/** The latest log lines from this run of the app, for bug reports. */
export default function Logs() {
  const router = useRouter();
  const color = useThemeColor();
  const lines = useLogs();

  return (
    <Screen
      title="Logs"
      subtitle="Latest lines from this run. Secrets are hidden."
      headerLeft={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={8}
        >
          <ArrowLeft size={20} color={color("foreground")} />
        </Pressable>
      }
    >
      <View className="flex-row gap-2 border-b border-border px-3 py-2">
        <Button
          variant="muted"
          size="sm"
          disabled={!lines.length}
          onPress={async () => {
            await Clipboard.setStringAsync(formatLogs(lines));
            toast.success("Logs copied");
          }}
        >
          Copy
        </Button>
        <Button
          variant="muted"
          size="sm"
          disabled={!lines.length}
          onPress={() => void Share.share({ message: formatLogs(lines) })}
        >
          Share
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!lines.length}
          onPress={clearLogs}
        >
          Clear
        </Button>
      </View>
      {lines.length ? (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
          {[...lines].reverse().map((l, i) => (
            <Text
              key={`${l.at}-${i}`}
              selectable
              className={`mb-1 text-2xs ${LEVEL_COLOR[l.level] ?? "text-muted-foreground"}`}
            >
              {l.text}
            </Text>
          ))}
        </ScrollView>
      ) : (
        <EmptyState title="No logs yet" hint="Nothing has been logged." />
      )}
    </Screen>
  );
}
