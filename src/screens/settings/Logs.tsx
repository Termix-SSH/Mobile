import { ScrollView, Share, View } from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Screen } from "@/components/Screen";
import { clearLogs, formatLogs, useLogs } from "@/core/log/buffer";
import { Button, EmptyState, Text } from "@/ui";
import { toast } from "@/utils/toast";
import { t } from "@/i18n";

const LEVEL_COLOR: Record<string, string> = {
  error: "text-destructive-text",
  warn: "text-warning-text",
  success: "text-accent-text",
};

/** The latest log lines from this run of the app, for bug reports. */
export default function Logs() {
  const router = useRouter();
  const lines = useLogs();

  return (
    <Screen
      title={t("settings.logs.logs")}
      subtitle={t("settings.logs.latestLinesFromThisRun")}
      onBack={() => router.back()}
    >
      <View className="flex-row gap-2 border-b border-border px-3 py-2">
        <Button
          variant="muted"
          size="sm"
          disabled={!lines.length}
          onPress={async () => {
            await Clipboard.setStringAsync(formatLogs(lines));
            toast.success(t("settings.logs.logsCopied"));
          }}
        >
          {t("settings.logs.copy")}
        </Button>
        <Button
          variant="muted"
          size="sm"
          disabled={!lines.length}
          onPress={() => void Share.share({ message: formatLogs(lines) })}
        >
          {t("settings.logs.share")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!lines.length}
          onPress={clearLogs}
        >
          {t("settings.logs.clear")}
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
        <EmptyState
          title={t("settings.logs.noLogsYet")}
          hint={t("settings.logs.nothingHasBeenLogged")}
        />
      )}
    </Screen>
  );
}
