import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { FileText, Play } from "lucide-react-native";
import { useThemeColor } from "@/contexts/ThemeContext";
import { useLiveList, useRepositories } from "@/core/data/hooks";
import { HomeCard } from "@/screens/home/HomeCard";
import type { Snippet } from "@/types";
import { Text } from "@/ui";
import { RunOnHostsSheet } from "./RunOnHostsSheet";

const SHOWN = 6;

/** Snippets that run as-is, first in the user's order. */
export function homeSnippets(list: Snippet[]): Snippet[] {
  return list
    .filter((s) => !s.isNote)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .slice(0, SHOWN);
}

/** The first snippets, each run on hosts picked in a sheet. */
export function SnippetsCard() {
  const repos = useRepositories();
  const color = useThemeColor();
  const list = useLiveList(repos.snippets, () => repos.snippets.list(), [
    repos,
  ]);
  const [running, setRunning] = useState<Snippet | null>(null);
  const shown = homeSnippets(list.data);
  if (shown.length === 0) return null;

  return (
    <HomeCard
      title="Snippets"
      icon={FileText}
      action="All"
      onAction={() => router.push("/tabs/settings/Snippets" as never)}
    >
      <View className="flex-row flex-wrap">
        {shown.map((snippet, index) => (
          <Pressable
            key={snippet.id}
            onPress={() => setRunning(snippet)}
            accessibilityRole="button"
            accessibilityLabel={`Run ${snippet.name}`}
            className={`w-1/2 flex-row items-center gap-2 border-border px-3 py-2.5 active:bg-muted/40 ${index % 2 === 0 ? "border-r" : ""} ${index >= 2 ? "border-t" : ""}`}
          >
            <Play size={13} color={color("accent-brand")} />
            <View className="min-w-0 flex-1">
              <Text className="text-[13px] text-foreground" numberOfLines={1}>
                {snippet.name}
              </Text>
              <Text
                className="font-mono text-[10px] text-muted-foreground"
                numberOfLines={1}
              >
                {snippet.content.split("\n")[0]}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
      <RunOnHostsSheet snippet={running} onClose={() => setRunning(null)} />
    </HomeCard>
  );
}
